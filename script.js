function initSplits() {
  const splitContainers = document.querySelectorAll('[data-split-container]');
  splitContainers.forEach(container => {
    const parent = container.closest('.split') || container.parentElement;
    const range = parent ? parent.querySelector('[data-split-range]') : null;
    const labelBefore = container.querySelector('.split__label--before');
    const labelAfter = container.querySelector('.split__label--after');
    const hintPill = container.querySelector('.split__hint-pill');

    let animId = null;
    let isInteracting = false;

    const applySplit = (value) => {
      const v = Math.min(99, Math.max(1, Number(value)));
      container.style.setProperty('--split', `${v}%`);
      if (range) range.value = v;

      // Dynamic fade for ANTES and DESPUÉS based on revealed footage:
      // Left side [0..v%] shows DESPUÉS: disappears when v <= 8%, fully visible when v >= 24%
      if (labelAfter) {
        const afterRatio = Math.max(0, Math.min(1, (v - 8) / 16));
        labelAfter.style.opacity = afterRatio.toFixed(3);
        labelAfter.style.transform = `translateY(${(1 - afterRatio) * 6}px)`;
        labelAfter.style.pointerEvents = afterRatio > 0.1 ? 'auto' : 'none';
      }

      // Right side [v%..100%] shows ANTES: disappears when v >= 92%, fully visible when v <= 76%
      if (labelBefore) {
        const beforeRatio = Math.max(0, Math.min(1, (92 - v) / 16));
        labelBefore.style.opacity = beforeRatio.toFixed(3);
        labelBefore.style.transform = `translateY(${(1 - beforeRatio) * 6}px)`;
        labelBefore.style.pointerEvents = beforeRatio > 0.1 ? 'auto' : 'none';
      }
    };

    const updateFromPointer = (clientX) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width) return;
      const x = clientX - rect.left;
      const pct = (x / rect.width) * 100;
      applySplit(pct);
      if (hintPill && !hintPill.classList.contains('is-hidden')) {
        hintPill.classList.add('is-hidden');
      }
    };

    const returnToCenter = () => {
      if (isInteracting) return;
      cancelAnimationFrame(animId);
      const step = () => {
        if (isInteracting) return;
        const currentStr = container.style.getPropertyValue('--split') || '50%';
        let current = parseFloat(currentStr);
        if (isNaN(current)) current = 50;
        const diff = 50 - current;
        if (Math.abs(diff) < 0.25) {
          applySplit(50);
          return;
        }
        applySplit(current + diff * 0.12);
        animId = requestAnimationFrame(step);
      };
      animId = requestAnimationFrame(step);
    };

    // Desktop hover follow
    container.addEventListener('pointerenter', e => {
      if (e.pointerType === 'mouse') {
        cancelAnimationFrame(animId);
        isInteracting = true;
        updateFromPointer(e.clientX);
      }
    });

    container.addEventListener('pointermove', e => {
      if (isInteracting || e.pointerType === 'mouse') {
        cancelAnimationFrame(animId);
        updateFromPointer(e.clientX);
      }
    });

    container.addEventListener('pointerleave', e => {
      if (e.pointerType === 'mouse') {
        isInteracting = false;
        returnToCenter();
      }
    });

    // Touch & pointer interaction with pointer capture and scroll prevention
    container.addEventListener('pointerdown', e => {
      isInteracting = true;
      cancelAnimationFrame(animId);
      try {
        container.setPointerCapture(e.pointerId);
      } catch (_) {}
      updateFromPointer(e.clientX);
      e.preventDefault();
    }, { passive: false });

    const finishPointer = (e) => {
      if (!isInteracting) return;
      isInteracting = false;
      try {
        if (e && e.pointerId) container.releasePointerCapture(e.pointerId);
      } catch (_) {}
      returnToCenter();
    };

    container.addEventListener('pointerup', finishPointer);
    container.addEventListener('pointercancel', finishPointer);

    // Native touch handlers to strictly prevent mobile viewport panning/stutter
    container.addEventListener('touchstart', e => {
      isInteracting = true;
      cancelAnimationFrame(animId);
      if (e.touches && e.touches[0]) {
        updateFromPointer(e.touches[0].clientX);
      }
      e.preventDefault();
    }, { passive: false });

    container.addEventListener('touchmove', e => {
      if (e.touches && e.touches[0]) {
        updateFromPointer(e.touches[0].clientX);
      }
      e.preventDefault();
    }, { passive: false });

    container.addEventListener('touchend', () => {
      isInteracting = false;
      returnToCenter();
    });

    // Range slider fallback if present
    if (range) {
      range.addEventListener('input', e => {
        isInteracting = true;
        cancelAnimationFrame(animId);
        applySplit(e.target.value);
        if (hintPill) hintPill.classList.add('is-hidden');
      });
      range.addEventListener('change', () => {
        isInteracting = false;
      });
    }

    // Initialize at center
    applySplit(50);
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
  // Split comparator videos are controlled directly by syncVideoPair to ensure frame lock
  const meters = document.querySelectorAll('[data-meter-display]');
  meters.forEach(v => {
    v.muted = true; // start muted to satisfy autoplay; will unmute when volume rises
    v.play().catch(() => {});
  });
}

