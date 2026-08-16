function initSplits() {
  const splitContainers = document.querySelectorAll('[data-split-container]');
  splitContainers.forEach(container => {
    const range = container.parentElement.querySelector('[data-split-range]');
    const divider = container.querySelector('.split__divider');
    if (!range || !divider) return;

    const labelBefore = container.querySelector('.split__label--before');
    const labelAfter = container.querySelector('.split__label--after');

    const applySplit = value => {
      container.style.setProperty('--split', `${value}%`);
      const v = Number(value);
      // "Antes" visible when slider shows enough of the before side (low values)
      // "Después" visible when slider shows enough of the after side (high values)
      if (labelBefore) labelBefore.classList.toggle('is-visible', v < 75);
      if (labelAfter) labelAfter.classList.toggle('is-visible', v > 25);
    };

    range.addEventListener('input', e => applySplit(e.target.value));
    applySplit(range.value || 50);
  });
}

function wireImageInputs() {
  const beforeImg = document.querySelector('[data-image-display="before"]');
  const afterImg = document.querySelector('[data-image-display="after"]');
  const beforeInput = document.querySelector('[data-image-before]');
  const afterInput = document.querySelector('[data-image-after]');

  const loadImage = (fileInput, imgTag) => {
    fileInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        imgTag.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  if (beforeInput && beforeImg) loadImage(beforeInput, beforeImg);
  if (afterInput && afterImg) loadImage(afterInput, afterImg);
}

function wireVideoInputs() {
  const beforeVideo = document.querySelector('[data-video-display="before"]');
  const afterVideo = document.querySelector('[data-video-display="after"]');
  const beforeInput = document.querySelector('[data-video-before]');
  const afterInput = document.querySelector('[data-video-after]');

  const setSource = (video, file) => {
    if (!video || !file) return;
    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();
    video.dataset.userProvided = 'true';
    video.play().catch(() => {});
  };

  if (beforeInput && beforeVideo) {
    beforeInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      setSource(beforeVideo, file);
      if (afterVideo?.dataset.userProvided === 'true') syncVideos(beforeVideo, afterVideo);
    });
  }

  if (afterInput && afterVideo) {
    afterInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      setSource(afterVideo, file);
      if (beforeVideo?.dataset.userProvided === 'true') syncVideos(beforeVideo, afterVideo);
    });
  }

  if (beforeVideo && afterVideo) {
    syncVideoPair(beforeVideo, afterVideo);
  }
}

function autoPlayVideos() {
  const vids = document.querySelectorAll('[data-video-display]');
  vids.forEach(v => {
    v.muted = true;
    v.play().catch(() => {});
  });

  const meters = document.querySelectorAll('[data-meter-display]');
  meters.forEach(v => {
    v.muted = true; // start muted to satisfy autoplay; will unmute when volume rises
    v.play().catch(() => {});
  });
}

/**
 * Pairs two videos for synchronised looping.
 *
 * Native loop is hardware-accelerated and gapless. Both videos share the same
 * duration, so the browser keeps them within ~20-30 ms of each other — invisible
 * in a split view. Zero JS overhead during playback: no intervals, no rAF,
 * no event listeners. Just start them together and let the browser do its job.
 */
/**
 * Keeps two videos perfectly synchronised with endless looping.
 *
 * Native loop is disabled so `ended` fires. When either video ends, both
 * pause, seek to 0, wait for both `seeked` confirmations, then play together.
 * Zero JS during normal playback — no intervals, no polling, no drift
 * correction. The only cost is a micro-pause (~50ms) at each loop boundary.
 */
function syncVideoPair(primary, secondary) {
  if (!primary || !secondary) return;

  primary.loop = false;
  secondary.loop = false;

  let resetting = false;

  const restart = () => {
    if (resetting) return;
    resetting = true;
    primary.pause();
    secondary.pause();
    primary.currentTime = 0;
    secondary.currentTime = 0;

    let ready = 0;
    const onSeeked = function () {
      ready++;
      if (ready < 2) return;
      primary.removeEventListener('seeked', onSeeked);
      secondary.removeEventListener('seeked', onSeeked);
      Promise.allSettled([primary.play(), secondary.play()])
        .finally(() => { resetting = false; });
    };
    primary.addEventListener('seeked', onSeeked);
    secondary.addEventListener('seeked', onSeeked);
  };

  primary.addEventListener('ended', restart);
  secondary.addEventListener('ended', restart);

  // Initial sync start — wait for both to buffer
  const start = () => {
    if (primary.readyState < 3 || secondary.readyState < 3) return;
    primary.removeEventListener('canplay', start);
    secondary.removeEventListener('canplay', start);
    primary.currentTime = 0;
    secondary.currentTime = 0;
    primary.play().catch(() => {});
    secondary.play().catch(() => {});
  };

  primary.addEventListener('canplay', start);
  secondary.addEventListener('canplay', start);
  start();
}

function syncVideos(a, b) {
  if (!a || !b) return;
  const time = Math.min(a.currentTime, b.currentTime);
  a.currentTime = time;
  b.currentTime = time;
}

