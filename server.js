const http = require('node:http');
const nodeFs = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const {
  createAuthSession,
  deleteAuthSession,
  getCmsStatus,
  getCollections,
  getAuthSession,
  getAuthStatus,
  getMediaAssets,
  getMusicArchives,
  importContent,
  initCmsDatabase,
  parseDataSourceForTarget,
  recordUploadedAsset,
  setAdminPassword,
  verifyAdminPassword
} = require('./cms-db');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8000);
const MAX_BODY_BYTES = 1024 * 1024 * 900;
const execFileAsync = promisify(execFile);
const UPLOAD_LIMITS = {
  image: 25 * 1024 * 1024,
  audio: 180 * 1024 * 1024,
  video: 80 * 1024 * 1024,
  download: 250 * 1024 * 1024,
  file: 250 * 1024 * 1024
};
const AUTH_COOKIE_NAME = 'delamanga_admin_session';
const AUTH_SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.ttf': 'font/ttf',
  '.zip': 'application/zip'
};

const DATA_FILES = {
  collections: 'data/collections.js',
  music: 'data/music.js'
};

const DATA_GLOBALS = {
  collections: 'DE_LA_MANGA_COLLECTIONS',
  music: 'DE_LA_MANGA_MUSIC_ARCHIVES'
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function sendRedirect(response, location, status = 302) {
  response.writeHead(status, {
    location,
    'cache-control': 'no-store'
  });
  response.end();
}

function parseCookies(request) {
  const header = request.headers.cookie || '';
  return Object.fromEntries(header
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const index = part.indexOf('=');
      if (index === -1) return [part, ''];
      return [
        decodeURIComponent(part.slice(0, index)),
        decodeURIComponent(part.slice(index + 1))
      ];
    }));
}

function adminSessionFromRequest(request) {
  const cookies = parseCookies(request);
  return getAuthSession(cookies[AUTH_COOKIE_NAME]);
}