/**
 * Pairs two videos for frame-locked synchronised playback and endless looping.
 * Uses micro-drift playbackRate adjustments to eliminate seeking stutter,
 * synchronous zero-offset looping, and IntersectionObserver for performance.
 */
function syncVideoPair(primary, secondary) {
  if (!primary || !secondary) return;

  primary.muted = true;
  secondary.muted = true;
  primary.playsInline = true;
  secondary.playsInline = true;
  primary.autoplay = true;
  secondary.autoplay = true;

  const container = primary.closest('[data-split-container]') || primary.parentElement;

  let isSyncing = false;
  let rafId = null;

  const checkSync = () => {
    // Permanent play: continuously ensure both videos stay playing
    if (primary.paused) primary.play().catch(() => {});
    if (secondary.paused) secondary.play().catch(() => {});

    if (!primary.paused && !secondary.paused && !isSyncing) {
      const diff = primary.currentTime - secondary.currentTime;
      const absDiff = Math.abs(diff);

      if (absDiff > 0.25) {
        // Hard drift (e.g. background tab wake): seek directly
        secondary.currentTime = primary.currentTime;
        secondary.playbackRate = 1.0;
      } else if (absDiff > 0.02) {
        // Micro-drift: seamlessly adjust secondary playback rate to eliminate drift without stuttering
        secondary.playbackRate = diff > 0 ? 1.05 : 0.95;
      } else if (secondary.playbackRate !== 1.0) {
        secondary.playbackRate = 1.0;
      }
    }
    rafId = requestAnimationFrame(checkSync);
  };

  const restartTogether = () => {
    if (isSyncing) return;
    isSyncing = true;
    primary.currentTime = 0;
    secondary.currentTime = 0;
    secondary.playbackRate = 1.0;

    Promise.allSettled([primary.play(), secondary.play()]).finally(() => {
      isSyncing = false;
    });
  };

  primary.loop = false;
  secondary.loop = false;

  primary.addEventListener('ended', restartTogether);
  secondary.addEventListener('ended', restartTogether);

  // Seamless loop trigger just before stream terminates
  primary.addEventListener('timeupdate', () => {
    if (primary.duration && primary.currentTime >= primary.duration - 0.08) {
      restartTogether();
    }
  });

  // Mirror play states and immediately recover from any pause
  primary.addEventListener('play', () => {
    if (secondary.paused && !isSyncing) secondary.play().catch(() => {});
  });
  primary.addEventListener('pause', () => {
    if (!isSyncing) primary.play().catch(() => {});
  });
  secondary.addEventListener('pause', () => {
    if (!isSyncing) secondary.play().catch(() => {});
  });

  // Buffer check to ensure simultaneous start from frame 0
  const waitReady = (vid) => new Promise(resolve => {
    if (vid.readyState >= 2) {
      resolve();
    } else {
      const onReady = () => {
        vid.removeEventListener('loadeddata', onReady);
        vid.removeEventListener('canplay', onReady);
        resolve();
      };
      vid.addEventListener('loadeddata', onReady);
      vid.addEventListener('canplay', onReady);
    }
  });

  const startTogether = async () => {
    isSyncing = true;
    primary.currentTime = 0;
    secondary.currentTime = 0;
    secondary.playbackRate = 1.0;

    try {
      await Promise.all([primary.play(), secondary.play()]);
    } catch (_) {
      // If browser autoplay policy requires user gesture
      const unlock = () => {
        primary.play().catch(() => {});
        secondary.play().catch(() => {});
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('scroll', unlock);
        window.removeEventListener('touchstart', unlock);
      };
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('scroll', unlock, { once: true, passive: true });
      window.addEventListener('touchstart', unlock, { once: true, passive: true });
    } finally {
      isSyncing = false;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(checkSync);
    }
  };

  // Permanent play: resume immediately on tab focus or visibility return
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      primary.play().catch(() => {});
      secondary.play().catch(() => {});
    }
  });
  window.addEventListener('focus', () => {
    primary.play().catch(() => {});
    secondary.play().catch(() => {});
  });

  // Keep playing permanently - never pause when offscreen
  if ('IntersectionObserver' in window && container) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (primary.paused) primary.play().catch(() => {});
          if (secondary.paused) secondary.play().catch(() => {});
        }
      });
    }, { threshold: 0.1 });
    observer.observe(container);
  }

  Promise.all([waitReady(primary), waitReady(secondary)]).then(startTogether);
}