async function wireAudio() {
  const beforeAudio = document.querySelector('[data-audio-display="before"]');
  const afterAudio = document.querySelector('[data-audio-display="after"]');
  const beforeInput = document.querySelector('[data-audio-before]');
  const afterInput = document.querySelector('[data-audio-after]');
  const fader = document.querySelector('[data-audio-fader]');
  const snapBeforeBtn = document.querySelector('[data-action="snap-before"]');
  const snapAfterBtn = document.querySelector('[data-action="snap-after"]');
  const resetBtn = document.querySelector('[data-action="reset-ab"]');

  if (!beforeAudio || !afterAudio) return;

  const demoBefore = await renderTone({ mode: 'before' });
  const demoAfter = await renderTone({ mode: 'after' });
  beforeAudio.src = demoBefore;
  afterAudio.src = demoAfter;

  const setAudioFile = (input, audioEl) => {
    input.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      audioEl.src = url;
      audioEl.load();
      audioEl.currentTime = 0;
      audioEl.play().catch(() => {});
    });
  };

  if (beforeInput) setAudioFile(beforeInput, beforeAudio);
  if (afterInput) setAudioFile(afterInput, afterAudio);

  const defaultFade = 35; // 0 = before only, 100 = after only
  let mixValue = defaultFade / 100;
  let masterLevel = 0;

  const applyVolumes = () => {
    const beforeVol = (1 - mixValue) * masterLevel;
    const afterVol = mixValue * masterLevel;
    beforeAudio.volume = beforeVol;
    afterAudio.volume = afterVol;
    const muteState = masterLevel === 0;
    beforeAudio.muted = muteState;
    afterAudio.muted = muteState;
  };

  const applyFader = value => {
    mixValue = Math.min(1, Math.max(0, value / 100));
    applyVolumes();
  };

  const setMasterLevel = level => {
    masterLevel = Math.min(1, Math.max(0, level));
    applyVolumes();
    if (masterLevel > 0) {
      beforeAudio.play().catch(() => {});
      afterAudio.play().catch(() => {});
    }
  };

  const snapTo = value => {
    if (fader) fader.value = value;
    applyFader(value);
  };

  const alignPlayback = (leader, follower) => {
    if (Math.abs(leader.currentTime - follower.currentTime) > 0.08) {
      follower.currentTime = leader.currentTime;
    }
  };

  const ensureDualPlay = origin => {
    const partner = origin === beforeAudio ? afterAudio : beforeAudio;
    alignPlayback(origin, partner);
    partner.play().catch(() => {});
  };

  const lockTime = (source, target) => {
    source.addEventListener('timeupdate', () => alignPlayback(source, target));
  };

  lockTime(beforeAudio, afterAudio);
  lockTime(afterAudio, beforeAudio);

  beforeAudio.addEventListener('play', () => ensureDualPlay(beforeAudio));
  afterAudio.addEventListener('play', () => ensureDualPlay(afterAudio));

  beforeAudio.addEventListener('pause', () => {
    if (!afterAudio.paused) afterAudio.pause();
  });
  afterAudio.addEventListener('pause', () => {
    if (!beforeAudio.paused) beforeAudio.pause();
  });

  fader?.addEventListener('input', e => applyFader(e.target.value));

  snapBeforeBtn?.addEventListener('click', () => {
    snapTo(0);
    ensureDualPlay(beforeAudio);
  });

  snapAfterBtn?.addEventListener('click', () => {
    snapTo(100);
    ensureDualPlay(afterAudio);
  });

  resetBtn?.addEventListener('click', () => {
    beforeAudio.pause();
    afterAudio.pause();
    beforeAudio.currentTime = 0;
    afterAudio.currentTime = 0;
    snapTo(defaultFade);
    setMasterLevel(masterLevel);
  });

  document.addEventListener('keydown', e => {
    if (e.code === 'Space') {
      e.preventDefault();
      const current = fader ? Number(fader.value) : defaultFade;
      const next = current >= 50 ? 0 : 100;
      snapTo(next);
      ensureDualPlay(next === 0 ? beforeAudio : afterAudio);
    }
  });

  snapTo(fader ? Number(fader.value) : defaultFade);

  // try to autoplay silently until scroll raises master level
  beforeAudio.muted = true;
  afterAudio.muted = true;
  beforeAudio.play().catch(() => {});
  afterAudio.play().catch(() => {});

  return {
    setMasterLevel,
    getMasterLevel: () => masterLevel,
    applyFader,
  };
}

function wireMeterVideos() {
  const beforeVideo = document.querySelector('[data-meter-display="before"]');
  const afterVideo = document.querySelector('[data-meter-display="after"]');
  const beforeInput = document.querySelector('[data-meter-before]');
  const afterInput = document.querySelector('[data-meter-after]');

  const setSource = (video, file) => {
    if (!video || !file) return;
    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();
    video.dataset.userProvided = 'true';
    video.play().catch(() => {});
  };

  if (beforeInput && beforeVideo) {
    beforeInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      setSource(beforeVideo, file);
      if (afterVideo?.dataset.userProvided === 'true') syncVideos(beforeVideo, afterVideo);
    });
  }

  if (afterInput && afterVideo) {
    afterInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      setSource(afterVideo, file);
      if (beforeVideo?.dataset.userProvided === 'true') syncVideos(beforeVideo, afterVideo);
    });
  }

  if (beforeVideo && afterVideo) {
    syncVideoPair(beforeVideo, afterVideo);
  }
}

