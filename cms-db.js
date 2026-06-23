const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'delamanga-cms.sqlite');

const PERMISSIONS = [
  ['content.read', 'Ver contenido publicado'],
  ['content.create', 'Crear contenido'],
  ['content.update', 'Editar contenido'],
  ['content.delete', 'Eliminar contenido'],
  ['media.upload', 'Subir archivos'],
  ['publish.write', 'Publicar cambios']
];

let db;

function initCmsDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON;');
  createSchema();
  seedSecurityModel();
  seedFromCurrentDataIfEmpty();
  scanResourceAssets();
  return getCmsStatus();
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      status TEXT NOT NULL DEFAULT 'reserved',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL UNIQUE,
      mime_type TEXT,
      size_bytes INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS music_archives (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      release_type TEXT NOT NULL,
      year TEXT,
      total_duration TEXT,
      cover_asset_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
      back_href TEXT,
      back_label TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY,
      archive_id INTEGER NOT NULL REFERENCES music_archives(id) ON DELETE CASCADE,
      number TEXT NOT NULL,
      title TEXT NOT NULL,
      duration TEXT,
      audio_asset_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS archive_sections (
      id INTEGER PRIMARY KEY,
      archive_id INTEGER NOT NULL REFERENCES music_archives(id) ON DELETE CASCADE,
      section_key TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      background_asset_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
      image_asset_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
      alt TEXT,
      body TEXT,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS archive_links (
      id INTEGER PRIMARY KEY,
      archive_id INTEGER NOT NULL REFERENCES music_archives(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY,
      archive_id INTEGER NOT NULL REFERENCES music_archives(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      file_asset_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
      url TEXT NOT NULL,
      filename TEXT,
      format TEXT,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT,
      cover_asset_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
      href TEXT,
      summary TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS collection_tags (
      id INTEGER PRIMARY KEY,
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collection_items (
      id INTEGER PRIMARY KEY,
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      media_asset_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
      alt TEXT,
      caption TEXT,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  ensureColumn('music_archives', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('collections', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some(item => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

function seedSecurityModel() {
  const insertRole = db.prepare(`
    INSERT INTO roles (name, description)
    VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET description = excluded.description
  `);
  insertRole.run('visitor', 'Visitante público con permisos de lectura');
  insertRole.run('admin', 'Administrador del CMS local');

  const insertPermission = db.prepare(`
    INSERT INTO permissions (code, description)
    VALUES (?, ?)
    ON CONFLICT(code) DO UPDATE SET description = excluded.description
  `);
  for (const permission of PERMISSIONS) {
    insertPermission.run(permission[0], permission[1]);
  }

  const visitorRole = getRoleId('visitor');
  const adminRole = getRoleId('admin');
  grantRolePermission(visitorRole, 'content.read');
  for (const permission of PERMISSIONS) {
    grantRolePermission(adminRole, permission[0]);
  }

  db.prepare(`
    INSERT INTO users (name, email, role_id, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      role_id = excluded.role_id,
      status = users.status,
      updated_at = CURRENT_TIMESTAMP
  `).run('Administrador local', 'admin@local.delamanga', adminRole, 'reserved');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const key = crypto.pbkdf2Sync(String(password), salt, 210000, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$210000$${salt}$${key}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [scheme, iterations, salt, expected] = String(storedHash).split('$');
  if (scheme !== 'pbkdf2_sha256' || !iterations || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(String(password), salt, Number(iterations), 32, 'sha256').toString('hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function getAdminUser() {
  return db.prepare(`
    SELECT users.id, users.name, users.email, users.password_hash AS passwordHash, users.status, roles.name AS role
    FROM users
    JOIN roles ON roles.id = users.role_id
    WHERE roles.name = 'admin'
    ORDER BY users.id
    LIMIT 1
  `).get();
}

function getAuthStatus() {
  const admin = getAdminUser();
  return {
    adminEmail: admin?.email || 'admin@local.delamanga',
    setupRequired: !admin?.passwordHash,
    adminActive: Boolean(admin?.passwordHash && admin.status === 'active')
  };
}

function setAdminPassword(password) {
  const cleanPassword = String(password || '');
  if (cleanPassword.length < 8) {
    throw new Error('La clave debe tener al menos 8 caracteres.');
  }

  const admin = getAdminUser();
  if (!admin) throw new Error('No existe usuario administrador.');

  db.prepare(`
    UPDATE users
    SET password_hash = ?, status = 'active', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(hashPassword(cleanPassword), admin.id);

  return getAdminUser();
}

function verifyAdminPassword(password) {
  const admin = getAdminUser();
  if (!admin?.passwordHash || admin.status !== 'active') return null;
  return verifyPassword(password, admin.passwordHash) ? admin : null;
}

function createAuthSession(userId, ttlDays = 14) {
  cleanupExpiredAuthSessions();
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO auth_sessions (token_hash, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(tokenHash, userId, expiresAt);
  return { token, expiresAt };
}

function getAuthSession(token) {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const session = db.prepare(`
    SELECT
      auth_sessions.token_hash AS tokenHash,
      auth_sessions.expires_at AS expiresAt,
      users.id AS userId,
      users.name,
      users.email,
      users.status,
      roles.name AS role
    FROM auth_sessions
    JOIN users ON users.id = auth_sessions.user_id
    JOIN roles ON roles.id = users.role_id
    WHERE auth_sessions.token_hash = ?
  `).get(tokenHash);

  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    deleteAuthSession(token);
    return null;
  }
  if (session.role !== 'admin' || session.status !== 'active') return null;

  db.prepare('UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?').run(tokenHash);
  return session;
}

function deleteAuthSession(token) {
  if (!token) return;
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hashSessionToken(token));
}

function cleanupExpiredAuthSessions() {
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(new Date().toISOString());
}

function getRoleId(name) {
  return db.prepare('SELECT id FROM roles WHERE name = ?').get(name).id;
}

function grantRolePermission(roleId, code) {
  const permission = db.prepare('SELECT id FROM permissions WHERE code = ?').get(code);
  if (!permission) return;
  db.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    VALUES (?, ?)
  `).run(roleId, permission.id);
}

function seedFromCurrentDataIfEmpty() {
  const archiveCount = db.prepare('SELECT COUNT(*) AS count FROM music_archives').get().count;
  const collectionCount = db.prepare('SELECT COUNT(*) AS count FROM collections').get().count;
  if (archiveCount || collectionCount) return;

  const music = readWindowDataFile('music-data.js', 'DE_LA_MANGA_MUSIC_ARCHIVES');
  const collections = readWindowDataFile('portfolio-data.js', 'DE_LA_MANGA_COLLECTIONS');
  importContent({ music, collections });
}

function readWindowDataFile(fileName, variableName) {
  const filePath = path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) return [];
  const source = fs.readFileSync(filePath, 'utf8');
  return parseWindowDataSource(source, variableName);
}

function parseWindowDataSource(source, variableName) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context, { timeout: 1000 });
  const value = context.window[variableName];
  return Array.isArray(value) ? value : [];
}

function parseDataSourceForTarget(target, source) {
  if (target === 'music') {
    return { music: parseWindowDataSource(source, 'DE_LA_MANGA_MUSIC_ARCHIVES') };
  }
  if (target === 'collections') {
    return { collections: parseWindowDataSource(source, 'DE_LA_MANGA_COLLECTIONS') };
  }
  return {};
}

function importContent({ music, collections }) {
  transaction(() => {
    if (Array.isArray(music)) replaceMusicArchives(music);
    if (Array.isArray(collections)) replaceCollections(collections);
    scanResourceAssets();
  });
}

function transaction(callback) {
  db.exec('BEGIN');
  try {
    callback();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function replaceMusicArchives(archives) {
  db.exec(`
    DELETE FROM downloads;
    DELETE FROM archive_links;
    DELETE FROM archive_sections;
    DELETE FROM tracks;
    DELETE FROM music_archives;
  `);

  const insertArchive = db.prepare(`
    INSERT INTO music_archives (
      slug, title, artist, release_type, year, total_duration, cover_asset_id,
      back_href, back_label, status, sort_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTrack = db.prepare(`
    INSERT INTO tracks (archive_id, number, title, duration, audio_asset_id, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertSection = db.prepare(`
    INSERT INTO archive_sections (
      archive_id, section_key, type, title, background_asset_id,
      image_asset_id, alt, body, sort_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLink = db.prepare(`
    INSERT INTO archive_links (archive_id, platform, label, url, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertDownload = db.prepare(`
    INSERT INTO downloads (archive_id, label, file_asset_id, url, filename, format, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  archives.forEach((archive, archiveIndex) => {
    const coverAssetId = upsertAsset(archive.cover, {
      title: `${archive.title || archive.id || 'Release'} cover`
    });
    const result = insertArchive.run(
      archive.id || slugify(archive.title || 'release'),
      archive.title || 'Sin título',
      archive.artist || 'De La Manga',
      archive.releaseType || 'single',
      archive.year || '',
      archive.totalDuration || '',
      coverAssetId,
      archive.backHref || 'musica.html',
      archive.backLabel || 'Volver a música',
      archive.status || 'published',
      archiveIndex
    );
    const archiveId = Number(result.lastInsertRowid);

    (archive.tracks || []).forEach((track, index) => {
      const audioAssetId = upsertAsset(track.webAudio, {
        title: track.title || `Track ${index + 1}`
      });
      insertTrack.run(
        archiveId,
        track.number || String(index + 1).padStart(2, '0'),
        track.title || `Track ${index + 1}`,
        track.duration || '',
        audioAssetId,
        index
      );
    });

    (archive.sections || []).forEach((section, index) => {
      const backgroundAssetId = upsertAsset(section.background, {
        title: `${archive.title || archive.id || 'Release'} background ${index + 1}`
      });
      const imageAssetId = upsertAsset(section.image, {
        title: section.alt || `${archive.title || archive.id || 'Release'} image ${index + 1}`
      });
      insertSection.run(
        archiveId,
        section.id || sectionIdFromType(section.type, index),
        section.type || 'image',
        section.title || '',
        backgroundAssetId,
        imageAssetId,
        section.alt || '',
        section.body || '',
        index
      );
    });

    (archive.links || []).forEach((link, index) => {
      insertLink.run(
        archiveId,
        link.platform || 'external',
        link.label || link.platform || 'Link',
        link.href || '',
        index
      );
    });

    (archive.downloads || []).forEach((download, index) => {
      const fileAssetId = upsertAsset(download.href, {
        title: download.label || download.filename || `Download ${index + 1}`
      });
      insertDownload.run(
        archiveId,
        download.label || 'Descarga',
        fileAssetId,
        download.href || '',
        download.filename || '',
        download.format || '',
        index
      );
    });
  });
}

function replaceCollections(collections) {
  db.exec(`
    DELETE FROM collection_items;
    DELETE FROM collection_tags;
    DELETE FROM collections;
  `);

  const insertCollection = db.prepare(`
    INSERT INTO collections (slug, title, type, status, cover_asset_id, href, summary, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTag = db.prepare(`
    INSERT INTO collection_tags (collection_id, tag, sort_order)
    VALUES (?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO collection_items (collection_id, media_asset_id, alt, caption, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  collections.forEach((collection, collectionIndex) => {
    const coverAssetId = upsertAsset(collection.cover, {
      title: `${collection.title || collection.id || 'Colección'} cover`
    });
    const result = insertCollection.run(
      collection.id || slugify(collection.title || 'coleccion'),
      collection.title || 'Sin título',
      collection.type || 'Archivo',
      collection.status || '',
      coverAssetId,
      collection.href || '',
      collection.summary || '',
      collectionIndex
    );
    const collectionId = Number(result.lastInsertRowid);

    (collection.tags || []).forEach((tag, index) => {
      insertTag.run(collectionId, String(tag), index);
    });

    (collection.items || []).forEach((item, index) => {
      const mediaAssetId = upsertAsset(item.src, {
        title: item.alt || item.caption || `${collection.title || collection.id || 'Colección'} item ${index + 1}`
      });
      insertItem.run(
        collectionId,
        mediaAssetId,
        item.alt || '',
        item.caption || '',
        index
      );
    });
  });
}

function upsertAsset(filePath, options = {}) {
  if (!isLocalAssetPath(filePath)) return null;
  const safePath = String(filePath).trim();
  const type = inferAssetType(safePath);
  const title = options.title || titleFromPath(safePath);
  const mimeType = inferMimeType(safePath);
  const sizeBytes = localFileSize(safePath);

  const row = db.prepare(`
    INSERT INTO media_assets (type, title, file_path, mime_type, size_bytes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      type = excluded.type,
      title = COALESCE(NULLIF(excluded.title, ''), media_assets.title),
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `).get(type, title, safePath, mimeType, sizeBytes);
  return row.id;
}

function recordUploadedAsset(file) {
  const assetId = upsertAsset(file.path, {
    title: titleFromPath(file.path)
  });
  return assetId;
}

function scanResourceAssets() {
  const root = path.join(__dirname, 'resources');
  if (!fs.existsSync(root)) return;

  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = path.relative(__dirname, absolute).split(path.sep).join('/');
      upsertAsset(relative);
    }
  };

  walk(root);
  pruneMissingMediaAssets();
}

function pruneMissingMediaAssets() {
  const rows = db.prepare(`
    SELECT id, file_path AS filePath
    FROM media_assets
    WHERE file_path LIKE 'resources/%'
  `).all();
  const remove = db.prepare('DELETE FROM media_assets WHERE id = ?');

  rows.forEach(row => {
    const absolute = path.join(__dirname, row.filePath);
    if (!fs.existsSync(absolute)) remove.run(row.id);
  });
}

function isLocalAssetPath(filePath) {
  const value = String(filePath || '').trim();
  return Boolean(value) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && value.startsWith('resources/');
}

function localFileSize(filePath) {
  try {
    const absolute = path.join(__dirname, filePath);
    return fs.statSync(absolute).size;
  } catch (error) {
    return null;
  }
}

function inferAssetType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.mp3', '.wav', '.flac', '.aif', '.aiff'].includes(ext)) return 'audio';
  if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext)) return 'image';
  if (['.zip', '.rar', '.7z'].includes(ext)) return 'download';
  return 'file';
}

function inferMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.aif': 'audio/aiff',
    '.aiff': 'audio/aiff',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.zip': 'application/zip'
  };
  return map[ext] || null;
}

function titleFromPath(filePath) {
  const name = path.basename(String(filePath || ''), path.extname(String(filePath || '')));
  return name.replace(/[-_]+/g, ' ').trim() || 'Archivo';
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entrada';
}

function sectionIdFromType(type, index) {
  const prefix = type === 'player' ? 'player' : type === 'cover' ? 'cover' : type === 'text' ? 'text' : 'graphic';
  return `${prefix}-${String(index + 1).padStart(2, '0')}`;
}

function getCmsStatus() {
  return {
    dbPath: DB_PATH,
    counts: {
      users: countRows('users'),
      mediaAssets: countRows('media_assets'),
      musicArchives: countRows('music_archives'),
      tracks: countRows('tracks'),
      collections: countRows('collections'),
      collectionItems: countRows('collection_items')
    },
    roles: db.prepare(`
      SELECT roles.name, roles.description, COUNT(role_permissions.permission_id) AS permissionCount
      FROM roles
      LEFT JOIN role_permissions ON role_permissions.role_id = roles.id
      GROUP BY roles.id
      ORDER BY roles.name
    `).all()
  };
}

function countRows(table) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

function getMusicArchives() {
  const archives = db.prepare(`
    SELECT music_archives.*, cover.file_path AS cover
    FROM music_archives
    LEFT JOIN media_assets AS cover ON cover.id = music_archives.cover_asset_id
    ORDER BY music_archives.sort_order, music_archives.id
  `).all();

  return archives.map(archive => ({
    id: archive.slug,
    title: archive.title,
    artist: archive.artist,
    releaseType: archive.release_type,
    year: archive.year,
    totalDuration: archive.total_duration,
    cover: archive.cover || '',
    backHref: archive.back_href,
    backLabel: archive.back_label,
    status: archive.status,
    links: getArchiveLinks(archive.id),
    downloads: getArchiveDownloads(archive.id),
    sections: getArchiveSections(archive.id),
    tracks: getArchiveTracks(archive.id)
  }));
}

function getArchiveTracks(archiveId) {
  return db.prepare(`
    SELECT tracks.number, tracks.title, tracks.duration, audio.file_path AS webAudio
    FROM tracks
    LEFT JOIN media_assets AS audio ON audio.id = tracks.audio_asset_id
    WHERE tracks.archive_id = ?
    ORDER BY tracks.sort_order
  `).all(archiveId);
}

function getArchiveSections(archiveId) {
  return db.prepare(`
    SELECT
      archive_sections.section_key AS id,
      archive_sections.type,
      archive_sections.title,
      background.file_path AS background,
      image.file_path AS image,
      archive_sections.alt,
      archive_sections.body
    FROM archive_sections
    LEFT JOIN media_assets AS background ON background.id = archive_sections.background_asset_id
    LEFT JOIN media_assets AS image ON image.id = archive_sections.image_asset_id
    WHERE archive_sections.archive_id = ?
    ORDER BY archive_sections.sort_order
  `).all(archiveId);
}

function getArchiveLinks(archiveId) {
  return db.prepare(`
    SELECT label, platform, url AS href
    FROM archive_links
    WHERE archive_id = ?
    ORDER BY sort_order
  `).all(archiveId);
}

function getArchiveDownloads(archiveId) {
  return db.prepare(`
    SELECT downloads.label, COALESCE(asset.file_path, downloads.url) AS href, downloads.filename, downloads.format
    FROM downloads
    LEFT JOIN media_assets AS asset ON asset.id = downloads.file_asset_id
    WHERE downloads.archive_id = ?
    ORDER BY downloads.sort_order
  `).all(archiveId);
}

function getCollections() {
  const collections = db.prepare(`
    SELECT collections.*, cover.file_path AS cover
    FROM collections
    LEFT JOIN media_assets AS cover ON cover.id = collections.cover_asset_id
    ORDER BY collections.sort_order, collections.id
  `).all();

  return collections.map(collection => ({
    id: collection.slug,
    title: collection.title,
    type: collection.type,
    status: collection.status,
    cover: collection.cover || '',
    href: collection.href || '',
    summary: collection.summary || '',
    tags: getCollectionTags(collection.id),
    items: getCollectionItems(collection.id)
  }));
}

function getMediaAssets() {
  scanResourceAssets();
  return db.prepare(`
    SELECT
      id,
      type,
      title,
      file_path AS filePath,
      mime_type AS mimeType,
      size_bytes AS sizeBytes,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM media_assets
    ORDER BY updated_at DESC, id DESC
  `).all();
}

function getCollectionTags(collectionId) {
  return db.prepare(`
    SELECT tag
    FROM collection_tags
    WHERE collection_id = ?
    ORDER BY sort_order
  `).all(collectionId).map(row => row.tag);
}

function getCollectionItems(collectionId) {
  return db.prepare(`
    SELECT asset.file_path AS src, collection_items.alt, collection_items.caption
    FROM collection_items
    LEFT JOIN media_assets AS asset ON asset.id = collection_items.media_asset_id
    WHERE collection_items.collection_id = ?
    ORDER BY collection_items.sort_order
  `).all(collectionId);
}

module.exports = {
  DB_PATH,
  cleanupExpiredAuthSessions,
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
};