function setSessionCookie(response, token, expiresAt) {
  response.setHeader('set-cookie', [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${AUTH_SESSION_MAX_AGE_SECONDS}; Expires=${new Date(expiresAt).toUTCString()}`
  ]);
}

function clearSessionCookie(response) {
  response.setHeader('set-cookie', [
    `${AUTH_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  ]);
}

function requireAdminJson(request, response) {
  const session = adminSessionFromRequest(request);
  if (session) return session;
  sendJson(response, 401, { ok: false, error: 'Admin login required' });
  return null;
}

function adminLoginUrl(request) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  return `/login.html?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`;
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .normalize('NFC')
    .replace(/[\/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'file';
}

function extensionForName(name) {
  return path.extname(String(name || '')).toLowerCase();
}

function uploadKindForFile(file) {
  const ext = extensionForName(file.name);
  const mime = String(file.type || '').toLowerCase();
  if (mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'image';
  if (mime.startsWith('audio/') || ['.wav', '.aif', '.aiff', '.flac', '.mp3'].includes(ext)) return 'audio';
  if (mime.startsWith('video/') || ['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
  if (ext === '.zip') return 'download';
  return 'file';
}

function validateUploadFile(file, buffer) {
  const kind = uploadKindForFile(file);
  const ext = extensionForName(file.name);
  const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.wav', '.aif', '.aiff', '.flac', '.mp3', '.mp4', '.mov', '.webm', '.zip']);
  if (!allowed.has(ext)) {
    throw new Error(`Tipo de archivo no permitido: ${file.name}`);
  }

  const limit = UPLOAD_LIMITS[kind] || UPLOAD_LIMITS.file;
  if (buffer.length > limit) {
    throw new Error(`${file.name} pesa demasiado para ${kind}: max ${Math.round(limit / 1024 / 1024)} MB`);
  }
}

function safeResolve(relativePath) {
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    throw new Error('Path escapes project root');
  }
  return resolved;
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('Request body too large');
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(request) {
  const body = await readRequestBody(request);
  return body ? JSON.parse(body) : {};
}

async function backupFile(filePath) {
  try {
    await fs.access(filePath);
  } catch (error) {
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.bak-${stamp}`;
  await fs.copyFile(filePath, backupPath);
  return path.relative(ROOT, backupPath);
}

function entriesForTarget(target) {
  if (target === 'music') return getMusicArchives();
  if (target === 'collections') return getCollections();
  throw new Error('Invalid data target');
}

function importEntriesForTarget(target, entries) {
  if (!Array.isArray(entries)) {
    throw new Error('Entries must be an array');
  }
  if (target === 'music') {
    importContent({ music: entries });
    return;
  }
  if (target === 'collections') {
    importContent({ collections: entries });
    return;
  }
  throw new Error('Invalid data target');
}

function publicSourceForTarget(target) {
  const globalName = DATA_GLOBALS[target];
  const entries = entriesForTarget(target);
  return `window.${globalName} = ${JSON.stringify(entries, null, 2)};\n`;
}

async function writePublicDataFile(target, options = {}) {
  const targetFile = DATA_FILES[target];
  if (!targetFile) throw new Error('Invalid data target');

  const filePath = safeResolve(targetFile);
  let currentSource = null;
  const source = publicSourceForTarget(target);
  try {
    currentSource = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    currentSource = null;
  }

  const changed = currentSource !== source;
  const shouldBackup = changed && options.backup !== false;
  const backup = shouldBackup ? await backupFile(filePath) : null;
  if (changed) {
    await fs.writeFile(filePath, source, 'utf8');
  }
  return {
    file: targetFile,
    backup,
    changed,
    entries: entriesForTarget(target)
  };
}

async function handleWriteData(request, response) {
  const body = await readJson(request);
  const target = body.target;

  if (!DATA_FILES[target] || typeof body.source !== 'string') {
    sendJson(response, 400, { ok: false, error: 'Invalid write-data payload' });
    return;
  }

  importContent(parseDataSourceForTarget(target, body.source));
  const result = await writePublicDataFile(target, { backup: body.backup !== false });
  sendJson(response, 200, {
    ok: true,
    ...result,
    cms: getCmsStatus()
  });
}

async function handleSaveCmsContent(request, response) {
  const body = await readJson(request);
  const target = body.target;

  if (!DATA_FILES[target] || !Array.isArray(body.entries)) {
    sendJson(response, 400, { ok: false, error: 'Invalid cms content payload' });
    return;
  }

  importEntriesForTarget(target, body.entries);
  const result = await writePublicDataFile(target, { backup: body.backup !== false });
  sendJson(response, 200, {
    ok: true,
    ...result,
    cms: getCmsStatus()
  });
}

async function handleUpload(request, response) {
  const body = await readJson(request);
  const baseDir = String(body.baseDir || '');
  const files = Array.isArray(body.files) ? body.files : [];

  if (!baseDir.startsWith('assets/') || !files.length) {
    sendJson(response, 400, { ok: false, error: 'Invalid upload payload' });
    return;
  }

  const targetDir = safeResolve(baseDir);
  await fs.mkdir(targetDir, { recursive: true });

  const saved = [];
  for (const file of files) {
    const name = sanitizeFileName(file.name);
    const data = String(file.dataBase64 || '');
    const buffer = Buffer.from(data, 'base64');
    validateUploadFile({ ...file, name }, buffer);
    const filePath = safeResolve(path.join(baseDir, name));
    await fs.writeFile(filePath, buffer);
    const savedFile = {
      name,
      path: path.relative(ROOT, filePath).split(path.sep).join('/'),
      size: buffer.length
    };
    savedFile.assetId = recordUploadedAsset(savedFile);
    saved.push(savedFile);
  }

  sendJson(response, 200, { ok: true, files: saved });
}

async function git(args, options = {}) {
  const result = await execFileAsync('git', args, {
    cwd: ROOT,
    maxBuffer: 1024 * 1024 * 4,
    timeout: options.timeout || 120000
  });
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

async function hasStagedChanges() {
  try {
    await git(['diff', '--cached', '--quiet']);
    return false;
  } catch (error) {
    if (error.code === 1) return true;
    throw error;
  }
}

async function handlePublishToGitHub(request, response) {
  const body = await readJson(request);
  const rawMessage = String(body.message || '').trim();
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const message = rawMessage || `Publish CMS content ${stamp}`;

  await git(['add', 'assets', 'data/collections.js', 'data/image-metadata.js', 'data/music.js']);
  if (!(await hasStagedChanges())) {
    sendJson(response, 200, {
      ok: true,
      changed: false,
      message: 'No hay cambios de contenido para publicar.'
    });
    return;
  }

  await git(['commit', '-m', message]);
  await git(['push', 'origin', 'main'], { timeout: 600000 });
  const sha = await git(['rev-parse', '--short', 'HEAD']);

  sendJson(response, 200, {
    ok: true,
    changed: true,
    commit: sha,
    message: `Publicado en GitHub: ${sha}`
  });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = safeResolve(pathname.slice(1));
  const stat = await fs.stat(filePath);

  if (stat.isDirectory()) {
    const indexPath = path.join(filePath, 'index.html');
    await fs.access(indexPath);
    return streamFile(indexPath, request, response);
  }

  return streamFile(filePath, request, response);
}

async function streamFile(filePath, request, response) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const stat = await fs.stat(filePath);

  response.writeHead(200, {
    'content-type': contentType,
    'content-length': stat.size,
    'cache-control': 'no-cache'
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  nodeFs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (request.method === 'GET' && pathname === '/api/auth/session') {
      const session = adminSessionFromRequest(request);
      const auth = getAuthStatus();
      sendJson(response, 200, {
        ok: true,
        authenticated: Boolean(session),
        setupRequired: auth.setupRequired,
        user: session ? {
          name: session.name,
          email: session.email,
          role: session.role
        } : null
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJson(request);
      const password = String(body.password || '');
      const auth = getAuthStatus();
      let admin = null;

      if (password.length < 8) {
        sendJson(response, 400, { ok: false, error: 'La clave debe tener al menos 8 caracteres.' });
        return;
      }

      if (auth.setupRequired) {
        admin = setAdminPassword(password);
      } else {
        admin = verifyAdminPassword(password);
        if (!admin) {
          sendJson(response, 401, { ok: false, error: 'Clave incorrecta.' });
          return;
        }
      }

      const session = createAuthSession(admin.id);
      setSessionCookie(response, session.token, session.expiresAt);
      sendJson(response, 200, {
        ok: true,
        setupCompleted: auth.setupRequired,
        user: {
          name: admin.name,
          email: admin.email,
          role: admin.role
        }
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/api/auth/logout') {
      const cookies = parseCookies(request);
      deleteAuthSession(cookies[AUTH_COOKIE_NAME]);
      clearSessionCookie(response);
      sendJson(response, 200, { ok: true });
      return;
    }

    const protectedAdminAssets = pathname === '/admin.html' || pathname === '/admin.js';
    if ((request.method === 'GET' || request.method === 'HEAD') && protectedAdminAssets && !adminSessionFromRequest(request)) {
      if (pathname === '/admin.html') {
        sendRedirect(response, adminLoginUrl(request));
        return;
      }
      sendJson(response, 401, { ok: false, error: 'Admin login required' });
      return;
    }

    const protectedApi =
      pathname.startsWith('/api/cms') ||
      pathname === '/api/write-data' ||
      pathname === '/api/upload' ||
      pathname === '/api/publish/github';
    if (protectedApi && !requireAdminJson(request, response)) {
      return;
    }

    if (request.method === 'GET' && pathname === '/api/health') {
      sendJson(response, 200, { ok: true, root: ROOT, cms: getCmsStatus() });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/cms/status') {
      sendJson(response, 200, { ok: true, cms: getCmsStatus() });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/cms/content') {
      sendJson(response, 200, {
        ok: true,
        collections: getCollections(),
        musicArchives: getMusicArchives(),
        cms: getCmsStatus()
      });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/cms/music-archives') {
      sendJson(response, 200, { ok: true, musicArchives: getMusicArchives() });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/cms/collections') {
      sendJson(response, 200, { ok: true, collections: getCollections() });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/cms/media-assets') {
      sendJson(response, 200, { ok: true, mediaAssets: getMediaAssets() });
      return;
    }

    if (request.method === 'POST' && pathname === '/api/write-data') {
      await handleWriteData(request, response);
      return;
    }

    if (request.method === 'POST' && pathname === '/api/cms/content') {
      await handleSaveCmsContent(request, response);
      return;
    }

    if (request.method === 'POST' && pathname === '/api/upload') {
      await handleUpload(request, response);
      return;
    }

    if (request.method === 'POST' && pathname === '/api/publish/github') {
      await handlePublishToGitHub(request, response);
      return;
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      await serveStatic(request, response);
      return;
    }

    sendJson(response, 405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    const status = error.code === 'ENOENT' ? 404 : 500;
    sendJson(response, status, { ok: false, error: error.message });
  }
});

const cms = initCmsDatabase();

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El backend ya está corriendo en http://localhost:${PORT}/. No abras otra instancia de server.js.`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, () => {
  console.log(`De La Manga local backend running at http://localhost:${PORT}/`);
  console.log(`CMS database: ${cms.dbPath}`);
});
