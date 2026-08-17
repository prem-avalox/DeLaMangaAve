(async function () {
  const COLLECTIONS_KEY = 'de-la-manga-collections-draft';
  const MUSIC_KEY = 'de-la-manga-music-archives-draft';
  const app = document.querySelector('[data-admin-app]');
  if (!app) return;

  if (!(await ensureAdminSession())) return;

  const tabs = Array.from(app.querySelectorAll('[data-mode]'));
  const listEl = app.querySelector('[data-entry-list]');
  const form = app.querySelector('[data-editor-form]');
  const fieldsEl = app.querySelector('[data-form-fields]');
  const statusEl = app.querySelector('[data-status]');
  const editorTitle = app.querySelector('[data-editor-title]');
  const sidebarKicker = app.querySelector('[data-sidebar-kicker]');
  const sidebarTitle = app.querySelector('[data-sidebar-title]');
  const outputHelp = app.querySelector('[data-output-help]');
  const exportButton = app.querySelector('[data-action="download-js"]');
  const PROJECT_SAVE_DELAY = 1200;
  const PUBLICATION_STATUSES = [
    { value: 'draft', label: 'Borrador', detail: 'Solo visible en el admin' },
    { value: 'published', label: 'Publicado', detail: 'Visible en la web pública' },
    { value: 'archived', label: 'Oculto / archivado', detail: 'No aparece en la web pública' }
  ];
  const COLLECTION_TYPES = [
    { value: 'Fotografía', label: 'Fotografía', detail: 'Series y ensayos fotográficos' },
    { value: 'Sesión', label: 'Sesión', detail: 'Sesiones fotográficas por persona, fecha o estética' },
    { value: 'Retrato', label: 'Retrato', detail: 'Retratos individuales o selección de rostros' },
    { value: 'Calle', label: 'Calle', detail: 'Fotografía urbana, caminatas y observación de calle' },
    { value: 'Paisaje', label: 'Paisaje', detail: 'Atardeceres, cielo, entorno y luz natural' },
    { value: 'Automotriz', label: 'Automotriz', detail: 'Autos, detalles y sesiones de vehículo' },
    { value: 'Video', label: 'Video', detail: 'Piezas audiovisuales y color' },
    { value: 'Música', label: 'Música', detail: 'Entrada enlazada al archivo musical' },
    { value: 'Demos musicales', label: 'Demos musicales', detail: 'Reservado para demos futuras' },
    { value: 'Otros archivos visuales', label: 'Otros archivos visuales', detail: 'Diseño, stills y material mixto' }
  ];
  const MUSIC_SECTION_TYPES = [
    { value: 'cover', label: 'Portada', detail: 'Primera pantalla del release' },
    { value: 'player', label: 'Reproductor', detail: 'Player y tracklist' },
    { value: 'image', label: 'Imagen', detail: 'Cover, booklet o gráfico' },
    { value: 'text', label: 'Texto', detail: 'Nota escrita del archive' }
  ];
  const MUSIC_LINK_PRESETS = [
    {
      platform: 'spotify',
      label: 'Spotify',
      detail: 'Streaming',
      placeholder: 'https://open.spotify.com/album/...'
    },
    {
      platform: 'apple-music',
      label: 'Apple Music',
      detail: 'Streaming',
      placeholder: 'https://music.apple.com/...'
    },
    {
      platform: 'soundcloud',
      label: 'SoundCloud',
      detail: 'Streaming',
      placeholder: 'https://soundcloud.com/...'
    }
  ];
  const UPLOAD_BATCH_MAX_FILES = 8;
  const UPLOAD_BATCH_MAX_BYTES = 40 * 1024 * 1024;
  const UPLOAD_LIMITS = {
    image: 25 * 1024 * 1024,
    audio: 180 * 1024 * 1024,
    video: 80 * 1024 * 1024,
    download: 250 * 1024 * 1024,
    file: 250 * 1024 * 1024
  };

  let mode = 'collections';
  let backendAvailable = false;
  let cmsStatus = null;
  let projectSaveTimers = {
    collections: null,
    music: null
  };
  let projectSaveInFlight = {
    collections: false,
    music: false
  };
  let projectSaveQueued = {
    collections: false,
    music: false
  };
  let mediaAssets = [];
  let mediaPicker = null;
  let mediaTarget = null;
  let collections = loadStored(COLLECTIONS_KEY, window.DE_LA_MANGA_COLLECTIONS, [emptyCollection()]);
  let musicArchives = loadStored(MUSIC_KEY, window.DE_LA_MANGA_MUSIC_ARCHIVES, [emptyMusicArchive()]);
  let active = {
    collections: 0,
    music: 0
  };

  async function ensureAdminSession() {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      const payload = await response.json();
      if (response.ok && payload.authenticated) return true;
    } catch (error) {
      // The CMS is intentionally unavailable without the local backend.
    }

    window.location.href = `login.html?next=${encodeURIComponent('admin.html')}`;
    return false;
  }

  function emptyCollection() {
    return {
      id: 'nueva-coleccion',
      title: 'Nueva colección',
      type: 'Fotografía',
      status: 'draft',
      cover: '',
      href: '',
      summary: 'Describe la colección en una frase clara.',
      tags: ['archivo'],
      items: []
    };
  }

  function emptyMusicArchive() {
    return {
      id: 'nuevo-release',
      title: 'Nuevo release',
      artist: 'De La Manga',
      releaseType: 'single',
      year: '2026',
      status: 'draft',
      totalDuration: '0:00',
      cover: 'assets/music/nuevo-release/cover.png',
      backHref: 'musica.html',
      backLabel: 'Volver a música',
      links: defaultMusicLinks(),
      downloads: [
        {
          label: 'Descarga AIFF',
          href: 'assets/music/nuevo-release/downloads/nuevo-release-aiff.zip',
          filename: 'nuevo-release-aiff.zip',
          format: 'AIFF ZIP'
        }
      ],
      sections: [
        defaultMusicSection('cover', 0),
        defaultMusicSection('player', 1)
      ],
      tracks: [
        {
          number: '01',
          title: 'Nueva canción',
          duration: '0:00',
          webAudio: 'assets/music/nuevo-release/audio/01-nueva-cancion.mp3'
        }
      ]
    };
  }

  function defaultMusicSection(type = 'image', index = 0) {
    const section = {
      id: sectionIdFromType(type, index),
      type,
      title: '',
      background: '',
      image: '',
      alt: '',
      body: ''
    };
    if (type === 'player') section.title = 'Escucha';
    if (type === 'text') section.title = 'Nota';
    return section;
  }

  function defaultMusicLinks() {
    return MUSIC_LINK_PRESETS.map(preset => ({
      label: preset.label,
      platform: preset.platform,
      href: ''
    }));
  }

  function normalizeMusicPlatform(platform) {
    const value = String(platform || '')
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, '-');

    if (value === 'apple' || value === 'applemusic') return 'apple-music';
    if (value === 'sound-cloud') return 'soundcloud';
    return value || 'external';
  }

  function musicLinkPreset(platform) {
    const normalized = normalizeMusicPlatform(platform);
    return MUSIC_LINK_PRESETS.find(preset => preset.platform === normalized) || null;
  }

  function normalizeMusicLinks(links = []) {
    const byPlatform = new Map();
    const customLinks = [];

    (Array.isArray(links) ? links : []).forEach(link => {
      const platform = normalizeMusicPlatform(link.platform);
      const preset = musicLinkPreset(platform);
      const normalized = {
        label: preset?.label || link.label?.trim() || platform,
        platform,
        href: link.href?.trim() || ''
      };

      if (preset) {
        const current = byPlatform.get(platform);
        if (!current || normalized.href) byPlatform.set(platform, normalized);
        return;
      }

      if (normalized.href) customLinks.push(normalized);
    });

    return [
      ...MUSIC_LINK_PRESETS.map(preset => ({
        label: preset.label,
        platform: preset.platform,
        href: byPlatform.get(preset.platform)?.href || ''
      })),
      ...customLinks
    ];
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadStored(key, source, fallback) {
    const stored = window.localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch (error) {
        window.localStorage.removeItem(key);
      }
    }
    return clone(source || fallback);
  }

  function slugify(value) {
    return value
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'entrada';
  }

  function getEntries() {
    return mode === 'music' ? musicArchives : collections;
  }

  function setEntries(nextEntries) {
    if (mode === 'music') {
      musicArchives = nextEntries;
    } else {
      collections = nextEntries;
    }
  }

  function getCurrentIndex() {
    return active[mode] || 0;
  }

  function setCurrentIndex(index) {
    active[mode] = index;
  }

  function getCurrentEntry() {
    return getEntries()[getCurrentIndex()];
  }

  function normalizePublicationStatus(value, fallback = 'draft') {
    const raw = String(value || '').trim();
    const normalized = raw.toLowerCase();
    if (!normalized) return fallback;
    if (['draft', 'borrador'].includes(normalized)) return 'draft';
    if (['published', 'publicado', 'publicada', 'public'].includes(normalized)) return 'published';
    if (['archived', 'archive', 'hidden', 'oculto', 'oculta', 'archivado', 'archivada'].includes(normalized)) return 'archived';
    return 'published';
  }

  function publicationStatusLabel(value) {
    const status = normalizePublicationStatus(value);
    return PUBLICATION_STATUSES.find(item => item.value === status)?.label || 'Borrador';
  }

  function entryIssueSeverity(entry) {
    return normalizePublicationStatus(entry?.status, 'draft') === 'published' ? 'error' : 'warning';
  }

  function normalizeLocalPath(value) {
    return String(value || '')
      .trim()
      .replace(/^\.\//, '')
      .split('#')[0]
      .split('?')[0];
  }

  function isExternalUrl(value) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(String(value || '').trim());
  }

  function isSpecialUrl(value) {
    return /^(mailto:|tel:)/i.test(String(value || '').trim());
  }

  function isLocalAssetReference(value) {
    return normalizeLocalPath(value).startsWith('assets/');
  }

  function localAssetExists(value) {
    const filePath = normalizeLocalPath(value);
    if (!filePath || !backendAvailable) return true;
    return mediaAssets.some(asset => normalizeLocalPath(asset.filePath) === filePath);
  }

  function hasUsableTimecode(value) {
    return parseTimecode(value) > 0;
  }

  function isValidExternalUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    if (isSpecialUrl(raw)) return true;
    if (!isExternalUrl(raw)) return true;
    try {
      const url = new URL(raw);
      return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
    } catch (error) {
      return false;
    }
  }

  function looksLikeExternalUrlWithoutProtocol(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('./')) return false;
    if (isLocalAssetReference(raw) || /\.html(?:$|[?#])/i.test(raw)) return false;
    return /^www\./i.test(raw) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\//i.test(raw);
  }

  function slugCountsForMode(targetMode) {
    const entries = targetMode === 'music' ? musicArchives : collections;
    return entries.reduce((counts, entry) => {
      const slug = slugify(entry.id || entry.title || '');
      counts.set(slug, (counts.get(slug) || 0) + 1);
      return counts;
    }, new Map());
  }

  function addIssue(issues, entry, kind, message, options = {}) {
    issues.push({
      kind,
      message,
      severity: options.severity || entryIssueSeverity(entry)
    });
  }

  function requireValue(issues, entry, value, kind, message) {
    if (String(value || '').trim()) return;
    addIssue(issues, entry, kind, message);
  }

  function validateLocalAsset(issues, entry, value, label) {
    if (!value || !isLocalAssetReference(value)) return;
    if (localAssetExists(value)) return;
    addIssue(issues, entry, 'archivo inexistente', `${label}: no existe ${normalizeLocalPath(value)}.`);
  }

  function validateLinkValue(issues, entry, value, label, options = {}) {
    const raw = String(value || '').trim();
    if (!raw) {
      if (options.required) addIssue(issues, entry, 'link roto', `${label}: falta la URL.`);
      return;
    }
    if (looksLikeExternalUrlWithoutProtocol(raw)) {
      addIssue(issues, entry, 'link roto', `${label}: falta https:// en la URL.`);
      return;
    }
    if (!isValidExternalUrl(raw)) {
      addIssue(issues, entry, 'link roto', `${label}: URL inválida.`);
      return;
    }
    validateLocalAsset(issues, entry, raw, label);
  }

  function validateEntry(targetMode, entry, index = getCurrentIndex()) {
    const issues = [];
    const normalizedEntry = targetMode === 'music'
      ? normalizeMusicArchive(entry || emptyMusicArchive())
      : normalizeCollection(entry || emptyCollection());
    const slug = slugify(normalizedEntry.id || normalizedEntry.title || '');
    const slugCounts = slugCountsForMode(targetMode);

    if ((slugCounts.get(slug) || 0) > 1) {
      addIssue(issues, normalizedEntry, 'slug duplicado', `El slug "${slug}" está repetido en ${targetMode === 'music' ? 'Music Archives' : 'Colecciones'}.`, { severity: 'error' });
    }

    if (targetMode === 'music') {
      validateMusicEntry(issues, normalizedEntry);
    } else {
      validateCollectionEntry(issues, normalizedEntry);
    }

    return issues;
  }

  function validateCollectionEntry(issues, collection) {
    const isLinkedMusicArchive = collection.type === 'Música' || collection.href === 'musica.html';
    if (!isLinkedMusicArchive) {
      requireValue(issues, collection, collection.cover, 'portada', 'Falta portada de colección.');
      validateLocalAsset(issues, collection, collection.cover, 'Portada');
    }
    validateLinkValue(issues, collection, collection.href, 'Página dedicada');

    (collection.items || []).forEach((item, index) => {
      requireValue(issues, collection, item.src, 'archivo inexistente', `Item ${index + 1}: falta archivo.`);
      validateLocalAsset(issues, collection, item.src, `Item ${index + 1}`);
    });
  }

  function validateMusicEntry(issues, archive) {
    requireValue(issues, archive, archive.cover, 'portada', 'Falta cover del release.');
    validateLocalAsset(issues, archive, archive.cover, 'Cover');

    if (!archive.tracks?.length) {
      addIssue(issues, archive, 'audio', 'Falta al menos un track de audio.');
    }

    (archive.tracks || []).forEach((track, index) => {
      requireValue(issues, archive, track.webAudio, 'audio', `Track ${index + 1}: falta archivo de audio.`);
      validateLocalAsset(issues, archive, track.webAudio, `Audio track ${index + 1}`);
      if (!hasUsableTimecode(track.duration)) {
        addIssue(issues, archive, 'duración', `Track ${index + 1}: falta duración válida.`);
      }
    });

    (archive.sections || []).forEach((section, index) => {
      requireValue(issues, archive, section.background, 'background', `Sección ${index + 1}: falta background.`);
      validateLocalAsset(issues, archive, section.background, `Background sección ${index + 1}`);
      validateLocalAsset(issues, archive, section.image, `Imagen sección ${index + 1}`);
    });

    (archive.links || []).forEach((link, index) => {
      if (!link.href) return;
      validateLinkValue(issues, archive, link.href, link.label || `Link ${index + 1}`, { required: true });
    });

    (archive.downloads || []).forEach((download, index) => {
      validateLinkValue(issues, archive, download.href, download.label || `Descarga ${index + 1}`, { required: Boolean(download.label || download.filename || download.format) });
    });
  }

  function normalizeCollection(collection) {
    return {
      id: collection.id?.trim() || slugify(collection.title || 'coleccion'),
      title: collection.title?.trim() || 'Sin título',
      type: collection.type?.trim() || 'Archivo',
      status: normalizePublicationStatus(collection.status, 'draft'),
      cover: collection.cover?.trim() || '',
      href: collection.href?.trim() || '',
      summary: collection.summary?.trim() || '',
      tags: splitList(collection.tags),
      items: Array.isArray(collection.items)
        ? collection.items.map(item => ({
          src: item.src?.trim() || '',
          alt: item.alt?.trim() || '',
          caption: item.caption?.trim() || ''
        })).filter(item => item.src)
        : []
    };
  }

  function normalizeMusicArchive(archive) {
    const tracks = Array.isArray(archive.tracks)
      ? archive.tracks.map((track, index) => ({
        number: track.number?.trim() || String(index + 1).padStart(2, '0'),
        title: track.title?.trim() || '',
        duration: track.duration?.trim() || '',
        webAudio: track.webAudio?.trim() || ''
      })).filter(track => track.title || track.webAudio)
      : [];

    return {
      id: archive.id?.trim() || slugify(archive.title || 'music-archive'),
      title: archive.title?.trim() || 'Sin título',
      artist: archive.artist?.trim() || 'De La Manga',
      releaseType: archive.releaseType?.trim() || 'single',
      year: archive.year?.trim() || '',
      totalDuration: formatTimecode(tracks.reduce((total, track) => total + parseTimecode(track.duration), 0)),
      status: normalizePublicationStatus(archive.status, 'draft'),
      cover: archive.cover?.trim() || '',
      backHref: archive.backHref?.trim() || 'musica.html',
      backLabel: archive.backLabel?.trim() || 'Volver a música',
      links: normalizeMusicLinks(archive.links),
      downloads: Array.isArray(archive.downloads)
        ? archive.downloads.map(download => ({
          label: download.label?.trim() || '',
          href: download.href?.trim() || '',
          filename: download.filename?.trim() || '',
          format: download.format?.trim() || ''
        })).filter(download => download.href)
        : [],
      sections: Array.isArray(archive.sections)
        ? archive.sections.map((section, index) => ({
          id: section.id?.trim() || sectionIdFromType(section.type, index),
          type: section.type?.trim() || 'image',
          title: section.title?.trim() || '',
          background: section.background?.trim() || '',
          image: section.image?.trim() || '',
          alt: section.alt?.trim() || '',
          body: section.body?.trim() || ''
        })).filter(section => section.type)
        : [],
      tracks
    };
  }

  function normalizeCurrent(entry) {
    return mode === 'music' ? normalizeMusicArchive(entry) : normalizeCollection(entry);
  }

  function splitList(value) {
    if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
    return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  async function detectBackend() {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const payload = await response.json();
      backendAvailable = response.ok;
      cmsStatus = payload.cms || null;
      if (backendAvailable) {
        await loadCmsContent();
        await loadMediaAssets();
      }
    } catch (error) {
      backendAvailable = false;
      cmsStatus = null;
    }
    render();
    if (!backendAvailable) {
      setStatus('Backend no detectado. Exportar archivo descargará un JS.');
      return;
    }

    const counts = cmsStatus?.counts;
    setStatus(counts
      ? `Guardado automático activo: ${counts.musicArchives} music archive, ${counts.collections} colecciones, ${counts.mediaAssets} assets.`
      : 'Backend local conectado. Guardado automático activo.');
  }

  async function loadCmsContent() {
    const response = await fetch('/api/cms/content', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'No se pudo cargar contenido desde SQLite');
    }

    collections = clone(payload.collections?.length ? payload.collections : [emptyCollection()]);
    musicArchives = clone(payload.musicArchives?.length ? payload.musicArchives : [emptyMusicArchive()]).map(normalizeMusicArchive);
    cmsStatus = payload.cms || cmsStatus;
    window.localStorage.removeItem(COLLECTIONS_KEY);
    window.localStorage.removeItem(MUSIC_KEY);
    active.collections = Math.min(active.collections || 0, Math.max(0, collections.length - 1));
    active.music = Math.min(active.music || 0, Math.max(0, musicArchives.length - 1));
  }

  function persistDraft(silent = true, options = {}) {
    const targetMode = options.mode || mode;
    const key = targetMode === 'music' ? MUSIC_KEY : COLLECTIONS_KEY;
    const entries = targetMode === 'music' ? musicArchives : collections;
    window.localStorage.setItem(key, JSON.stringify(entries));
    if (!silent) setStatus('Cambios guardados localmente.');
    if (options.project !== false) scheduleProjectSave(targetMode);
  }

  async function loadMediaAssets() {
    if (!backendAvailable) return;
    const response = await fetch('/api/cms/media-assets', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'No se pudo cargar la biblioteca de medios');
    }
    mediaAssets = payload.mediaAssets || [];
  }

  function mediaTypesForRole(role) {
    if (role === 'music-audio') return ['audio'];
    if (role === 'music-download') return ['audio', 'download', 'file'];
    if (role === 'collection-media' || role === 'collection-cover') return collectionMediaTypes();
    return ['image'];
  }

  function acceptForRole(role) {
    if (role === 'music-audio') return 'audio/*,.wav,.aif,.aiff,.flac,.mp3';
    if (role === 'music-download') return '.zip,.aif,.aiff,.flac,.wav,.mp3,audio/*,application/zip';
    if (role === 'collection-media' || role === 'collection-cover') return collectionAccept();
    return 'image/*,.jpg,.jpeg,.png,.webp';
  }

  function collectionMediaTypes(collection = getCurrentEntry()) {
    const type = collection?.type || 'Fotografía';
    if (type === 'Fotografía') return ['image'];
    if (type === 'Sesión') return ['image'];
    if (type === 'Retrato') return ['image'];
    if (type === 'Calle') return ['image'];
    if (type === 'Paisaje') return ['image'];
    if (type === 'Automotriz') return ['image'];
    if (type === 'Video') return ['video', 'image'];
    if (type === 'Música') return ['image'];
    if (type === 'Demos musicales') return ['image', 'video'];
    return ['image', 'video'];
  }

  function collectionAccept(collection = getCurrentEntry()) {
    const types = collectionMediaTypes(collection);
    if (types.length === 1 && types[0] === 'image') return 'image/*,.jpg,.jpeg,.png,.webp';
    return 'image/*,video/*,.mp4,.mov,.webm,.jpg,.jpeg,.png,.webp';
  }

  function fileExtension(fileName) {
    const match = String(fileName || '').toLowerCase().match(/\.[^.]+$/);
    return match ? match[0] : '';
  }

  function uploadKindForFile(file, role = 'library') {
    const ext = fileExtension(file.name);
    const mime = String(file.type || '').toLowerCase();
    if (role === 'music-download' && ext === '.zip') return 'download';
    if (mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'image';
    if (mime.startsWith('audio/') || ['.wav', '.aif', '.aiff', '.flac', '.mp3'].includes(ext)) return 'audio';
    if (mime.startsWith('video/') || ['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
    if (ext === '.zip') return 'download';
    return 'file';
  }

  function validateUploadSelection(files, role = 'library') {
    const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.wav', '.aif', '.aiff', '.flac', '.mp3', '.mp4', '.mov', '.webm', '.zip']);
    const roleTypes = role === 'library' ? null : mediaTypesForRole(role);

    for (const file of Array.from(files || [])) {
      const ext = fileExtension(file.name);
      const kind = uploadKindForFile(file, role);
      if (!allowedExtensions.has(ext)) {
        throw new Error(`No puedo importar ${file.name}. Usa JPG, PNG, WebP, WAV, AIFF, FLAC, MP3, MP4, MOV, WebM o ZIP.`);
      }
      if (roleTypes && !roleTypes.includes(kind) && !(roleTypes.includes('download') && kind === 'audio')) {
        throw new Error(`${file.name} no corresponde a este campo.`);
      }
      const limit = UPLOAD_LIMITS[kind] || UPLOAD_LIMITS.file;
      if (file.size > limit) {
        throw new Error(`${file.name} pesa ${formatBytes(file.size)}. Limite para ${kind}: ${formatBytes(limit)}.`);
      }
    }
  }

  function uploadDirForRole(role) {
    const entry = getCurrentEntry() || {};
    const id = slugify(entry.id || entry.title || 'entrada');

    if (mode === 'music') {
      if (role === 'music-cover') return `assets/music/${id}/cover`;
      if (role === 'music-background') return `assets/music/${id}/backgrounds`;
      if (role === 'music-image') return `assets/music/${id}/images`;
      if (role === 'music-audio') return `assets/music/${id}/audio`;
      if (role === 'music-download') return `assets/music/${id}/downloads`;
      return `assets/music/${id}/media`;
    }

    if (role === 'collection-cover') return `assets/photography/${id}/cover`;
    return `assets/photography/${id}/full`;
  }

  function fileNameWithoutExtension(filePath) {
    return String(filePath || '')
      .split('/')
      .pop()
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim();
  }

  function syncAfterMediaChange(message) {
    syncCurrentFromForm();
    renderList();
    renderForm();
    persistDraft();
    if (message) setStatus(message);
  }

  function sectionIdFromType(type, index) {
    const prefix = type === 'player' ? 'player' : type === 'cover' ? 'cover' : type === 'text' ? 'text' : 'graphic';
    return `${prefix}-${String(index + 1).padStart(2, '0')}`;
  }

  function sectionTypeLabel(type) {
    return MUSIC_SECTION_TYPES.find(item => item.value === type)?.label || 'Sección';
  }

  function collectionTypeLabel(type) {
    return COLLECTION_TYPES.find(item => item.value === type)?.label || type || 'Colección';
  }

  function collectionTypeDetail(type) {
    return COLLECTION_TYPES.find(item => item.value === type)?.detail || 'Archivo visual';
  }

  function isImagePath(filePath) {
    return /\.(png|jpe?g|webp|gif|svg)$/i.test(String(filePath || '').split('?')[0]);
  }

  function isVideoPath(filePath) {
    return /\.(mp4|mov|webm|m4v)$/i.test(String(filePath || '').split('?')[0]);
  }

  function mediaPreviewMarkup(filePath, label = 'Sin medio') {
    const pathValue = String(filePath || '').trim();
    if (!pathValue) {
      return `<span class="admin-media-preview__empty">${escapeHtml(label)}</span>`;
    }
    if (isImagePath(pathValue)) {
      return `<img src="${escapeAttribute(pathValue)}" alt="${escapeAttribute(fileNameWithoutExtension(pathValue) || label)}">`;
    }
    if (isVideoPath(pathValue)) {
      return `<video src="${escapeAttribute(pathValue)}" muted playsinline loop preload="metadata"></video>`;
    }
    return `<span class="admin-media-preview__file">${escapeHtml(fileNameWithoutExtension(pathValue) || label)}</span>`;
  }

  function musicArchivePreviewUrl(archive) {
    return `music-archive.html?id=${encodeURIComponent(archive.id || slugify(archive.title || 'music-archive'))}&preview=admin`;
  }

  function collectionPreviewUrl(collection) {
    const id = collection.id || slugify(collection.title || 'coleccion');
    return `colecciones.html?preview=admin&id=${encodeURIComponent(id)}#${encodeURIComponent(id)}`;
  }

  function formatTimecode(totalSeconds) {
    const safeSeconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function parseTimecode(value) {
    const parts = String(value || '').split(':').map(part => Number(part));
    if (parts.some(part => Number.isNaN(part))) return 0;
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    return parts[0] || 0;
  }

  function render() {
    tabs.forEach(tab => tab.classList.toggle('is-active', tab.dataset.mode === mode));
    sidebarKicker.textContent = mode === 'music' ? 'Music Archives' : 'Colecciones';
    sidebarTitle.textContent = mode === 'music' ? 'Releases' : 'Archivo';
    outputHelp.innerHTML = mode === 'music'
      ? (backendAvailable
        ? 'El admin lee y escribe SQLite. <code>data/music.js</code> se regenera automáticamente como salida pública. Los audios importados se copian a <code>assets/music/{release}/audio</code>.'
        : 'Cuando termines, descarga el archivo y reemplaza <code>data/music.js</code>. Los audios, portadas y backgrounds deben estar copiados en las rutas que escribiste.')
      : (backendAvailable
        ? 'El admin lee y escribe SQLite. <code>data/collections.js</code> se regenera automáticamente como salida pública.'
        : 'Cuando termines, descarga el archivo y reemplaza <code>data/collections.js</code>. Tus fotos y videos deben estar copiados en las rutas que escribiste.');
    if (exportButton) {
      exportButton.textContent = backendAvailable ? 'Guardar ahora' : 'Exportar archivo';
    }
    renderList();
    renderForm();
  }

  function renderList() {
    listEl.replaceChildren();
    getEntries().forEach((entry, index) => {
      const issues = validateEntry(mode, entry, index);
      const errorCount = issues.filter(issue => issue.severity === 'error').length;
      const warningCount = issues.length - errorCount;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'admin-list-item';
      button.classList.toggle('is-active', index === getCurrentIndex());
      button.classList.toggle('has-errors', errorCount > 0);
      button.classList.toggle('has-warnings', errorCount === 0 && warningCount > 0);
      button.innerHTML = `
        <span>${escapeHtml(entry.title || 'Sin título')}</span>
        <small>${escapeHtml(getEntryMeta(entry))}</small>
        ${issues.length ? `<em class="admin-list-item__validation">${errorCount ? `${errorCount} error${errorCount === 1 ? '' : 'es'}` : `${warningCount} aviso${warningCount === 1 ? '' : 's'}`}</em>` : '<em class="admin-list-item__validation">OK</em>'}
      `;
      button.addEventListener('click', () => {
        syncCurrentFromForm();
        setCurrentIndex(index);
        render();
      });
      listEl.append(button);
    });
  }

  function getEntryMeta(entry) {
    if (mode === 'music') {
      return [publicationStatusLabel(entry.status), entry.releaseType || 'release', entry.year, `${entry.tracks?.length || 0} tracks`].filter(Boolean).join(' / ');
    }
    return `${publicationStatusLabel(entry.status)} / ${entry.type || 'Archivo'}`;
  }

  function renderForm() {
    const entry = getCurrentEntry() || (mode === 'music' ? emptyMusicArchive() : emptyCollection());
    editorTitle.textContent = entry.title || 'Entrada';
    fieldsEl.replaceChildren();
    fieldsEl.insertAdjacentHTML('beforeend', mode === 'music' ? musicFormTemplate(entry) : collectionFormTemplate(entry));
  }

  function collectionFormTemplate(collection) {
    return `
      <div class="admin-grid admin-grid--two">
        ${field('Título', 'title', collection.title, 'text', 'required')}
        ${field('ID / slug', 'id', collection.id, 'text', 'required')}
      </div>
      <div class="admin-grid admin-grid--three">
        ${selectField('Tipo de colección', 'type', collection.type, COLLECTION_TYPES.map(type => [type.value, type.label]))}
        ${selectField('Estado de publicación', 'status', normalizePublicationStatus(collection.status, 'draft'), PUBLICATION_STATUSES.map(status => [status.value, status.label]))}
        ${field('Página dedicada', 'href', collection.href, 'text', '', 'music-archive.html?id=operacion-14')}
      </div>
      ${validationPanelTemplate('collections', collection, getCurrentIndex())}
      ${collectionArchivePanel(collection)}
      ${textarea('Resumen', 'summary', collection.summary, 'required')}
      ${field('Tags separados por coma', 'tags', (collection.tags || []).join(', '), 'text', '', 'foto, color, editorial')}
      ${groupHeader('Items', 'Media de exposición', 'add-collection-item', 'Agregar item')}
      <div class="admin-import">
        <label class="admin-file-drop">
          <input type="file" accept="${escapeAttribute(collectionAccept(collection))}" multiple data-action="import-collection-media">
          <span>Importar medios</span>
          <small>${escapeHtml(collectionTypeDetail(collection.type))}</small>
        </label>
      </div>
      <div class="admin-items" data-collection-items>
        ${(collection.items || []).map((item, index, items) => collectionItemTemplate(item, index, items.length)).join('')}
      </div>
    `;
  }

  function collectionArchivePanel(collection) {
    const items = collection.items || [];
    const cover = collection.cover || items[0]?.src || '';
    return `
      <section class="admin-collection-panel" aria-label="Portada de colección">
        <div class="admin-collection-panel__preview">
          ${mediaPreviewMarkup(cover, 'Sin portada')}
        </div>
        <div class="admin-collection-panel__body">
          <div>
            <p class="eyebrow">${escapeHtml(collectionTypeLabel(collection.type))}</p>
            <h3>${escapeHtml(collection.title || 'Colección')}</h3>
            <p>${escapeHtml([publicationStatusLabel(collection.status), `${items.length} item${items.length === 1 ? '' : 's'}`].filter(Boolean).join(' / '))}</p>
          </div>
          <div class="admin-collection-type-strip" aria-label="Tipos de colección">
            ${COLLECTION_TYPES.map(type => `
              <span class="admin-collection-type-pill ${type.value === collection.type ? 'is-active' : ''}">${escapeHtml(type.label)}</span>
            `).join('')}
          </div>
          ${mediaField('Portada de colección', 'cover', collection.cover, 'collection-cover', '', 'assets/photography/serie/cover.jpg')}
        </div>
      </section>
    `;
  }

  function musicFormTemplate(archive) {
    return `
      <div class="admin-grid admin-grid--two">
        ${field('Título', 'title', archive.title, 'text', 'required')}
        ${field('URL ID', 'id', archive.id, 'text', 'required')}
      </div>
      <div class="admin-grid admin-grid--three">
        ${field('Artista', 'artist', archive.artist, 'text')}
        ${selectField('Tipo de release', 'releaseType', archive.releaseType, [
          ['single', 'Single'],
          ['EP', 'EP'],
          ['album', 'Álbum'],
          ['mixtape', 'Mixtape'],
          ['demo', 'Demo']
        ])}
        ${selectField('Estado de publicación', 'status', normalizePublicationStatus(archive.status, 'draft'), PUBLICATION_STATUSES.map(status => [status.value, status.label]))}
      </div>
      <div class="admin-grid admin-grid--three">
        ${field('Año', 'year', archive.year, 'text')}
        ${field('Duración total automática', 'totalDuration', normalizeMusicArchive(archive).totalDuration, 'text', 'readonly')}
        ${field('Volver a', 'backHref', archive.backHref, 'text')}
      </div>
      <div class="admin-grid admin-grid--two">
        ${field('Texto volver', 'backLabel', archive.backLabel, 'text')}
      </div>
      ${validationPanelTemplate('music', archive, getCurrentIndex())}
      ${musicReleasePanel(archive)}
      ${groupHeader('Secciones', 'Bloques visuales del Music Archive')}
      ${musicSectionBuilderTemplate()}
      <div class="admin-items" data-music-sections>
        ${(archive.sections || []).map((section, index, sections) => musicSectionTemplate(section, index, sections.length)).join('')}
      </div>
      ${groupHeader('Tracks', 'Audio para el reproductor web', 'add-music-track', 'Agregar track')}
      <div class="admin-import">
        <label class="admin-file-drop">
          <input type="file" accept="audio/*,.wav,.aif,.aiff,.flac,.mp3" multiple data-action="import-music-tracks">
          <span>Importar audios</span>
          <small>Ordena por fecha de creación/modificación del archivo, extrae nombre y calcula duración.</small>
        </label>
      </div>
      <div class="admin-items" data-music-tracks>
        ${(archive.tracks || []).map((track, index) => musicTrackTemplate(track, index)).join('')}
      </div>
      ${groupHeader('Streaming', 'Enlaces del player')}
      <div class="admin-items" data-music-links>
        ${normalizeMusicLinks(archive.links).map((link, index) => musicLinkTemplate(link, index)).join('')}
      </div>
      ${groupHeader('Descargas', 'ZIPs de AIFF, FLAC, extras o booklet', 'add-music-download', 'Agregar descarga')}
      <div class="admin-items" data-music-downloads>
        ${(archive.downloads || []).map((download, index) => musicDownloadTemplate(download, index)).join('')}
      </div>
    `;
  }

  function musicReleasePanel(archive) {
    const normalized = normalizeMusicArchive(archive);
    return `
      <section class="admin-music-release-panel" aria-label="Portada y vista previa">
        <div class="admin-music-release-panel__cover">
          ${mediaPreviewMarkup(archive.cover, 'Sin portada')}
        </div>
        <div class="admin-music-release-panel__body">
          <div>
            <p class="eyebrow">Release</p>
            <h3>${escapeHtml(archive.title || 'Music Archive')}</h3>
            <p>${escapeHtml([publicationStatusLabel(archive.status), archive.releaseType, archive.year, normalized.totalDuration].filter(Boolean).join(' / ') || 'Archivo musical')}</p>
          </div>
          <div class="admin-actions">
            <button type="button" class="ghost" data-action="preview-music-archive">Vista previa</button>
          </div>
          ${mediaField('Cover del release', 'cover', archive.cover, 'music-cover', 'required', 'assets/music/release/cover.png')}
        </div>
      </section>
    `;
  }

  function musicSectionBuilderTemplate() {
    return `
      <div class="admin-section-builder" aria-label="Crear sección">
        ${MUSIC_SECTION_TYPES.map(type => `
          <button type="button" class="admin-section-type-button" data-action="add-music-section-${escapeAttribute(type.value)}">
            <strong>${escapeHtml(type.label)}</strong>
            <span>${escapeHtml(type.detail)}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function field(label, name, value = '', type = 'text', attrs = '', placeholder = '') {
    return `
      <label class="admin-field">
        <span>${escapeHtml(label)}</span>
        <input type="${type}" name="${name}" value="${escapeAttribute(value || '')}" placeholder="${escapeAttribute(placeholder)}" autocomplete="off" ${attrs}>
      </label>
    `;
  }

  function mediaField(label, name, value = '', role = 'image', attrs = '', placeholder = '') {
    const accept = acceptForRole(role);
    return `
      <div class="admin-field admin-field--media" data-media-field data-media-role="${escapeAttribute(role)}">
        <span>${escapeHtml(label)}</span>
        <div class="admin-media-field">
          <input type="text" name="${name}" value="${escapeAttribute(value || '')}" placeholder="${escapeAttribute(placeholder)}" autocomplete="off" ${attrs}>
          <button type="button" class="ghost admin-media-field__button" data-action="open-media-picker" data-media-role="${escapeAttribute(role)}" data-media-name="${escapeAttribute(name)}">Elegir</button>
          <label class="ghost admin-media-field__button admin-media-upload-button">
            Subir
            <input type="file" accept="${escapeAttribute(accept)}" data-action="upload-media-field" data-media-role="${escapeAttribute(role)}" data-media-name="${escapeAttribute(name)}">
          </label>
        </div>
      </div>
    `;
  }

  function selectField(label, name, value = '', options = []) {
    const normalizedValue = String(value || '');
    const hasCurrentValue = options.some(([optionValue]) => String(optionValue) === normalizedValue);
    const selectOptions = hasCurrentValue || !normalizedValue
      ? options
      : [[normalizedValue, normalizedValue], ...options];
    return `
      <label class="admin-field">
        <span>${escapeHtml(label)}</span>
        <select name="${name}">
          ${selectOptions.map(([optionValue, optionLabel]) => `
            <option value="${escapeAttribute(optionValue)}" ${String(optionValue) === normalizedValue ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>
          `).join('')}
        </select>
      </label>
    `;
  }

  function textarea(label, name, value = '', attrs = '') {
    return `
      <label class="admin-field">
        <span>${escapeHtml(label)}</span>
        <textarea name="${name}" rows="4" ${attrs}>${escapeHtml(value || '')}</textarea>
      </label>
    `;
  }

  function groupHeader(kicker, title, action = '', label = '') {
    return `
      <div class="admin-section-head">
        <div>
          <p class="eyebrow">${escapeHtml(kicker)}</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
        ${action ? `<button type="button" class="ghost" data-action="${action}">${escapeHtml(label)}</button>` : ''}
      </div>
    `;
  }

  function validationPanelTemplate(targetMode, entry, index) {
    const issues = validateEntry(targetMode, entry, index);
    const errors = issues.filter(issue => issue.severity === 'error');
    const warnings = issues.filter(issue => issue.severity !== 'error');
    const state = errors.length ? 'error' : warnings.length ? 'warning' : 'ok';
    const summary = errors.length || warnings.length
      ? `${errors.length} error${errors.length === 1 ? '' : 'es'} / ${warnings.length} aviso${warnings.length === 1 ? '' : 's'}`
      : 'Sin avisos';

    return `
      <section class="admin-validation admin-validation--${state}" data-validation-panel aria-live="polite">
        <div class="admin-validation__head">
          <div>
            <p class="eyebrow">Validación</p>
            <h3>${escapeHtml(summary)}</h3>
          </div>
          <span class="admin-validation__badge">${escapeHtml(state === 'error' ? 'Revisar' : state === 'warning' ? 'Avisos' : 'OK')}</span>
        </div>
        ${issues.length ? `
          <ul class="admin-validation__list">
            ${issues.map(issue => `
              <li class="admin-validation__item admin-validation__item--${escapeAttribute(issue.severity)}">
                <strong>${escapeHtml(issue.kind)}</strong>
                <span>${escapeHtml(issue.message)}</span>
              </li>
            `).join('')}
          </ul>
        ` : '<p class="admin-validation__empty">Esta entrada tiene los campos mínimos listos para publicar.</p>'}
      </section>
    `;
  }

  function renderValidationPanel() {
    const panel = fieldsEl.querySelector('[data-validation-panel]');
    if (!panel) return;
    const entry = getCurrentEntry();
    panel.outerHTML = validationPanelTemplate(mode, entry, getCurrentIndex());
  }

  function collectionItemTemplate(item, index, totalItems = 1) {
    return `
      <div class="admin-item admin-item--collection-item" data-row="collection-item" data-index="${index}">
        ${rowHead(`Item ${index + 1}`, 'remove-row', {
          movable: true,
          disableUp: index === 0,
          disableDown: index >= totalItems - 1
        })}
        <div class="admin-collection-item-card">
          <div class="admin-collection-item-card__preview" aria-hidden="true">
            ${mediaPreviewMarkup(item.src, 'Sin archivo')}
          </div>
          <div class="admin-collection-item-card__fields">
          ${mediaField('Archivo', 'item-src', item.src, 'collection-media', '', 'assets/photography/serie/full/imagen.jpg')}
            <div class="admin-grid admin-grid--two">
              ${field('Texto alternativo', 'item-alt', item.alt)}
              ${field('Caption', 'item-caption', item.caption)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function musicSectionTemplate(section, index, totalSections = 1) {
    const type = section.type || 'image';
    return `
      <div class="admin-item admin-item--music-section" data-row="music-section" data-index="${index}" data-section-type="${escapeAttribute(type)}">
        ${rowHead(`Sección ${index + 1} / ${sectionTypeLabel(type)}`, 'remove-row', {
          movable: true,
          disableUp: index === 0,
          disableDown: index >= totalSections - 1
        })}
        <div class="admin-section-card">
          <div class="admin-section-card__preview" aria-hidden="true">
            <div class="admin-section-card__background">
              ${mediaPreviewMarkup(section.background, 'Sin background')}
            </div>
            <div class="admin-section-card__content">
              ${section.image ? mediaPreviewMarkup(section.image, 'Sin imagen') : `<span>${escapeHtml(sectionTypeLabel(type))}</span>`}
            </div>
            <span class="admin-section-card__type">${escapeHtml(sectionTypeLabel(type))}</span>
          </div>
          <div class="admin-section-card__fields">
            <div class="admin-grid admin-grid--two">
              ${selectField('Tipo de sección', 'section-type', section.type, [
            ['cover', 'Portada'],
            ['image', 'Gráfico / imagen diseñada'],
            ['text', 'Texto escrito'],
            ['player', 'Reproductor']
              ])}
              ${field('Título', 'section-title', section.title)}
            </div>
            ${mediaField('Background de sección', 'section-background', section.background, 'music-background', '', 'assets/music/release/backgrounds/01.jpg')}
            <div class="admin-grid admin-grid--two">
              ${mediaField('Imagen de contenido', 'section-image', section.image, 'music-image', '', 'Cover, descripción diseñada o gráfico central')}
              ${field('Descripción accesible', 'section-alt', section.alt, 'text', '', 'Texto breve para lectores de pantalla')}
            </div>
            ${textarea('Texto visible si eliges Texto escrito', 'section-body', section.body)}
          </div>
        </div>
      </div>
    `;
  }

  function musicTrackTemplate(track, index) {
    return `
      <div class="admin-item" data-row="music-track" data-index="${index}">
        ${rowHead(`Track ${index + 1}`, 'remove-row')}
        <div class="admin-grid admin-grid--three">
          ${field('Número', 'track-number', track.number || String(index + 1).padStart(2, '0'))}
          ${field('Título', 'track-title', track.title)}
          ${field('Duración', 'track-duration', track.duration, 'text', '', '2:13')}
        </div>
        ${mediaField('Audio web', 'track-webAudio', track.webAudio, 'music-audio', '', 'assets/music/release/audio/01-track.mp3')}
      </div>
    `;
  }

  function musicLinkTemplate(link, index) {
    const platform = normalizeMusicPlatform(link.platform);
    const preset = musicLinkPreset(platform);
    const label = preset?.label || link.label || 'Link';
    const detail = preset?.detail || 'Enlace externo';
    const placeholder = preset?.placeholder || 'https://...';
    return `
      <div class="admin-item admin-item--platform-link" data-row="music-link" data-index="${index}" data-link-platform="${escapeAttribute(platform)}">
        <div class="admin-item__head">
          <strong>${escapeHtml(label)}</strong>
          <span class="admin-item__meta">${escapeHtml(detail)}</span>
        </div>
        <input type="hidden" name="link-label" value="${escapeAttribute(label)}">
        <input type="hidden" name="link-platform" value="${escapeAttribute(platform)}">
        ${field('URL', 'link-href', link.href, 'url', '', placeholder)}
      </div>
    `;
  }

  function musicDownloadTemplate(download, index) {
    return `
      <div class="admin-item" data-row="music-download" data-index="${index}">
        ${rowHead(`Descarga ${index + 1}`, 'remove-row')}
        <div class="admin-grid admin-grid--two">
          ${field('Label', 'download-label', download.label)}
          ${field('Formato', 'download-format', download.format)}
        </div>
        <div class="admin-grid admin-grid--two">
          ${mediaField('Archivo de descarga', 'download-href', download.href, 'music-download')}
          ${field('Nombre de archivo', 'download-filename', download.filename)}
        </div>
      </div>
    `;
  }

  function rowHead(title, action, options = {}) {
    const moveControls = options.movable ? `
      <button type="button" class="admin-icon-button admin-icon-button--small" data-action="move-row-up" aria-label="Mover arriba" ${options.disableUp ? 'disabled' : ''}>↑</button>
      <button type="button" class="admin-icon-button admin-icon-button--small" data-action="move-row-down" aria-label="Mover abajo" ${options.disableDown ? 'disabled' : ''}>↓</button>
    ` : '';
    return `
      <div class="admin-item__head">
        <strong>${escapeHtml(title)}</strong>
        <div class="admin-item__tools">
          ${moveControls}
          <button type="button" class="admin-icon-button" data-action="${action}" aria-label="Eliminar">×</button>
        </div>
      </div>
    `;
  }

  function syncCurrentFromForm() {
    const entries = getEntries();
    const current = entries[getCurrentIndex()];
    if (!current) return;

    const data = Object.fromEntries(new FormData(form).entries());
    if (mode === 'music') {
      Object.assign(current, {
        title: data.title || '',
        id: data.id || slugify(data.title || ''),
        artist: data.artist || '',
        releaseType: data.releaseType || '',
        year: data.year || '',
        status: data.status || '',
        totalDuration: data.totalDuration || '',
        cover: data.cover || '',
        backHref: data.backHref || '',
        backLabel: data.backLabel || '',
        sections: readRows('music-section', row => ({
          type: row.querySelector('[name="section-type"]').value,
          title: row.querySelector('[name="section-title"]').value,
          background: row.querySelector('[name="section-background"]').value,
          image: row.querySelector('[name="section-image"]').value,
          alt: row.querySelector('[name="section-alt"]').value,
          body: row.querySelector('[name="section-body"]').value
        })),
        tracks: readRows('music-track', row => ({
          number: row.querySelector('[name="track-number"]').value,
          title: row.querySelector('[name="track-title"]').value,
          duration: row.querySelector('[name="track-duration"]').value,
          webAudio: row.querySelector('[name="track-webAudio"]').value
        })),
        links: readRows('music-link', row => ({
          label: row.querySelector('[name="link-label"]').value,
          platform: row.querySelector('[name="link-platform"]').value,
          href: row.querySelector('[name="link-href"]').value
        })),
        downloads: readRows('music-download', row => ({
          label: row.querySelector('[name="download-label"]').value,
          format: row.querySelector('[name="download-format"]').value,
          href: row.querySelector('[name="download-href"]').value,
          filename: row.querySelector('[name="download-filename"]').value
        }))
      });
    } else {
      Object.assign(current, {
        title: data.title || '',
        id: data.id || slugify(data.title || ''),
        type: data.type || '',
        status: data.status || '',
        href: data.href || '',
        cover: data.cover || '',
        summary: data.summary || '',
        tags: data.tags || '',
        items: readRows('collection-item', row => ({
          src: row.querySelector('[name="item-src"]').value,
          alt: row.querySelector('[name="item-alt"]').value,
          caption: row.querySelector('[name="item-caption"]').value
        }))
      });
    }

    entries[getCurrentIndex()] = normalizeCurrent(current);
    setEntries(entries);
  }

  function readRows(type, mapper) {
    return Array.from(fieldsEl.querySelectorAll(`[data-row="${type}"]`)).map(mapper);
  }

  function saveDraft() {
    syncCurrentFromForm();
    persistDraft(false);
  }

  async function logoutAdmin() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = 'login.html';
    }
  }

  async function resetFromSite() {
    if (backendAvailable) {
      try {
        await loadCmsContent();
      } catch (error) {
        setStatus(`No se pudo recargar desde SQLite: ${error.message}`);
        return;
      }
    } else {
      if (mode === 'music') {
        musicArchives = clone(window.DE_LA_MANGA_MUSIC_ARCHIVES || [emptyMusicArchive()]);
        window.localStorage.removeItem(MUSIC_KEY);
      } else {
        collections = clone(window.DE_LA_MANGA_COLLECTIONS || [emptyCollection()]);
        window.localStorage.removeItem(COLLECTIONS_KEY);
      }
    }
    setCurrentIndex(0);
    render();
    setStatus(backendAvailable
      ? 'Datos recargados desde SQLite.'
      : (mode === 'music' ? 'Datos recargados desde data/music.js.' : 'Datos recargados desde data/collections.js.'));
  }

  function entriesForMode(targetMode) {
    const entries = targetMode === 'music' ? musicArchives : collections;
    return entries.map(entry => (
      targetMode === 'music' ? normalizeMusicArchive(entry) : normalizeCollection(entry)
    ));
  }

  function sourceForMode(targetMode) {
    const normalized = entriesForMode(targetMode);
    const globalName = targetMode === 'music' ? 'DE_LA_MANGA_MUSIC_ARCHIVES' : 'DE_LA_MANGA_COLLECTIONS';
    return `window.${globalName} = ${JSON.stringify(normalized, null, 2)};\n`;
  }

  function exportSource() {
    syncCurrentFromForm();
    return sourceForMode(mode);
  }

  function scheduleProjectSave(targetMode = mode) {
    if (!backendAvailable) return;
    window.clearTimeout(projectSaveTimers[targetMode]);
    projectSaveTimers[targetMode] = window.setTimeout(() => {
      autoSaveProject(targetMode);
    }, PROJECT_SAVE_DELAY);
  }

  async function autoSaveProject(targetMode) {
    if (!backendAvailable) return;
    if (projectSaveInFlight[targetMode]) {
      projectSaveQueued[targetMode] = true;
      return;
    }

    projectSaveInFlight[targetMode] = true;
    try {
      await writeDataWithBackend({ targetMode, backup: false, auto: true });
    } catch (error) {
      setStatus(`Autoguardado falló: ${error.message}. Usa Guardar ahora.`);
    } finally {
      projectSaveInFlight[targetMode] = false;
      if (projectSaveQueued[targetMode]) {
        projectSaveQueued[targetMode] = false;
        scheduleProjectSave(targetMode);
      }
    }
  }

  function downloadJs() {
    const source = exportSource();
    const blob = new Blob([source], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = mode === 'music' ? 'music.js' : 'collections.js';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus(`Archivo ${link.download} descargado.`);
  }

  async function writeDataWithBackend(options = {}) {
    const targetMode = options.targetMode || mode;
    if (targetMode === mode) syncCurrentFromForm();
    const entries = entriesForMode(targetMode);
    const target = targetMode === 'music' ? 'music' : 'collections';
    const response = await fetch('/api/cms/content', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target,
        entries,
        backup: options.backup !== false
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'No se pudo escribir el archivo');
    }
    cmsStatus = payload.cms || cmsStatus;
    if (Array.isArray(payload.entries)) {
      if (targetMode === 'music') musicArchives = clone(payload.entries);
      if (targetMode === 'collections') collections = clone(payload.entries);
    }
    persistDraft(true, { mode: targetMode, project: false });

    if (options.auto) {
      setStatus(payload.changed
        ? `Autoguardado en SQLite; ${payload.file} regenerado.`
        : `SQLite sincronizado; sin cambios nuevos en ${payload.file}.`);
    } else {
      setStatus(`SQLite actualizado y ${payload.file} regenerado${payload.backup ? ` (backup: ${payload.backup})` : ''}.`);
    }
  }

  async function exportData() {
    if (!backendAvailable) {
      downloadJs();
      return;
    }

    try {
      await writeDataWithBackend({ backup: true, auto: false });
    } catch (error) {
      setStatus(`Backend falló: ${error.message}. Descargando JS como respaldo.`);
      downloadJs();
    }
  }

  async function previewMusicArchive() {
    if (mode !== 'music') return;
    previewCurrentEntry();
  }

  async function previewCurrentEntry() {
    syncCurrentFromForm();
    const entry = normalizeCurrent(getCurrentEntry() || (mode === 'music' ? emptyMusicArchive() : emptyCollection()));
    const previewUrl = mode === 'music' ? musicArchivePreviewUrl(entry) : collectionPreviewUrl(entry);

    if (backendAvailable) {
      try {
        await writeDataWithBackend({ targetMode: mode, backup: false, auto: true });
      } catch (error) {
        setStatus(`No se pudo preparar la vista previa: ${error.message}`);
        return;
      }
    } else {
      persistDraft(false, { mode, project: false });
      setStatus('Vista previa abierta desde el JS actual. Para ver cambios nuevos, exporta el archivo.');
    }

    const preview = window.open(previewUrl, '_blank', 'noopener');
    if (!preview) window.location.href = previewUrl;
    setStatus(`Vista previa abierta: ${previewUrl}`);
  }

  async function setCurrentPublicationStatus(nextStatus) {
    syncCurrentFromForm();
    const entries = getEntries();
    const entry = entries[getCurrentIndex()];
    if (!entry) return;

    entry.status = nextStatus;
    entries[getCurrentIndex()] = normalizeCurrent(entry);
    setEntries(entries);
    render();

    if (!backendAvailable) {
      persistDraft(false, { project: false });
      setStatus(nextStatus === 'published'
        ? 'Estado cambiado a Publicado. Exporta el archivo para verlo en la web pública.'
        : 'Estado cambiado a Oculto / archivado. Exporta el archivo para ocultarlo en la web pública.');
      return;
    }

    try {
      await writeDataWithBackend({ targetMode: mode, backup: false, auto: true });
      const issues = validateEntry(mode, getCurrentEntry(), getCurrentIndex());
      const errorCount = issues.filter(issue => issue.severity === 'error').length;
      if (nextStatus === 'published') {
        setStatus(errorCount
          ? `Publicado con ${errorCount} error${errorCount === 1 ? '' : 'es'} de validación. Revisa el panel.`
          : 'Publicado. La salida pública fue regenerada.');
      } else {
        setStatus('Oculto / archivado. La salida pública fue regenerada.');
      }
    } catch (error) {
      setStatus(`No se pudo cambiar el estado público: ${error.message}`);
    }
  }

  async function copyJs() {
    try {
      await navigator.clipboard.writeText(exportSource());
      setStatus('Código copiado al portapapeles.');
    } catch (error) {
      setStatus('No se pudo copiar automáticamente. Usa Exportar archivo.');
    }
  }

  function createEntry() {
    syncCurrentFromForm();
    const entries = getEntries();
    entries.push(mode === 'music' ? emptyMusicArchive() : emptyCollection());
    setEntries(entries);
    setCurrentIndex(entries.length - 1);
    render();
    persistDraft();
    setStatus(mode === 'music' ? 'Music Archive nuevo creado.' : 'Colección nueva creada.');
  }

  function duplicateEntry() {
    syncCurrentFromForm();
    const entries = getEntries();
    const duplicate = clone(entries[getCurrentIndex()] || (mode === 'music' ? emptyMusicArchive() : emptyCollection()));
    duplicate.title = `${duplicate.title} copia`;
    duplicate.id = slugify(duplicate.title);
    entries.splice(getCurrentIndex() + 1, 0, duplicate);
    setEntries(entries);
    setCurrentIndex(getCurrentIndex() + 1);
    render();
    persistDraft();
    setStatus('Entrada duplicada.');
  }

  function deleteEntry() {
    const entries = getEntries();
    if (entries.length <= 1) {
      setStatus('Debe existir al menos una entrada.');
      return;
    }
    entries.splice(getCurrentIndex(), 1);
    setEntries(entries);
    setCurrentIndex(Math.max(0, getCurrentIndex() - 1));
    render();
    persistDraft();
    setStatus('Entrada eliminada. Guardado automático en curso.');
  }

  function addRow(action) {
    syncCurrentFromForm();
    const entry = getCurrentEntry();

    if (action === 'add-collection-item') {
      entry.items.push({ src: '', alt: '', caption: '' });
    }
    if (action === 'add-music-section' || action.startsWith('add-music-section-')) {
      const requestedType = action.replace('add-music-section-', '');
      const type = MUSIC_SECTION_TYPES.some(item => item.value === requestedType) ? requestedType : 'image';
      entry.sections.push(defaultMusicSection(type, entry.sections.length));
    }
    if (action === 'add-music-track') {
      entry.tracks.push({ number: String(entry.tracks.length + 1).padStart(2, '0'), title: '', duration: '0:00', webAudio: '' });
    }
    if (action === 'add-music-link') {
      const links = normalizeMusicLinks(entry.links);
      const existing = new Set(links.map(link => link.platform));
      const missing = MUSIC_LINK_PRESETS.find(preset => !existing.has(preset.platform));
      entry.links = missing ? [...links, { label: missing.label, platform: missing.platform, href: '' }] : links;
    }
    if (action === 'add-music-download') {
      entry.downloads.push({ label: 'Descarga', href: '', filename: '', format: '' });
    }

    render();
    persistDraft();
    setStatus('Fila agregada.');
  }

  function moveRow(button, direction) {
    const row = button.closest('[data-row]');
    if (!row) return;
    syncCurrentFromForm();
    const entry = getCurrentEntry();
    const rowsByType = {
      'collection-item': entry.items,
      'music-section': entry.sections,
      'music-track': entry.tracks,
      'music-link': entry.links,
      'music-download': entry.downloads
    };
    const rows = rowsByType[row.dataset.row];
    const index = Number(row.dataset.index);
    const nextIndex = index + direction;
    if (!Array.isArray(rows) || nextIndex < 0 || nextIndex >= rows.length) return;

    [rows[index], rows[nextIndex]] = [rows[nextIndex], rows[index]];
    render();
    persistDraft();
    setStatus('Orden actualizado. Guardado automático en curso.');
  }

  function removeRow(button) {
    const row = button.closest('[data-row]');
    if (!row) return;
    row.remove();
    syncCurrentFromForm();
    render();
    persistDraft();
    setStatus('Fila eliminada. Guardado automático en curso.');
  }

  function fileTitle(fileName) {
    return fileName
      .replace(/\.[^.]+$/, '')
      .replace(/^\s*\d+\s*[-_. ]\s*/, '')
      .trim() || fileName.replace(/\.[^.]+$/, '');
  }

  function filePathForTrack(fileName) {
    const entry = getCurrentEntry() || {};
    return `assets/music/${entry.id || 'release'}/audio/${fileName}`;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB'];
    let size = value / 1024;
    let unit = units.shift();
    while (size >= 1024 && units.length) {
      size /= 1024;
      unit = units.shift();
    }
    return `${size >= 10 ? Math.round(size) : size.toFixed(1)} ${unit}`;
  }

  function totalFileSize(files) {
    return files.reduce((total, file) => total + (Number(file.size) || 0), 0);
  }

  function createUploadBatches(files) {
    const batches = [];
    let batch = [];
    let batchBytes = 0;

    files.forEach(file => {
      const size = Number(file.size) || 0;
      const shouldStartNewBatch =
        batch.length &&
        (batch.length >= UPLOAD_BATCH_MAX_FILES || batchBytes + size > UPLOAD_BATCH_MAX_BYTES);

      if (shouldStartNewBatch) {
        batches.push(batch);
        batch = [];
        batchBytes = 0;
      }

      batch.push(file);
      batchBytes += size;
    });

    if (batch.length) batches.push(batch);
    return batches;
  }

  async function uploadFiles(baseDir, files, role = 'library') {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return [];
    validateUploadSelection(selectedFiles, role);

    const batches = createUploadBatches(selectedFiles);
    const totalSize = totalFileSize(selectedFiles);
    const uploadedFiles = [];

    if (batches.length > 1) {
      setStatus(`Subida grande: ${selectedFiles.length} archivo(s), ${formatBytes(totalSize)} en ${batches.length} lotes.`);
    }

    for (const [index, batch] of batches.entries()) {
      if (batches.length > 1) {
        setStatus(`Copiando lote ${index + 1}/${batches.length}: ${batch.length} archivo(s), ${formatBytes(totalFileSize(batch))}...`);
      }
      uploadedFiles.push(...await uploadFileBatch(baseDir, batch));
    }

    return uploadedFiles;
  }

  async function uploadFileBatch(baseDir, files) {
    const payloadFiles = [];
    for (const file of files) {
      payloadFiles.push({
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        dataBase64: await fileToBase64(file)
      });
    }

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseDir, files: payloadFiles })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'No se pudieron subir los archivos');
    }
    return payload.files;
  }

  function getMediaInputFromButton(button) {
    const field = button.closest('[data-media-field]');
    if (!field) return null;
    const name = button.dataset.mediaName;
    return Array.from(field.querySelectorAll('input[type="text"]'))
      .find(input => input.name === name) || null;
  }

  async function setMediaInputValue(input, filePath, sourceFile = null) {
    if (!input || !filePath) return;
    input.value = filePath;

    const row = input.closest('[data-row]');
    const title = sourceFile ? fileTitle(sourceFile.name) : fileNameWithoutExtension(filePath);

    if (input.name === 'item-src' && row) {
      const altInput = row.querySelector('[name="item-alt"]');
      if (altInput && !altInput.value) altInput.value = title;
    }

    if (input.name === 'track-webAudio' && row) {
      const titleInput = row.querySelector('[name="track-title"]');
      if (titleInput && !titleInput.value) titleInput.value = title;
      if (sourceFile) {
        const seconds = await readAudioDuration(sourceFile);
        const durationInput = row.querySelector('[name="track-duration"]');
        if (durationInput) durationInput.value = formatTimecode(seconds);
      }
    }

    if (input.name === 'download-href' && row) {
      const filenameInput = row.querySelector('[name="download-filename"]');
      const labelInput = row.querySelector('[name="download-label"]');
      const filename = String(filePath).split('/').pop();
      if (filenameInput && !filenameInput.value) filenameInput.value = filename;
      if (labelInput && !labelInput.value) labelInput.value = title;
    }
  }

  async function uploadMediaForField(input, files, role) {
    if (!backendAvailable) {
      setStatus('Backend no detectado. No se pueden copiar archivos al proyecto.');
      return;
    }
    if (!input || !files.length) return;

    const file = files[0];
    const baseDir = uploadDirForRole(role);
    setStatus(`Copiando ${file.name} a ${baseDir}...`);
    try {
      const uploaded = await uploadFiles(baseDir, [file], role);
      await loadMediaAssets();
      await setMediaInputValue(input, uploaded[0]?.path, file);
      syncAfterMediaChange(`Medio copiado a ${uploaded[0]?.path}.`);
    } catch (error) {
      setStatus(error.message || 'No se pudo copiar el medio.');
    }
  }

  async function importCollectionMedia(files) {
    if (mode !== 'collections' || !files.length) return;
    if (!backendAvailable) {
      setStatus('Backend no detectado. No se pueden copiar medios al proyecto.');
      return;
    }

    syncCurrentFromForm();
    const entry = getCurrentEntry();
    const selectedFiles = Array.from(files);
    const baseDir = uploadDirForRole('collection-media');
    setStatus(`Copiando ${selectedFiles.length} medios a ${baseDir}...`);
    let uploaded = [];
    try {
      uploaded = await uploadFiles(baseDir, selectedFiles, 'collection-media');
      await loadMediaAssets();
    } catch (error) {
      setStatus(error.message || 'No se pudieron importar los medios.');
      return;
    }

    entry.items = entry.items || [];
    uploaded.forEach((file, index) => {
      entry.items.push({
        src: file.path,
        alt: fileTitle(selectedFiles[index]?.name || file.name),
        caption: ''
      });
    });

    if (!entry.cover && uploaded[0]?.path) {
      entry.cover = uploaded[0].path;
    }

    render();
    persistDraft();
    setStatus(`${uploaded.length} medios importados a la colección.`);
  }

  function ensureMediaPicker() {
    if (mediaPicker) return mediaPicker;

    mediaPicker = document.createElement('div');
    mediaPicker.className = 'admin-media-modal';
    mediaPicker.hidden = true;
    mediaPicker.innerHTML = `
      <div class="admin-media-modal__backdrop" data-action="close-media-picker"></div>
      <section class="admin-media-panel" role="dialog" aria-modal="true" aria-label="Biblioteca de medios">
        <div class="admin-media-panel__head">
          <div>
            <p class="eyebrow">Biblioteca</p>
            <h2>Medios</h2>
          </div>
          <button type="button" class="admin-icon-button" data-action="close-media-picker" aria-label="Cerrar">×</button>
        </div>
        <div class="admin-media-tools">
          <label class="admin-field">
            <span>Buscar</span>
            <input type="search" data-media-search placeholder="cover, wav, video..." autocomplete="off">
          </label>
          <label class="admin-file-drop admin-media-drop">
            <input type="file" multiple data-action="upload-media-picker">
            <span>Subir a biblioteca</span>
            <small data-media-upload-help>Los archivos se copian a la carpeta del campo activo.</small>
          </label>
        </div>
        <div class="admin-media-grid" data-media-grid></div>
      </section>
    `;

    mediaPicker.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'close-media-picker') closeMediaPicker();
      if (action === 'select-media-asset') selectMediaAsset(button.dataset.assetId);
    });

    mediaPicker.addEventListener('input', event => {
      if (event.target.matches('[data-media-search]')) renderMediaPicker();
    });

    mediaPicker.addEventListener('change', event => {
      if (event.target.dataset.action === 'upload-media-picker') {
        uploadFromMediaPicker(event.target.files);
        event.target.value = '';
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && mediaPicker && !mediaPicker.hidden) closeMediaPicker();
    });

    document.body.append(mediaPicker);
    return mediaPicker;
  }

  async function openMediaPicker(button = null) {
    if (!backendAvailable) {
      setStatus('Backend no detectado. La biblioteca necesita server.js.');
      return;
    }

    const input = button ? getMediaInputFromButton(button) : null;
    const role = button?.dataset.mediaRole || 'library';
    mediaTarget = { input, role };
    await loadMediaAssets();
    ensureMediaPicker();
    mediaPicker.hidden = false;
    const search = mediaPicker.querySelector('[data-media-search]');
    if (search) search.value = '';
    renderMediaPicker();
  }

  function closeMediaPicker() {
    if (!mediaPicker) return;
    mediaPicker.hidden = true;
    mediaTarget = null;
  }

  function renderMediaPicker() {
    if (!mediaPicker) return;
    const role = mediaTarget?.role || 'library';
    const allowedTypes = role === 'library' ? null : mediaTypesForRole(role);
    const search = mediaPicker.querySelector('[data-media-search]')?.value?.trim().toLowerCase() || '';
    const grid = mediaPicker.querySelector('[data-media-grid]');
    const uploadHelp = mediaPicker.querySelector('[data-media-upload-help]');
    const uploadInput = mediaPicker.querySelector('[data-action="upload-media-picker"]');
    if (uploadHelp) {
      uploadHelp.textContent = role === 'library'
        ? 'Los archivos se copian a assets/shared/library.'
        : `Los archivos se copian a ${uploadDirForRole(role)}.`;
    }
    if (uploadInput) uploadInput.accept = role === 'library' ? 'image/*,video/*,audio/*,.zip,.aif,.aiff,.flac,.wav,.mp3,.mp4,.mov,.webm' : acceptForRole(role);

    const assets = mediaAssets.filter(asset => {
      const matchesType = !allowedTypes || allowedTypes.includes(asset.type);
      const haystack = `${asset.title} ${asset.filePath} ${asset.type}`.toLowerCase();
      return matchesType && (!search || haystack.includes(search));
    });

    grid.replaceChildren();
    if (!assets.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-media-empty';
      empty.textContent = 'No hay medios para este filtro.';
      grid.append(empty);
      return;
    }

    assets.forEach(asset => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'admin-media-card';
      card.dataset.action = mediaTarget?.input ? 'select-media-asset' : 'noop';
      card.dataset.assetId = asset.id;
      card.disabled = !mediaTarget?.input;

      const preview = document.createElement('div');
      preview.className = `admin-media-card__preview admin-media-card__preview--${asset.type}`;
      if (asset.type === 'image') {
        const image = document.createElement('img');
        image.src = asset.filePath;
        image.alt = asset.title || '';
        preview.append(image);
      } else if (asset.type === 'video') {
        preview.textContent = 'VIDEO';
      } else if (asset.type === 'audio') {
        preview.textContent = 'AUDIO';
      } else {
        preview.textContent = 'FILE';
      }

      const info = document.createElement('div');
      info.className = 'admin-media-card__info';
      info.innerHTML = `
        <strong>${escapeHtml(asset.title || fileNameWithoutExtension(asset.filePath))}</strong>
        <span>${escapeHtml(asset.filePath)}</span>
        <small>${escapeHtml(asset.type)}${asset.sizeBytes ? ` / ${formatBytes(asset.sizeBytes)}` : ''}</small>
      `;

      card.append(preview, info);
      grid.append(card);
    });
  }

  async function selectMediaAsset(assetId) {
    const asset = mediaAssets.find(item => String(item.id) === String(assetId));
    if (!asset || !mediaTarget?.input) return;
    await setMediaInputValue(mediaTarget.input, asset.filePath);
    closeMediaPicker();
    syncAfterMediaChange(`Medio seleccionado: ${asset.filePath}`);
  }

  async function uploadFromMediaPicker(files) {
    if (!files.length) return;
    const role = mediaTarget?.role || 'library';
    const baseDir = role === 'library' ? 'assets/shared/library' : uploadDirForRole(role);
    setStatus(`Copiando ${files.length} archivo(s) a ${baseDir}...`);
    let uploaded = [];
    try {
      uploaded = await uploadFiles(baseDir, Array.from(files), role);
      await loadMediaAssets();
    } catch (error) {
      setStatus(error.message || 'No se pudieron agregar los archivos.');
      return;
    }

    if (mediaTarget?.input && uploaded[0]?.path) {
      await setMediaInputValue(mediaTarget.input, uploaded[0].path, files[0]);
      closeMediaPicker();
      syncAfterMediaChange(`Medio copiado a ${uploaded[0].path}.`);
      return;
    }

    setStatus(`${uploaded.length} archivo(s) agregados a la biblioteca.`);
    renderMediaPicker();
  }

  function formatBytes(size) {
    const bytes = Number(size) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function readAudioDuration(file) {
    return new Promise(resolve => {
      const audio = document.createElement('audio');
      const url = URL.createObjectURL(file);
      const finish = (seconds) => {
        URL.revokeObjectURL(url);
        resolve(seconds);
      };
      audio.preload = 'metadata';
      audio.addEventListener('loadedmetadata', () => finish(Number.isFinite(audio.duration) ? audio.duration : 0), { once: true });
      audio.addEventListener('error', () => finish(0), { once: true });
      audio.src = url;
    });
  }

  async function importMusicTracks(files) {
    if (mode !== 'music' || !files.length) return;
    syncCurrentFromForm();
    const entry = getCurrentEntry();
    const sortedFiles = Array.from(files).sort((a, b) => (a.lastModified || 0) - (b.lastModified || 0));
    const uploadBaseDir = `assets/music/${entry.id || 'release'}/audio`;
    let uploadedFiles = [];
    if (backendAvailable) {
      setStatus('Copiando audios al proyecto...');
      try {
        uploadedFiles = await uploadFiles(uploadBaseDir, sortedFiles, 'music-audio');
      } catch (error) {
        setStatus(error.message || 'No se pudieron importar los audios.');
        return;
      }
    }
    const tracks = [];

    for (const [index, file] of sortedFiles.entries()) {
      const seconds = await readAudioDuration(file);
      const uploadedPath = uploadedFiles[index]?.path;
      tracks.push({
        number: String(index + 1).padStart(2, '0'),
        title: fileTitle(file.name),
        duration: formatTimecode(seconds),
        webAudio: uploadedPath || filePathForTrack(file.name)
      });
    }

    entry.tracks = tracks;
    setStatus(backendAvailable
      ? `${tracks.length} tracks importados y copiados a ${uploadBaseDir}.`
      : `${tracks.length} tracks importados. Copia esos archivos a la carpeta indicada antes de publicar.`);
    render();
    persistDraft();
  }

  app.addEventListener('dragover', event => {
    const dropZone = event.target.closest('.admin-file-drop');
    if (!dropZone) return;
    event.preventDefault();
    dropZone.classList.add('is-dragover');
  });

  app.addEventListener('dragleave', event => {
    const dropZone = event.target.closest('.admin-file-drop');
    if (!dropZone || dropZone.contains(event.relatedTarget)) return;
    dropZone.classList.remove('is-dragover');
  });

  app.addEventListener('drop', event => {
    const dropZone = event.target.closest('.admin-file-drop');
    if (!dropZone) return;
    event.preventDefault();
    dropZone.classList.remove('is-dragover');
    const input = dropZone.querySelector('input[type="file"]');
    if (input?.dataset.action === 'import-music-tracks') importMusicTracks(event.dataTransfer.files);
    if (input?.dataset.action === 'import-collection-media') importCollectionMedia(event.dataTransfer.files);
  });

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll('`', '&#096;');
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      syncCurrentFromForm();
      mode = tab.dataset.mode;
      render();
      setStatus(mode === 'music' ? 'Editando Music Archives.' : 'Editando colecciones.');
    });
  });

  app.addEventListener('input', event => {
    if (!event.target.closest('[data-editor-form]')) return;
    if (event.target.name === 'title' && !form.elements.id.dataset.touched) {
      form.elements.id.value = slugify(event.target.value);
    }
    if (event.target.name === 'id') {
      form.elements.id.dataset.touched = 'true';
    }
    syncCurrentFromForm();
    renderList();
    renderValidationPanel();
    persistDraft();
  });

  app.addEventListener('change', event => {
    if (event.target.dataset.action === 'import-music-tracks') {
      importMusicTracks(event.target.files);
      event.target.value = '';
      return;
    }
    if (event.target.dataset.action === 'import-collection-media') {
      importCollectionMedia(event.target.files);
      event.target.value = '';
      return;
    }
    if (event.target.dataset.action === 'upload-media-field') {
      const input = getMediaInputFromButton(event.target);
      uploadMediaForField(input, event.target.files, event.target.dataset.mediaRole);
      event.target.value = '';
      return;
    }
    if (!event.target.closest('[data-editor-form]')) return;
    syncCurrentFromForm();
    renderList();
    renderValidationPanel();
    persistDraft();
    if (
      event.target.name === 'section-type' ||
      ['type', 'cover', 'item-src', 'section-background', 'section-image'].includes(event.target.name)
    ) {
      renderForm();
    }
  });

  app.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'new-entry') createEntry();
    if (action === 'duplicate-entry') duplicateEntry();
    if (action === 'delete-entry') deleteEntry();
    if (action === 'open-media-picker') openMediaPicker(button);
    if (action === 'open-media-library') openMediaPicker();
    if (action === 'remove-row') removeRow(button);
    if (action === 'move-row-up') moveRow(button, -1);
    if (action === 'move-row-down') moveRow(button, 1);
    if (action.startsWith('add-')) addRow(action);
    if (action === 'preview-entry') previewCurrentEntry();
    if (action === 'publish-entry') setCurrentPublicationStatus('published');
    if (action === 'hide-entry') setCurrentPublicationStatus('archived');
    if (action === 'preview-music-archive') previewMusicArchive();
    if (action === 'save-draft') saveDraft();
    if (action === 'reset-from-site') resetFromSite();
    if (action === 'copy-js') copyJs();
    if (action === 'download-js') exportData();
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action="logout-admin"]');
    if (!button) return;
    logoutAdmin();
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    saveDraft();
  });

  render();
  detectBackend();
})();