function initMediaProtection() {
  const isProtectedElement = (target) => {
    if (!target) return false;
    return !!target.closest(
      'img, video, audio, picture, figure, ' +
      '.image-viewer, .glass-card, .op14-track, .op14-player, .op14-section, ' +
      '.album-card, .track-item, .split, .layer, .gallery-item, [data-protected]'
    );
  };

  // Block right-click context menu on images, videos, audio, and archive assets
  document.addEventListener('contextmenu', (e) => {
    if (isProtectedElement(e.target) || e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO') {
      e.preventDefault();
      return false;
    }
  }, { capture: true });

  // Block dragging of images, videos, audio elements
  document.addEventListener('dragstart', (e) => {
    if (isProtectedElement(e.target) || e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO') {
      e.preventDefault();
      return false;
    }
  }, { capture: true });

  const protectAllMedia = () => {
    document.querySelectorAll('video').forEach(vid => {
      vid.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback');
      vid.setAttribute('disablePictureInPicture', 'true');
      vid.setAttribute('draggable', 'false');
      vid.setAttribute('oncontextmenu', 'return false;');
    });
    document.querySelectorAll('audio').forEach(aud => {
      aud.setAttribute('controlsList', 'nodownload');
      aud.setAttribute('oncontextmenu', 'return false;');
    });
    document.querySelectorAll('img').forEach(img => {
      img.setAttribute('draggable', 'false');
      img.setAttribute('oncontextmenu', 'return false;');
    });
  };

  protectAllMedia();

  if ('MutationObserver' in window) {
    const observer = new MutationObserver(() => protectAllMedia());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
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

function initMobileMenu() {
  const toggle = document.querySelector('.menu-toggle');
  const overlay = document.getElementById('mobile-menu');
  if (!toggle || !overlay) return;

  const closeBtn = overlay.querySelector('.mobile-overlay__close');
  const navLinks = overlay.querySelectorAll('.mobile-nav-link');
  const backdrop = overlay.querySelector('.mobile-overlay__backdrop');

  const openMenu = () => {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    closeBtn?.focus();
  };

  const closeMenu = () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    toggle.focus();
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = overlay.classList.contains('is-open');
    if (isOpen) closeMenu();
    else openMenu();
  });

  closeBtn?.addEventListener('click', closeMenu);
  backdrop?.addEventListener('click', closeMenu);

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      closeMenu();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
      closeMenu();
    }
  });
}

let audioControl;

