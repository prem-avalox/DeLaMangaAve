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
  initSplits();
  wireImageInputs();
  wireVideoInputs();
  wireMeterVideos();
  audioControl = await wireAudio();
  initAudioMasterScroll(audioControl);
  autoPlayVideos();
  initReveal();
  initMeterAudioControl();
  initNavActiveState();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});

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

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.28 });

  elements.forEach(el => observer.observe(el));
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