async function renderTone({ mode }) {
  const duration = 4;
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(2, duration * sampleRate, sampleRate);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = mode === 'before' ? 180 : 200;

  const shaper = ctx.createWaveShaper();
  shaper.curve = makeDistortionCurve(mode === 'before' ? 30 : 12);

  const filter = ctx.createBiquadFilter();
  if (mode === 'before') {
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 0.8;
  } else {
    filter.type = 'lowshelf';
    filter.frequency.value = 120;
    filter.gain.value = 3.5;
  }

  const gain = ctx.createGain();
  gain.gain.value = mode === 'before' ? 0.22 : 0.33;

  osc.connect(shaper).connect(filter).connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(duration);

  const buffer = await ctx.startRendering();
  const wav = bufferToWave(buffer);
  const blob = new Blob([wav], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function makeDistortionCurve(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function bufferToWave(abuffer) {
  const numOfChan = abuffer.numberOfChannels;
  const length = abuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let offset = 0;
  let pos = 0;

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt "
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for (let i = 0; i < abuffer.numberOfChannels; i++) {
    channels.push(abuffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      const sample = Math.max(-1, Math.min(1, channels[i][offset]));
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      pos += 2;
    }
    offset++;
  }

  return buffer;

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

let audioControl;

async function init() {
  initAdminCreateLink();
  initSplits();
  wireImageInputs();
  wireVideoInputs();
  wireMeterVideos();
  audioControl = await wireAudio();
  initAudioMasterScroll(audioControl);
  autoPlayVideos();
  initCollectionsPage();
  initMusicIndexPage();
  initMusicArchivePage();
  initReveal();
  initMeterAudioControl();
  initNavActiveState();
  initMusicPlayer();
  initOp14Player();
  initDynamicBackButton();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function initAdminCreateLink() {
  const navLists = document.querySelectorAll('.nav__links');
  if (!navLists.length) return;

  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.authenticated) return;

    navLists.forEach(list => {
      if (list.querySelector('[data-admin-create-link]')) return;
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = 'admin.html';
      link.className = 'nav__link nav__link--create';
      link.dataset.adminCreateLink = '';
      link.textContent = 'Crear';
      item.append(link);
      list.append(item);
    });
  } catch (error) {
    // Public pages stay unchanged when the local backend is not available.
  }
}

function initAudioMasterScroll(control) {
  if (!control) return;
  const section = document.getElementById('audio');
  if (!section) return;

  const computeLevel = () => {
    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const visible = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    const maxVisible = Math.min(vh, rect.height || vh);
    const ratio = maxVisible ? visible / maxVisible : 0;
    const eased = Math.min(1, Math.max(0, ratio));
    control.setMasterLevel(eased);
  };

  const onScroll = () => {
    window.requestAnimationFrame(computeLevel);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  computeLevel();
}

function initMeterAudioControl() {
  const beforeMeter = document.querySelector('[data-meter-display="before"]');
  const afterMeter = document.querySelector('[data-meter-display="after"]');
  const fader = document.querySelector('#visualizer [data-split-range]');
  const section = document.getElementById('visualizer');
  const enableBtn = document.querySelector('[data-action="enable-meter-audio"]');
  if (!beforeMeter || !afterMeter || !fader || !section) return;

  let mix = (Number(fader.value) || 50) / 100;
  let masterLevel = 0;
  let unlocked = false;

  const applyVolumes = () => {
    const beforeVol = (1 - mix) * masterLevel;
    const afterVol = mix * masterLevel;
    beforeMeter.muted = masterLevel === 0;
    afterMeter.muted = masterLevel === 0;
    beforeMeter.volume = beforeVol;
    afterMeter.volume = afterVol;
    if (unlocked) {
      beforeMeter.play().catch(() => {});
      afterMeter.play().catch(() => {});
    }
  };

  const setMaster = level => {
    masterLevel = Math.min(1, Math.max(0, level));
    applyVolumes();
  };

  fader.addEventListener('input', e => {
    mix = Math.min(1, Math.max(0, Number(e.target.value) / 100));
    applyVolumes();
  });

  enableBtn?.addEventListener('click', () => {
    unlocked = true;
    if (masterLevel === 0) {
      masterLevel = 0.6;
    }
    beforeMeter.currentTime = 0;
    afterMeter.currentTime = 0;
    beforeMeter.muted = false;
    afterMeter.muted = false;
    beforeMeter.play().catch(() => {});
    afterMeter.play().catch(() => {});
    applyVolumes();
  });

  const computeLevel = () => {
    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const visible = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    const maxVisible = Math.min(vh, rect.height || vh);
    const ratio = maxVisible ? visible / maxVisible : 0;
    const eased = Math.min(1, Math.max(0, ratio));
    setMaster(eased);
  };

  const onScroll = () => window.requestAnimationFrame(computeLevel);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  computeLevel();
}

function initReveal() {
  const elements = document.querySelectorAll('[data-reveal]');
  if (!elements.length) return;

  const reveal = element => {
    element.classList.add('is-visible');
  };

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        reveal(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.01 });

  elements.forEach(el => {
    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const isAlreadyVisible = rect.top < viewportHeight && rect.bottom > 0;

    if (isAlreadyVisible) {
      reveal(el);
      return;
    }

    observer.observe(el);
  });
}

function initNavActiveState() {
  const navLinks = document.querySelectorAll('.nav__link');
  if (!navLinks.length) return;

  // On subpages the active state is set in HTML; on index only observe preview sections
  const sectionIds = ['video', 'image', 'visualizer'];
  const sections = sectionIds.map(id => document.getElementById(id)).filter(Boolean);
  if (!sections.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Only toggle active on hash links (in-page), not page links
        navLinks.forEach(link => {
          if (link.getAttribute('href')?.startsWith('#')) {
            link.classList.remove('is-active');
          }
        });
        const activeLink = document.querySelector(`.nav__link[href="#${entry.target.id}"]`);
        activeLink?.classList.add('is-active');
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px' });

  sections.forEach(section => observer.observe(section));
}

function initCollectionsPage() {
  const app = document.querySelector('[data-collections-app]');
  const params = new URLSearchParams(window.location.search);
  const previewMode = params.get('preview') === 'admin';
  const previewId = params.get('id');
  const sourceCollections = previewMode
    ? (window.DE_LA_MANGA_COLLECTIONS || [])
    : (window.DE_LA_MANGA_COLLECTIONS || []).filter(item => isPublishedStatus(item.status));
  const collections = previewMode && previewId
    ? sourceCollections.filter(collection => collection.id === previewId)
    : sourceCollections;
  if (!app) return;

  const filtersEl = app.querySelector('[data-collection-filters]');
  const gridEl = app.querySelector('[data-collection-grid]');
  const detailsEl = app.querySelector('[data-collection-details]');
  const types = ['Todas', ...new Set(collections.map(collection => collection.type))];
  let activeType = 'Todas';
  let hasRendered = false;

  const isVideo = src => /\.(mp4|mov|webm)$/i.test(src || '');

  const createMedia = item => {
    if (!item?.src) {
      return createCollectionFallback(item?.alt || item?.caption || '');
    }

    const media = isVideo(item.src) ? document.createElement('video') : document.createElement('img');
    media.className = 'collection-media__asset';
    media.src = item.src;

    if (isVideo(item.src)) {
      media.muted = true;
      media.loop = true;
      media.playsInline = true;
      media.autoplay = true;
      media.setAttribute('aria-label', item.alt || item.caption || '');
      media.play?.().catch(() => {});
    } else {
      media.alt = item.alt || item.caption || '';
      media.loading = 'lazy';
    }

    return media;
  };

  const createCollectionFallback = label => {
    const fallback = document.createElement('div');
    fallback.className = 'collection-media__asset collection-media__fallback';
    fallback.textContent = getArchiveInitials(label || 'DM');
    return fallback;
  };

  const createCollectionCover = collection => {
    if (collection.href === 'musica.html' || collection.type === 'Música') {
      return createMusicCollectionCover(collection);
    }

    return createMedia({ src: collection.cover, alt: collection.title });
  };

  const createMusicCollectionCover = collection => {
    const archives = (window.DE_LA_MANGA_MUSIC_ARCHIVES || []).filter(item => isPublishedStatus(item.status));
    const mosaic = document.createElement('div');
    mosaic.className = 'collection-music-mosaic';
    if (archives.length <= 1) {
      mosaic.classList.add('collection-music-mosaic--single');
    }

    archives.slice(0, 4).forEach(archive => {
      const tile = document.createElement('div');
      tile.className = 'collection-music-mosaic__tile';

      const fallback = document.createElement('div');
      fallback.className = 'collection-music-mosaic__fallback';
      fallback.textContent = getArchiveInitials(archive.title);
      tile.append(fallback);

      if (archive.cover) {
        const image = document.createElement('img');
        image.src = archive.cover;
        image.alt = `${archive.title || 'Music archive'} - portada`;
        image.loading = 'lazy';
        image.addEventListener('error', () => image.remove(), { once: true });
        tile.append(image);
      }

      mosaic.append(tile);
    });

    if (!mosaic.children.length) {
      mosaic.append(createCollectionFallback(collection.title));
    }

    return mosaic;
  };

  const createTag = text => {
    const tag = document.createElement('span');
    tag.className = 'collection-tag';
    tag.textContent = text;
    return tag;
  };

  const renderFilters = () => {
    filtersEl.replaceChildren();

    types.forEach(type => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'collection-filter';
      button.textContent = type;
      button.setAttribute('aria-pressed', String(type === activeType));
      button.addEventListener('click', () => {
        activeType = type;
        render();
      });
      filtersEl.append(button);
    });
  };

  const renderCards = filteredCollections => {
    gridEl.replaceChildren();

    filteredCollections.forEach(collection => {
      const card = document.createElement('article');
      card.className = 'collection-card';
      card.dataset.reveal = '';
      if (hasRendered) card.classList.add('is-visible');

      const link = document.createElement('a');
      link.className = 'collection-card__link';
      link.href = collection.href || `#${collection.id}`;

      const mediaWrap = document.createElement('div');
      mediaWrap.className = 'collection-card__media';
      mediaWrap.append(createCollectionCover(collection));

      const body = document.createElement('div');
      body.className = 'collection-card__body';

      const meta = document.createElement('div');
      meta.className = 'collection-card__meta';
      meta.textContent = collection.type;

      const title = document.createElement('h3');
      title.className = 'collection-card__title';
      title.textContent = collection.title;

      const summary = document.createElement('p');
      summary.className = 'collection-card__summary';
      summary.textContent = collection.summary;

      const tags = document.createElement('div');
      tags.className = 'collection-tags';
      collection.tags?.forEach(tag => tags.append(createTag(tag)));

      body.append(meta, title, summary, tags);
      link.append(mediaWrap, body);
      card.append(link);
      gridEl.append(card);
    });
  };

  const renderDetails = filteredCollections => {
    detailsEl.replaceChildren();

    filteredCollections.forEach(collection => {
      const section = document.createElement('section');
      section.className = 'collection-detail';
      section.id = collection.id;
      section.dataset.reveal = '';
      if (hasRendered) section.classList.add('is-visible');

      const head = document.createElement('div');
      head.className = 'collection-detail__head';

      const kicker = document.createElement('p');
      kicker.className = 'eyebrow';
      kicker.textContent = collection.type;

      const title = document.createElement('h3');
      title.textContent = collection.title;

      const summary = document.createElement('p');
      summary.textContent = collection.summary;

      head.append(kicker, title, summary);

      if (collection.href) {
        const cta = document.createElement('a');
        cta.className = 'collection-detail__cta';
        cta.href = collection.href;
        cta.textContent = collection.href === 'musica.html' ? 'Ver proyectos musicales' : 'Abrir archivo';
        head.append(cta);
      }

      const mediaGrid = document.createElement('div');
      mediaGrid.className = 'collection-media-grid';

      const items = collection.items || [];
      if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'collection-empty';
        empty.textContent = collection.href
          ? 'Archivo dedicado.'
          : 'Colección en preparación.';
        mediaGrid.append(empty);
      }

      items.forEach(item => {
        const figure = document.createElement('figure');
        figure.className = 'collection-media';
        figure.append(createMedia(item));

        const caption = document.createElement('figcaption');
        caption.textContent = item.caption || '';
        figure.append(caption);
        mediaGrid.append(figure);
      });

      section.append(head, mediaGrid);
      detailsEl.append(section);
    });
  };

  const render = () => {
    const filteredCollections = activeType === 'Todas'
      ? collections
      : collections.filter(collection => collection.type === activeType);

    renderFilters();
    renderCards(filteredCollections);
    renderDetails(filteredCollections);
    if (!filteredCollections.length) {
      const empty = document.createElement('p');
      empty.className = 'collection-empty';
      empty.textContent = 'Colección en preparación.';
      gridEl.append(empty);
    }
    hasRendered = true;
  };

  render();
}

function isPublishedStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return true;
  return !['draft', 'borrador', 'hidden', 'oculto', 'oculta', 'archived', 'archive', 'archivado', 'archivada'].includes(value);
}

function initMusicIndexPage() {
  const grid = document.querySelector('[data-music-index]');
  const archives = (window.DE_LA_MANGA_MUSIC_ARCHIVES || []).filter(item => isPublishedStatus(item.status));
  if (!grid) return;

  grid.replaceChildren();

  if (!archives.length) {
    const empty = document.createElement('p');
    empty.className = 'album-empty';
    empty.textContent = 'Archivo musical en preparación.';
    grid.append(empty);
    return;
  }

  archives.forEach(archive => {
    grid.append(createMusicIndexCard(archive));
  });
}

function createMusicIndexCard(archive) {
  const card = document.createElement('a');
  card.className = 'album-card';
  card.href = `music-archive.html?id=${encodeURIComponent(archive.id)}`;
  card.dataset.reveal = '';

  const cover = document.createElement('div');
  cover.className = 'album-card__cover';

  const fallback = document.createElement('div');
  fallback.className = 'album-card__fallback';
  fallback.textContent = getArchiveInitials(archive.title);
  cover.append(fallback);

  if (archive.cover) {
    const image = document.createElement('img');
    image.className = 'album-card__image';
    image.src = archive.cover;
    image.alt = `${archive.title || 'Music archive'} - portada`;
    image.addEventListener('error', () => {
      image.remove();
      cover.classList.add('album-card__cover--fallback');
    }, { once: true });
    image.addEventListener('load', () => {
      cover.classList.remove('album-card__cover--fallback');
    }, { once: true });
    cover.append(image);
  } else {
    cover.classList.add('album-card__cover--fallback');
  }

  const info = document.createElement('div');
  info.className = 'album-card__info';

  const title = document.createElement('h3');
  title.className = 'album-card__title';
  title.textContent = archive.title || 'Sin título';

  const meta = document.createElement('p');
  meta.className = 'album-card__meta';
  meta.textContent = [
    archive.releaseType || 'release',
    archive.year,
    `${archive.tracks?.length || 0} ${archive.tracks?.length === 1 ? 'track' : 'tracks'}`,
    archive.totalDuration
  ].filter(Boolean).join(' • ');

  const desc = document.createElement('p');
  desc.className = 'album-card__desc';
  desc.textContent = getArchiveDescription(archive);

  const cta = document.createElement('div');
  cta.className = 'album-card__cta';
  cta.textContent = `Ver ${archive.releaseType === 'single' ? 'single' : 'archivo'} →`;

  info.append(title, meta, desc, cta);
  card.append(cover, info);
  return card;
}

function getArchiveDescription(archive) {
  if (archive.summary) return archive.summary;
  const textSection = archive.sections?.find(section => section.body);
  if (textSection?.body) return textSection.body;
  return `${archive.releaseType || 'Release'} de ${archive.artist || 'De La Manga'}.`;
}

function getArchiveInitials(title) {
  return String(title || 'DM')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase() || 'DM';
}

function initMusicArchivePage() {
  const root = document.querySelector('[data-music-archive-root]');
  const archives = window.DE_LA_MANGA_MUSIC_ARCHIVES || [];
  if (!root || !archives.length) return;

  const params = new URLSearchParams(window.location.search);
  const previewMode = params.get('preview') === 'admin';
  const availableArchives = previewMode ? archives : archives.filter(item => isPublishedStatus(item.status));
  const archiveId = params.get('id') || availableArchives[0]?.id;
  const archive = availableArchives.find(item => item.id === archiveId) || availableArchives[0];
  const backLink = document.querySelector('[data-music-back]');

  if (!archive) {
    root.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'album-empty';
    empty.textContent = 'Archivo musical no disponible.';
    root.append(empty);
    return;
  }

  document.title = `${archive.title} — ${archive.releaseType || 'Music Archive'}`;
  document.body.dataset.musicArtist = archive.artist || '';
  document.body.dataset.musicTitle = archive.title || '';

  if (backLink) {
    backLink.href = archive.backHref || 'musica.html';
    backLink.textContent = `← ${archive.backLabel || 'Volver'}`;
  }

  root.replaceChildren();

  archive.sections.forEach((section, index) => {
    const sectionEl = document.createElement('section');
    sectionEl.className = `op14-section op14-section--${index + 1}`;
    sectionEl.dataset.archiveSection = section.id || String(index + 1);
    if (section.background) {
      sectionEl.style.backgroundImage = `url("${section.background}")`;
    }

    const overlay = document.createElement('div');
    overlay.className = 'op14-section__overlay';

    const content = document.createElement('div');
    content.className = 'op14-content';

    if (section.type === 'cover') {
      content.append(createArchiveCover(archive));
    } else if (section.type === 'player') {
      content.append(createArchivePlayer(archive, section));
    } else if (section.type === 'text') {
      content.append(createArchiveText(section));
    } else {
      content.append(createArchiveImage(section));
    }

    sectionEl.append(overlay, content);
    root.append(sectionEl);
  });
}

function createArchiveCover(archive) {
  const card = document.createElement('div');
  card.className = 'glass-card';
  card.dataset.reveal = '';

  const image = document.createElement('img');
  image.className = 'glass-card__image';
  image.src = archive.cover;
  image.alt = `${archive.title} - portada`;

  const title = document.createElement('div');
  title.className = 'glass-card__title';
  title.textContent = archive.title;

  const subtitle = document.createElement('div');
  subtitle.className = 'glass-card__subtitle';
  subtitle.textContent = [
    archive.releaseType,
    `${archive.tracks?.length || 0} tracks`,
    archive.totalDuration
  ].filter(Boolean).join(' • ');

  card.append(image, title, subtitle);
  return card;
}

function createArchiveImage(section) {
  const block = document.createElement('div');
  block.className = 'op14-text-block';
  block.dataset.reveal = '';

  const image = document.createElement('img');
  image.className = 'op14-text-image';
  image.src = section.image;
  image.alt = section.alt || '';

  block.append(image);
  return block;
}

function createArchiveText(section) {
  const block = document.createElement('div');
  block.className = 'op14-text-block music-archive-text';
  block.dataset.reveal = '';

  if (section.title) {
    const title = document.createElement('h2');
    title.textContent = section.title;
    block.append(title);
  }

  if (section.body) {
    const body = document.createElement('p');
    body.textContent = section.body;
    block.append(body);
  }

  return block;
}

function createArchivePlayer(archive, section) {
  const block = document.createElement('div');
  block.className = 'op14-player-block';
  block.dataset.reveal = '';

  const title = document.createElement('h2');
  title.className = 'op14-player-block__title';
  title.textContent = section.title || 'Escucha';

  const tracklist = document.createElement('div');
  tracklist.className = 'op14-tracklist';

  archive.tracks.forEach((track, index) => {
    const item = document.createElement('div');
    item.className = 'op14-track';
    item.dataset.track = String(index);
    item.dataset.trackDuration = track.duration || '';

    const info = document.createElement('div');
    info.className = 'op14-track__info';

    const number = document.createElement('span');
    number.className = 'op14-track__num';
    number.textContent = track.number || String(index + 1).padStart(2, '0');

    const trackTitle = document.createElement('h3');
    trackTitle.className = 'op14-track__title';
    trackTitle.textContent = track.title || `Track ${index + 1}`;

    const duration = document.createElement('span');
    duration.className = 'op14-track__time';
    duration.textContent = track.duration || '';

    const button = document.createElement('button');
    button.className = 'op14-track__btn';
    button.type = 'button';
    button.setAttribute('aria-label', `Play ${track.title || `Track ${index + 1}`}`);
    button.dataset.trackSrc = track.webAudio || track.sources?.[0]?.src || '';
    button.dataset.trackDuration = track.duration || '';
    button.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';

    info.append(number, trackTitle, duration);
    item.append(info, button);
    tracklist.append(item);
  });

  const controls = document.createElement('div');
  controls.className = 'op14-player-controls';
  controls.dataset.player = '';
  controls.innerHTML = `
    <div class="op14-player-progress">
      <div class="op14-progress-bar">
        <div class="op14-progress-bar__filled" style="width: 0%"></div>
      </div>
      <div class="op14-progress-time">
        <span class="op14-time-current">0:00</span>
        <span class="op14-time-duration">${archive.tracks[0]?.duration || '0:00'}</span>
      </div>
    </div>
    <div class="op14-player-main">
      <button class="op14-play-btn" type="button" aria-label="Play/Pause">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M8 5v14l11-7z" fill="currentColor"/>
        </svg>
        <svg class="op14-player-loading" width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="15.7 62.8" opacity="0.5"/>
        </svg>
      </button>
      <div class="op14-player-info">
        <div class="op14-player-title">${archive.tracks[0]?.title || ''}</div>
        <div class="op14-player-artist">${archive.title}</div>
      </div>
    </div>
  `;

  const streamingLinks = createArchiveStreamingLinks(archive.links);
  if (streamingLinks) controls.append(streamingLinks);

  const downloads = document.createElement('div');
  downloads.className = 'op14-download-section';

  (archive.downloads || []).forEach(download => {
    if (!download.href) return;

    const link = document.createElement('a');
    link.className = 'op14-download-btn';
    link.href = download.href;
    if (download.filename) link.download = download.filename;
    link.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2v10m0 0l-3-3m3 3l3-3m-3 8v3m6-4H6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    link.append(document.createTextNode(download.label || download.format || 'Descargar'));
    downloads.append(link);
  });

  block.append(title, tracklist, controls);
  if (downloads.children.length) block.append(downloads);
  return block;
}

function createArchiveStreamingLinks(links = []) {
  const activeLinks = links.filter(link => link.href);
  if (!activeLinks.length) return null;

  const group = document.createElement('div');
  group.className = 'op14-streaming-links';
  group.setAttribute('aria-label', 'Enlaces de streaming');

  activeLinks.forEach(linkData => {
    const platform = normalizeArchivePlatform(linkData.platform);
    const link = document.createElement('a');
    link.className = `op14-streaming-link op14-streaming-link--${platform}`;
    link.href = linkData.href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.innerHTML = getArchiveLinkIcon(platform);
    link.append(document.createTextNode(linkData.label || getArchiveLinkLabel(platform)));
    group.append(link);
  });

  return group;
}

function normalizeArchivePlatform(platform) {
  const value = String(platform || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');

  if (value === 'apple' || value === 'applemusic') return 'apple-music';
  if (value === 'sound-cloud') return 'soundcloud';
  return value || 'external';
}

function getArchiveLinkLabel(platform) {
  if (platform === 'spotify') return 'Spotify';
  if (platform === 'apple-music') return 'Apple Music';
  if (platform === 'soundcloud') return 'SoundCloud';
  return 'Escuchar';
}

function getArchiveLinkIcon(platform) {
  if (platform === 'spotify') {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M7.8 9.4c2.8-.8 6.1-.5 8.5.9M8.2 12.2c2.2-.6 4.9-.4 6.8.7M8.6 14.8c1.7-.4 3.6-.3 5 .5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  }

  if (platform === 'apple-music') {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16 5.2v9.7a3.2 3.2 0 1 1-1.7-2.8V7.3L9 8.4v7.5a3.2 3.2 0 1 1-1.7-2.8V6.8L16 5.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  }

  if (platform === 'soundcloud') {
    return '<svg width="24" height="20" viewBox="0 0 28 20" fill="none" aria-hidden="true"><path d="M10.3 17.2H5.4a3.7 3.7 0 0 1-.5-7.4 5.8 5.8 0 0 1 9.9-3.3 6.2 6.2 0 0 1 11 4 6.7 6.7 0 0 1-.1 1.1 2.8 2.8 0 0 1-.7 5.6H10.3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 7.4v9.8M10.4 5.3v11.9M12.8 5.6v11.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  }

  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 7H7a5 5 0 0 0 0 10h3m4-10h3a5 5 0 0 1 0 10h-3m-6-5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
}

/* ── Music Player ───────────────────────────────────────────── */
function initMusicPlayer() {
  const audio = document.getElementById('player-audio');
  
  // Find play button (works for both musica.html and album-operacion14.html)
  let playBtn = document.querySelector('.btn-player--play') || 
                document.querySelector('.btn-album-play');
  
  // Find track items
  let trackItems = document.querySelectorAll('.track-item') || 
                   document.querySelectorAll('.track-card');
  
  if (document.querySelectorAll('.track-card').length > 0) {
    trackItems = document.querySelectorAll('.track-card');
  }

  const progressBar = document.querySelector('.progress-bar__filled');
  const currentTimeEl = document.querySelector('.time-current');
  const container = document.querySelector('[data-player]');
  
  // Track name elements (handle both layouts)
  let playerTrackNameEl = document.querySelector('.player-track-name') ||
                          document.querySelector('.player-track-title');

  if (!audio || !playBtn || !trackItems.length || !container) return;

  let currentTrackIndex = 0;

  const updateProgressBar = () => {
    if (audio.duration) {
      const percentage = (audio.currentTime / audio.duration) * 100;
      progressBar.style.width = `${percentage}%`;
      currentTimeEl.textContent = formatTime(audio.currentTime);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const loadTrack = (index) => {
    if (index < 0 || index >= trackItems.length) return;
    currentTrackIndex = index;
    
    const trackItem = trackItems[index];
    const button = trackItem.querySelector('button[data-track-src]');
    if (!button) return;
    
    const src = button.dataset.trackSrc;
    const title = trackItem.querySelector('h3')?.textContent || 
                  trackItem.querySelector('.track-card__title')?.textContent;

    audio.src = src;
    if (playerTrackNameEl) {
      playerTrackNameEl.textContent = title;
    }

    // Update active track UI
    trackItems.forEach((item, i) => {
      item.classList.toggle('is-playing', i === index);
    });
  };

  const play = () => {
    if (!audio.src) loadTrack(0);
    audio.play();
    playBtn.classList.add('is-playing');
  };

  const pause = () => {
    audio.pause();
    playBtn.classList.remove('is-playing');
  };

  const togglePlay = () => {
    if (audio.paused) {
      play();
    } else {
      pause();
    }
  };

  // Play button click
  playBtn.addEventListener('click', togglePlay);

  // Track item clicks
  trackItems.forEach((item, index) => {
    const button = item.querySelector('button[data-track-src]');
    if (button) {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        loadTrack(index);
        play();
      });
    }
  });

  // Progress bar click
  const progressContainer = document.querySelector('.progress-bar');
  if (progressContainer) {
    progressContainer.addEventListener('click', (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      audio.currentTime = percent * audio.duration;
    });
  }

  // Audio events
  audio.addEventListener('timeupdate', updateProgressBar);
  audio.addEventListener('ended', () => {
    playBtn.classList.remove('is-playing');
  });

  // Load first track
  loadTrack(0);
}

/* ── Operación 14 Player ───────────────────────────────────── */
function initOp14Player() {
  if (!document.body.classList.contains('op14-page')) return;

  const audio = document.getElementById('player-audio');
  const playBtn = document.querySelector('.op14-play-btn');
  const trackItems = document.querySelectorAll('.op14-track');
  const progressBar = document.querySelector('.op14-progress-bar__filled');
  const progressContainer = document.querySelector('.op14-progress-bar');
  const currentTimeEl = document.querySelector('.op14-time-current');
  const durationEl = document.querySelector('.op14-time-duration');
  const playerTitle = document.querySelector('.op14-player-title');
  const playerArtist = document.querySelector('.op14-player-artist');
  const archiveArtist = document.body.dataset.musicArtist || 'De La Manga';
  const archiveTitle = document.body.dataset.musicTitle || 'Operación 14';

  if (!audio || !playBtn || !trackItems.length) {
    return;
  }

  let currentTrackIndex = 0;
  let isSeeking = false;
  let activeLoadId = 0;
  let activeObjectUrl = '';

  const formatTime = (seconds) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const updateProgressBar = () => {
    if (!isSeeking && progressBar && audio.duration && isFinite(audio.duration)) {
      const percentage = (audio.currentTime / audio.duration) * 100;
      progressBar.style.width = `${percentage}%`;
      if (currentTimeEl) currentTimeEl.textContent = formatTime(audio.currentTime);
    }
  };

  const updatePlayIcon = () => {
    const svg = playBtn.querySelector('svg:first-of-type');
    if (!svg) return;
    const newPath = audio.paused ? '<path d="M8 5v14l11-7z" fill="currentColor"/>' : '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" fill="currentColor"/>';
    svg.innerHTML = newPath;
  };

  const updateTrackIcons = () => {
    trackItems.forEach((item, i) => {
      const btn = item.querySelector('.op14-track__btn');
      if (!btn) return;
      const svg = btn.querySelector('svg');
      if (!svg) return;
      const isPlaying = i === currentTrackIndex && !audio.paused;
      const newPath = isPlaying ? '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" fill="currentColor"/>' : '<path d="M8 5v14l11-7z" fill="currentColor"/>';
      svg.innerHTML = newPath;
    });
  };

  const shouldLoadAsBlob = (src) => {
    if (!src || !/\.(wav|aif|aiff|flac)(\?.*)?$/i.test(src)) return false;
    try {
      return new URL(src, window.location.href).origin === window.location.origin;
    } catch (error) {
      return false;
    }
  };

  const resolvePlayableSource = async (src) => {
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = '';
    }

    if (!shouldLoadAsBlob(src)) return src;

    try {
      const response = await fetch(src);
      if (!response.ok) return src;
      const blob = await response.blob();
      activeObjectUrl = URL.createObjectURL(blob);
      return activeObjectUrl;
    } catch (error) {
      return src;
    }
  };

  const loadTrack = async (index) => {
    if (index < 0 || index >= trackItems.length) return;
    currentTrackIndex = index;
    const loadId = ++activeLoadId;
    
    const trackItem = trackItems[index];
    const button = trackItem.querySelector('[data-track-src]');
    if (!button) return;

    const src = button.dataset.trackSrc;
    const title = trackItem.querySelector('.op14-track__title')?.textContent || '...';
    const displayDuration = button.dataset.trackDuration || trackItem.dataset.trackDuration || trackItem.querySelector('.op14-track__time')?.textContent || '';

    playerTitle.textContent = title;
    playerArtist.textContent = archiveTitle || archiveArtist;
    durationEl.textContent = displayDuration || '0:00';
    if (currentTimeEl) currentTimeEl.textContent = '0:00';
    if (progressBar) progressBar.style.width = '0%';
    playBtn.classList.add('is-loading');

    trackItems.forEach((item, i) => {
      item.classList.toggle('is-playing', i === index);
    });

    const playableSrc = await resolvePlayableSource(src);
    if (loadId !== activeLoadId) return;
    audio.src = playableSrc;
    audio.load();
  };

  const play = async () => {
    if (!audio.src) {
      await loadTrack(0);
    }
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  };

  const pause = () => {
    audio.pause();
  };

  const togglePlay = () => {
    if (audio.paused) {
      play();
    } else {
      pause();
    }
  };

  // Play button click
  playBtn.addEventListener('click', () => {
    togglePlay();
  });

  // Track clicks
  trackItems.forEach((item, index) => {
    const button = item.querySelector('[data-track-src]');
    if (button) {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentTrackIndex === index && !audio.paused) {
          pause();
        } else {
          loadTrack(index).then(() => play());
        }
      });
    }
  });

  const seekToClientX = (clientX) => {
    if (!progressContainer || !audio.duration || !isFinite(audio.duration)) return;
    const rect = progressContainer.getBoundingClientRect();
    if (!rect.width) return;
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextTime = percent * audio.duration;
    audio.currentTime = nextTime;
    if (progressBar) progressBar.style.width = `${percent * 100}%`;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(nextTime);
  };

  if (progressContainer) {
    progressContainer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isSeeking = true;
      seekToClientX(e.clientX);
    });

    document.addEventListener('pointermove', (e) => {
      if (!isSeeking) return;
      e.preventDefault();
      seekToClientX(e.clientX);
    });

    document.addEventListener('pointerup', () => {
      isSeeking = false;
    });

    document.addEventListener('pointercancel', () => {
      isSeeking = false;
    });
  }

  // Audio events
  audio.addEventListener('loadstart', () => {
    playBtn.classList.add('is-loading');
  });

  audio.addEventListener('canplay', () => {
    playBtn.classList.remove('is-loading');
  });

  audio.addEventListener('loadedmetadata', updateProgressBar);

  audio.addEventListener('timeupdate', updateProgressBar);

  audio.addEventListener('play', () => {
    playBtn.classList.add('is-playing');
    updatePlayIcon();
    updateTrackIcons();
  });

  audio.addEventListener('pause', () => {
    playBtn.classList.remove('is-playing');
    updatePlayIcon();
    updateTrackIcons();
  });

  audio.addEventListener('ended', () => {
    playBtn.classList.remove('is-playing');
    updatePlayIcon();
  });

  audio.addEventListener('error', (event) => {
    playBtn.classList.remove('is-loading');
  });

  // Initialize with first track
  loadTrack(0);
}