function init() {
  initMediaProtection();
  initMobileMenu();
  initAdminCreateLink();
  initSplits();
  wireImageInputs();
  wireVideoInputs();
  wireMeterVideos();
  if (document.querySelector('[data-audio-display="before"]')) {
    wireAudio().then(ctrl => {
      audioControl = ctrl;
      initAudioMasterScroll(audioControl);
    }).catch(() => {});
  }
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
  const navLists = document.querySelectorAll('.nav__links, .topbar-nav');
  if (!navLists.length) return;

  // Only check session when running locally on localhost/127.0.0.1
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isLocal) return;

  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.authenticated) return;

    navLists.forEach(list => {
      if (list.querySelector('[data-admin-create-link]')) return;
      const link = document.createElement('a');
      link.href = 'admin.html';
      link.className = list.classList.contains('topbar-nav') ? 'topbar-link' : 'nav__link nav__link--create';
      link.dataset.adminCreateLink = '';
      link.textContent = 'CMS';
      list.append(link);
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

  const metadataBySrc = window.DE_LA_MANGA_IMAGE_METADATA || {};
  const filtersEl = app.querySelector('[data-collection-filters]');
  const gridEl = app.querySelector('[data-collection-grid]');
  const detailsEl = app.querySelector('[data-collection-details]');
  const types = ['Todas', ...new Set(collections.map(collection => collection.type))];
  let activeType = 'Todas';
  let hasRendered = false;
  let imageViewerItems = [];
  let imageViewerIndex = 0;
  let imageViewer = null;
  let imageViewerTransitionId = 0;
  let imageViewerLoadingTimer = null;

  const isVideo = src => /\.(mp4|mov|webm)$/i.test(src || '');
  const lazyMediaObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        loadLazyMedia(entry.target);
        lazyMediaObserver.unobserve(entry.target);
      });
    }, { rootMargin: '420px 0px' })
    : null;

  const loadLazyMedia = media => {
    const src = media.dataset.src;
    if (!src) return;

    if (media.tagName === 'IMG' && media.dataset.alt) {
      media.alt = media.dataset.alt;
    }

    media.src = src;
    media.removeAttribute('data-src');

    if (media.tagName === 'VIDEO') {
      media.play?.().catch(() => {});
    }
  };

  const observeLazyMedia = media => {
    if (!media?.dataset?.src) return;

    if (lazyMediaObserver) {
      lazyMediaObserver.observe(media);
    } else {
      loadLazyMedia(media);
    }
  };

  const createMedia = item => {
    if (!item?.src) {
      return createCollectionFallback(item?.alt || item?.caption || '');
    }

    const media = isVideo(item.src) ? document.createElement('video') : document.createElement('img');
    media.className = 'collection-media__asset';
    media.dataset.src = item.src;

    if (isVideo(item.src)) {
      media.muted = true;
      media.loop = true;
      media.playsInline = true;
      media.autoplay = true;
      media.setAttribute('aria-label', item.alt || item.caption || '');
    } else {
      media.alt = '';
      media.dataset.alt = item.alt || item.caption || '';
      media.loading = 'lazy';
      media.decoding = 'async';
      media.draggable = false;
      media.addEventListener('contextmenu', event => event.preventDefault());
    }

    observeLazyMedia(media);
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

  const viewerIcons = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></svg>',
    exitFullscreen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v6H3M15 3v6h6M21 15h-6v6M3 15h6v6"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><path d="M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.1 5.4A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-3.1 4.1M6.6 6.6C3.6 8.6 2 12 2 12s3.5 7 10 7c1.2 0 2.3-.2 3.3-.6"/></svg>'
  };

  const createViewerButton = (className, label, content = label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    button.innerHTML = content;
    return button;
  };

  const createImageViewer = () => {
    if (imageViewer) return imageViewer;

    const overlay = document.createElement('div');
    overlay.className = 'image-viewer';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Visor de imagen');

    const backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'image-viewer__backdrop';
    backdrop.setAttribute('aria-label', 'Cerrar visor');

    const closeBtn = createViewerButton('image-viewer__close image-viewer__glass', 'Cerrar visor', viewerIcons.close);
    const prevBtn = createViewerButton('image-viewer__nav image-viewer__nav--prev', 'Imagen anterior', '<span aria-hidden="true">‹</span>');
    const nextBtn = createViewerButton('image-viewer__nav image-viewer__nav--next', 'Imagen siguiente', '<span aria-hidden="true">›</span>');
    const fullscreenBtn = createViewerButton('image-viewer__tool image-viewer__glass', 'Ver en pantalla completa', viewerIcons.fullscreen);
    const metadataBtn = createViewerButton('image-viewer__tool image-viewer__glass', 'Ocultar metadatos', viewerIcons.eyeOff);

    const stage = document.createElement('div');
    stage.className = 'image-viewer__stage';

    const category = document.createElement('div');
    category.className = 'image-viewer__category';

    const shell = document.createElement('div');
    shell.className = 'image-viewer__shell';

    const imagePanel = document.createElement('figure');
    imagePanel.className = 'image-viewer__image-panel';

    const imageWrap = document.createElement('div');
    imageWrap.className = 'image-viewer__image-wrap';

    const image = document.createElement('img');
    image.className = 'image-viewer__image';
    image.alt = '';
    image.decoding = 'async';
    image.draggable = false;
    image.addEventListener('contextmenu', event => event.preventDefault());

    const nextImage = document.createElement('img');
    nextImage.className = 'image-viewer__image image-viewer__image--next';
    nextImage.alt = '';
    nextImage.decoding = 'async';
    nextImage.draggable = false;
    nextImage.setAttribute('aria-hidden', 'true');
    nextImage.addEventListener('contextmenu', event => event.preventDefault());

    const loader = document.createElement('div');
    loader.className = 'image-viewer__loader';
    loader.setAttribute('aria-hidden', 'true');

    const tools = document.createElement('div');
    tools.className = 'image-viewer__tools';
    tools.append(fullscreenBtn, metadataBtn);

    const watermark = document.createElement('div');
    watermark.className = 'image-viewer__watermark';
    watermark.setAttribute('aria-hidden', 'true');

    imageWrap.append(image, nextImage, watermark, loader);
    imagePanel.append(imageWrap, tools);

    const metaPanel = document.createElement('aside');
    metaPanel.className = 'image-viewer__meta';

    const metaRows = document.createElement('dl');
    metaRows.className = 'image-viewer__meta-list';

    metaPanel.append(metaRows);
    shell.append(imagePanel, metaPanel);
    stage.append(category, shell);
    overlay.append(backdrop, closeBtn, prevBtn, nextBtn, stage);
    document.body.append(overlay);

    const viewer = {
      overlay,
      stage,
      shell,
      image,
      nextImage,
      loader,
      category,
      metaPanel,
      metaRows,
      closeBtn,
      prevBtn,
      nextBtn,
      fullscreenBtn,
      metadataBtn
    };

    backdrop.addEventListener('click', closeImageViewer);
    closeBtn.addEventListener('click', closeImageViewer);
    prevBtn.addEventListener('click', () => showImageViewerItem(imageViewerIndex - 1));
    nextBtn.addEventListener('click', () => showImageViewerItem(imageViewerIndex + 1));
    metadataBtn.addEventListener('click', () => toggleViewerMetadata());
    fullscreenBtn.addEventListener('click', () => toggleImageViewerFullscreen());
    imageWrap.addEventListener('dblclick', event => toggleViewerImageZoom(event));

    imageViewer = viewer;
    return viewer;
  };

  const setImageViewerFullscreenState = isFullscreen => {
    if (!imageViewer) return;

    imageViewer.overlay.classList.toggle('is-viewer-fullscreen', isFullscreen);
    imageViewer.fullscreenBtn.innerHTML = isFullscreen ? viewerIcons.exitFullscreen : viewerIcons.fullscreen;
    imageViewer.fullscreenBtn.setAttribute('aria-label', isFullscreen ? 'Salir de pantalla completa' : 'Ver en pantalla completa');
    imageViewer.fullscreenBtn.setAttribute('aria-pressed', String(isFullscreen));

    if (!isFullscreen) {
      imageViewer.overlay.classList.remove('is-image-zoomed');
      imageViewer.image.style.removeProperty('--zoom-origin-x');
      imageViewer.image.style.removeProperty('--zoom-origin-y');
    }
  };

  const toggleViewerImageZoom = event => {
    const viewer = createImageViewer();
    const rect = viewer.image.getBoundingClientRect();
    const originX = rect.width ? ((event.clientX - rect.left) / rect.width) * 100 : 50;
    const originY = rect.height ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
    const zoomed = !viewer.overlay.classList.contains('is-image-zoomed');

    viewer.image.style.setProperty('--zoom-origin-x', `${Math.min(100, Math.max(0, originX))}%`);
    viewer.image.style.setProperty('--zoom-origin-y', `${Math.min(100, Math.max(0, originY))}%`);
    viewer.overlay.classList.toggle('is-image-zoomed', zoomed);
  };

  const formatViewerMetadataRows = metadata => {
    const rows = [
      ['Cámara', metadata.camera],
      ['Resolución', metadata.dimensions],
      ['Fecha', metadata.date],
      ['Proceso', metadata.software],
      ['Crédito', metadata.copyright]
    ].filter(([, value]) => value);

    if (!rows.length) {
      return [['Metadata', 'No disponible']];
    }

    return rows;
  };

  const renderViewerMetadata = item => {
    const viewer = createImageViewer();
    const metadata = metadataBySrc[item.originalSrc] || metadataBySrc[item.src] || {};
    const rows = formatViewerMetadataRows(metadata);

    viewer.metaRows.replaceChildren();
    rows.forEach(([label, value]) => {
      const term = document.createElement('dt');
      term.textContent = label;
      const definition = document.createElement('dd');
      definition.textContent = value;
      viewer.metaRows.append(term, definition);
    });
  };

  const preloadViewerImage = src => new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('Missing image source'));
      return;
    }

    const preload = new Image();
    preload.decoding = 'async';

    const resolveWhenDecoded = () => {
      if (!preload.naturalWidth) {
        reject(new Error(`Image failed to load: ${src}`));
        return;
      }

      if (preload.decode) {
        preload.decode().catch(() => {}).finally(() => resolve(preload));
      } else {
        resolve(preload);
      }
    };

    preload.onload = resolveWhenDecoded;
    preload.onerror = () => reject(new Error(`Image failed to load: ${src}`));
    preload.src = src;

    if (preload.complete) resolveWhenDecoded();
  });

  const scheduleViewerLoading = (viewer, transitionId) => {
    window.clearTimeout(imageViewerLoadingTimer);
    viewer.overlay.classList.remove('is-loading');
    imageViewerLoadingTimer = window.setTimeout(() => {
      if (transitionId === imageViewerTransitionId) {
        viewer.overlay.classList.add('is-loading');
      }
    }, 160);
  };

  const clearViewerLoading = viewer => {
    window.clearTimeout(imageViewerLoadingTimer);
    imageViewerLoadingTimer = null;
    viewer.overlay.classList.remove('is-loading');
  };

  const decodeViewerImage = image => {
    if (image.decode) {
      return image.decode().catch(() => {});
    }

    if (image.complete) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', reject, { once: true });
    });
  };

  const prepareViewerImage = async (image, item, imageAlt, transitionId) => {
    image.classList.add('image-viewer__image--next');
    image.classList.remove('is-entering', 'is-leaving');
    image.setAttribute('aria-hidden', 'true');
    image.alt = '';
    image.removeAttribute('data-src');

    if (image.getAttribute('src') !== item.src) {
      image.src = item.src;
    }

    await decodeViewerImage(image);
    if (transitionId !== imageViewerTransitionId) return false;

    image.alt = imageAlt;
    image.dataset.src = item.src;
    image.removeAttribute('aria-hidden');
    return true;
  };

  const warmNearbyViewerImages = () => {
    if (imageViewerItems.length < 2) return;

    [imageViewerIndex - 1, imageViewerIndex + 1].forEach(index => {
      const item = imageViewerItems[(index + imageViewerItems.length) % imageViewerItems.length];
      if (item?.src) preloadViewerImage(item.src).catch(() => {});
    });
  };

  const showImageViewerItem = async index => {
    if (!imageViewerItems.length) return;

    const viewer = createImageViewer();
    const transitionId = imageViewerTransitionId + 1;
    imageViewerTransitionId = transitionId;
    imageViewerIndex = (index + imageViewerItems.length) % imageViewerItems.length;
    const item = imageViewerItems[imageViewerIndex];
    const imageAlt = item.alt || `${item.collectionTitle} - imagen del archivo`;
    const viewerIsOpen = viewer.overlay.classList.contains('is-open') && viewer.image.dataset.src;

    viewer.overlay.classList.remove('is-image-zoomed');
    scheduleViewerLoading(viewer, transitionId);
    viewer.image.style.removeProperty('--zoom-origin-x');
    viewer.image.style.removeProperty('--zoom-origin-y');

    viewer.category.textContent = item.collectionTitle;
    viewer.category.dataset.counter = `${imageViewerIndex + 1} / ${imageViewerItems.length}`;
    viewer.prevBtn.disabled = imageViewerItems.length < 2;
    viewer.nextBtn.disabled = imageViewerItems.length < 2;
    renderViewerMetadata(item);

    try {
      await preloadViewerImage(item.src);
      if (transitionId !== imageViewerTransitionId) return;

      if (!viewerIsOpen) {
        const ready = await prepareViewerImage(viewer.image, item, imageAlt, transitionId);
        if (!ready) return;
        clearViewerLoading(viewer);
        viewer.image.classList.remove('image-viewer__image--next', 'is-entering', 'is-leaving');
        viewer.nextImage.classList.remove('is-entering', 'is-leaving');
        viewer.nextImage.classList.add('image-viewer__image--next');
        viewer.nextImage.setAttribute('aria-hidden', 'true');
        viewer.nextImage.alt = '';
        viewer.nextImage.removeAttribute('src');
        viewer.nextImage.removeAttribute('data-src');
        warmNearbyViewerImages();
        return;
      }

      const leavingImage = viewer.image;
      const enteringImage = viewer.nextImage;
      const ready = await prepareViewerImage(enteringImage, item, imageAlt, transitionId);
      if (!ready) return;
      clearViewerLoading(viewer);

      requestAnimationFrame(() => {
        if (transitionId !== imageViewerTransitionId) return;

        enteringImage.classList.add('is-entering');
        leavingImage.classList.add('is-leaving');

        window.setTimeout(() => {
          if (transitionId !== imageViewerTransitionId) return;

          enteringImage.classList.remove('image-viewer__image--next', 'is-entering', 'is-leaving');
          leavingImage.classList.remove('is-leaving', 'is-entering');
          leavingImage.classList.add('image-viewer__image--next');
          leavingImage.setAttribute('aria-hidden', 'true');
          leavingImage.alt = '';
          leavingImage.removeAttribute('src');
          leavingImage.removeAttribute('data-src');

          viewer.image = enteringImage;
          viewer.nextImage = leavingImage;
          clearViewerLoading(viewer);
          warmNearbyViewerImages();
        }, 360);
      });
    } catch (error) {
      if (transitionId !== imageViewerTransitionId) return;
      clearViewerLoading(viewer);
    }
  };

  const openImageViewer = index => {
    const viewer = createImageViewer();
    showImageViewerItem(index);
    viewer.overlay.hidden = false;
    document.body.classList.add('image-viewer-open');
    requestAnimationFrame(() => {
      viewer.overlay.classList.add('is-open');
      viewer.closeBtn.focus({ preventScroll: true });
    });
  };

  const closeImageViewer = () => {
    if (!imageViewer || imageViewer.overlay.hidden) return;

    imageViewer.overlay.classList.remove('is-open');
    setImageViewerFullscreenState(false);
    document.body.classList.remove('image-viewer-open');
    if (document.fullscreenElement === imageViewer.overlay) {
      document.exitFullscreen?.().catch(() => {});
    }
    window.setTimeout(() => {
      if (imageViewer) imageViewer.overlay.hidden = true;
    }, 180);
  };

  const toggleViewerMetadata = () => {
    const viewer = createImageViewer();
    const hidden = viewer.overlay.classList.toggle('is-metadata-hidden');
    viewer.metadataBtn.innerHTML = hidden ? viewerIcons.eye : viewerIcons.eyeOff;
    viewer.metadataBtn.setAttribute('aria-label', hidden ? 'Mostrar metadatos' : 'Ocultar metadatos');
    viewer.metadataBtn.setAttribute('aria-pressed', String(hidden));
  };

  const toggleImageViewerFullscreen = () => {
    const viewer = createImageViewer();
    const isFullscreen = document.fullscreenElement === viewer.overlay || viewer.overlay.classList.contains('is-viewer-fullscreen');

    if (isFullscreen) {
      setImageViewerFullscreenState(false);
      if (document.fullscreenElement === viewer.overlay) {
        document.exitFullscreen?.().catch(() => {});
      }
      return;
    }

    setImageViewerFullscreenState(true);
    if (viewer.overlay.requestFullscreen) {
      viewer.overlay.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        setImageViewerFullscreenState(true);
      });
    }
  };

  const handleViewerKeyboard = event => {
    if (!imageViewer || imageViewer.overlay.hidden) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      if (document.fullscreenElement === imageViewer.overlay) {
        document.exitFullscreen?.().catch(() => {});
        return;
      }
      closeImageViewer();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showImageViewerItem(imageViewerIndex - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      showImageViewerItem(imageViewerIndex + 1);
    }
  };

  document.addEventListener('keydown', handleViewerKeyboard);
  document.addEventListener('fullscreenchange', () => {
    if (!imageViewer) return;
    setImageViewerFullscreenState(document.fullscreenElement === imageViewer.overlay);
  });

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
    imageViewerItems = [];

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
        const viewerIndex = imageViewerItems.length;
        if (!isVideo(item.src)) {
          imageViewerItems.push({
            ...item,
            collectionId: collection.id,
            collectionTitle: collection.title,
            collectionType: collection.type
          });
          figure.tabIndex = 0;
          figure.setAttribute('role', 'button');
          figure.setAttribute('aria-label', `Abrir ${collection.title} en visor`);
          figure.addEventListener('click', () => openImageViewer(viewerIndex));
          figure.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openImageViewer(viewerIndex);
            }
          });
        }
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
  card.href = archive.href || (archive.id === 'operacion-14' ? 'operacion14.html' : `music-archive.html?id=${encodeURIComponent(archive.id)}`);
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
  let trackItems = document.querySelectorAll('.track-item');
  if (trackItems.length === 0) {
    trackItems = document.querySelectorAll('.track-card');
  }

  const progressBar = document.querySelector('.progress-bar__filled');
  const currentTimeEl = document.querySelector('.time-current');
  const durationEl = document.querySelector('.time-duration');
  const container = document.querySelector('[data-player]');
  
  // Track name elements (handle both layouts)
  let playerTrackNameEl = document.querySelector('.player-track-name') ||
                          document.querySelector('.player-track-title');

  if (!audio || !playBtn || !trackItems.length || !container) return;

  let currentTrackIndex = 0;

  const formatTime = (seconds) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const updatePlayIcon = () => {
    const svg = playBtn.querySelector('svg');
    if (!svg) return;
    if (audio.paused) {
      svg.innerHTML = '<polygon points="6 3 20 12 6 21 6 3"/>';
    } else {
      svg.innerHTML = '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>';
    }
  };

  const updateTrackIcons = () => {
    trackItems.forEach((item, i) => {
      const btn = item.querySelector('.track-item__play') || item.querySelector('.track-card__button');
      if (!btn) return;
      const svg = btn.querySelector('svg');
      if (!svg) return;
      const isPlaying = i === currentTrackIndex && !audio.paused;
      if (isPlaying) {
        svg.innerHTML = '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>';
      } else {
        svg.innerHTML = '<polygon points="6 3 20 12 6 21 6 3"/>';
      }
    });
  };

  const updateProgressBar = () => {
    if (audio.duration && isFinite(audio.duration)) {
      const percentage = (audio.currentTime / audio.duration) * 100;
      if (progressBar) progressBar.style.width = `${percentage}%`;
      if (currentTimeEl) currentTimeEl.textContent = formatTime(audio.currentTime);
      if (durationEl) durationEl.textContent = formatTime(audio.duration);
    }
  };

  const loadTrack = (index) => {
    if (index < 0 || index >= trackItems.length) return;
    currentTrackIndex = index;
    
    const trackItem = trackItems[index];
    const button = trackItem.querySelector('button[data-track-src]');
    if (!button) return;
    
    const src = button.dataset.trackSrc;
    const title = trackItem.querySelector('h3')?.textContent || 
                  trackItem.querySelector('.track-card__title')?.textContent ||
                  trackItem.querySelector('.track-item__title')?.textContent;

    audio.src = src;
    if (playerTrackNameEl) {
      playerTrackNameEl.textContent = title;
    }

    trackItems.forEach((item, i) => {
      item.classList.toggle('is-playing', i === index);
    });
  };

  const play = () => {
    if (!audio.src) loadTrack(0);
    const p = audio.play();
    if (p !== undefined) {
      p.catch(() => {});
    }
    playBtn.classList.add('is-playing');
    updatePlayIcon();
    updateTrackIcons();
  };

  const pause = () => {
    audio.pause();
    playBtn.classList.remove('is-playing');
    updatePlayIcon();
    updateTrackIcons();
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
        if (currentTrackIndex === index && !audio.paused) {
          pause();
        } else {
          loadTrack(index);
          play();
        }
      });
    }
  });

  // Progress bar click
  const progressContainer = document.querySelector('.progress-bar');
  if (progressContainer) {
    progressContainer.addEventListener('click', (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      if (audio.duration && isFinite(audio.duration)) {
        audio.currentTime = percent * audio.duration;
      }
    });
  }

  // Audio events
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
    if (currentTrackIndex + 1 < trackItems.length) {
      loadTrack(currentTrackIndex + 1);
      play();
    } else {
      playBtn.classList.remove('is-playing');
      updatePlayIcon();
      updateTrackIcons();
    }
  });

  // Initialize first track
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