function initDynamicBackButton() {
  const backBtn = document.querySelector('.op14-nav__back');
  if (!backBtn) return;

  const sections = document.querySelectorAll('.op14-section');
  if (sections.length === 0) return;

  const getLuminance = (color) => {
    const match = color.match(/\d+/g);
    if (!match || match.length < 3) return 0.5;
    const [r, g, b] = [parseInt(match[0]), parseInt(match[1]), parseInt(match[2])];
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };

  const observer = new IntersectionObserver(
    (entries) => {
      let mostVisibleSection = null;
      let maxRatio = 0;

      entries.forEach((entry) => {
        if (entry.intersectionRatio > maxRatio) {
          maxRatio = entry.intersectionRatio;
          mostVisibleSection = entry.target;
        }
      });

      if (!mostVisibleSection) return;

      const bgColor = window.getComputedStyle(mostVisibleSection).backgroundColor;
      const bgImage = window.getComputedStyle(mostVisibleSection).backgroundImage;

      const luminance = getLuminance(bgColor);
      const hasBgImage = bgImage && bgImage !== 'none';
      const isDarkBg = luminance < 0.5 || hasBgImage;

      backBtn.classList.remove('op14-nav__back--dark-bg', 'op14-nav__back--light-bg');
      backBtn.classList.add(
        isDarkBg ? 'op14-nav__back--dark-bg' : 'op14-nav__back--light-bg'
      );
    },
    { threshold: [0.1, 0.3, 0.5] }
  );

  sections.forEach((section) => observer.observe(section));
}
