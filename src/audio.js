import { STORAGE_KEYS } from "./core/config.js";

function clampLevel(level) {
  return Math.max(0, Math.min(3, Number(level) || 0));
}

function clampVariant(variant) {
  return Math.max(0, Math.min(4, Number(variant) || 0));
}

function normalizeBgmVariantSetting(value) {
  const n = Number(value);
  if (n === -1) return -1;
  return clampVariant(n);
}

function clampLifeTier(life) {
  return Math.max(1, Math.min(3, life | 0));
}

function getVolumeScalar(level) {
  const table = [0, 0.45, 0.8, 1.25];
  return table[clampLevel(level)];
}

function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function parseStoredVolumeLevel(storage, key, defaultValue, legacyKey) {
  const stored = storage.getItem(key);
  if (stored !== null) return clampLevel(stored);

  const legacy = storage.getItem(legacyKey);
  if (legacy === "off") return 0;
  if (legacy === "on") return 2;
  return defaultValue;
}

function parseStoredVariant(storage, key, defaultValue) {
  const stored = storage.getItem(key);
  if (stored === null) return defaultValue;
  return normalizeBgmVariantSetting(stored);
}

export function createAudioEngine({ storage, getMode }) {
  const audioState = {
    initialized: false,
    bgmVolumeLevel: parseStoredVolumeLevel(storage, STORAGE_KEYS.bgmVolumeLevel, 2, STORAGE_KEYS.legacyBgmEnabled),
    sfxVolumeLevel: parseStoredVolumeLevel(storage, STORAGE_KEYS.sfxVolumeLevel, 2, STORAGE_KEYS.legacySfxEnabled),
    bgmVariant: parseStoredVariant(storage, STORAGE_KEYS.bgmVariant, 0),
    bgmActiveVariant: 0,
    lifeTier: 3,
  };

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const lifeProfiles = {
    3: { stepSeconds: 0.28, semitoneShift: 0 },
    2: { stepSeconds: 0.245, semitoneShift: 2 },
    1: { stepSeconds: 0.21, semitoneShift: 4 },
  };
  const bgmVariants = [
    {
      label: "TYPE 1",
      sequence: [0, 2, 4, 5, 7, 5, 4, 2, 0, 2, 4, 7, 9, 7, 5, 2],
      leadWave: "square",
      bassWave: "triangle",
    },
    {
      label: "TYPE 2",
      sequence: [0, 3, 5, 7, 5, 3, 2, 0, -2, 0, 2, 3, 5, 3, 2, 0],
      leadWave: "triangle",
      bassWave: "square",
    },
    {
      label: "TYPE 3",
      sequence: [0, -2, 1, 3, 5, 3, 1, 0, 3, 5, 7, 8, 7, 5, 3, 1],
      leadWave: "sawtooth",
      bassWave: "triangle",
    },
    {
      label: "TYPE 4",
      sequence: [0, 4, 7, 11, 7, 4, 2, 0, 2, 4, 5, 7, 9, 7, 5, 4],
      leadWave: "square",
      bassWave: "square",
    },
    {
      label: "TYPE 5",
      sequence: [0, 1, 3, 6, 8, 6, 3, 1, 0, -2, 1, 3, 5, 3, 1, 0],
      leadWave: "triangle",
      bassWave: "triangle",
    },
  ];

  let audioCtx = null;
  let masterGain = null;
  let bgmGain = null;
  let sfxGain = null;
  let bgmTimer = null;
  let nextStepTime = 0;
  let stepIndex = 0;

  function persistAudioSettings() {
    storage.setItem(STORAGE_KEYS.bgmVolumeLevel, String(audioState.bgmVolumeLevel));
    storage.setItem(STORAGE_KEYS.sfxVolumeLevel, String(audioState.sfxVolumeLevel));
    storage.setItem(STORAGE_KEYS.bgmVariant, String(audioState.bgmVariant));
  }

  function updateBgmGain() {
    if (!bgmGain || !audioCtx) return;
    const scalar = getVolumeScalar(audioState.bgmVolumeLevel);
    const target = scalar <= 0 ? 0.0001 : 0.58 * scalar;
    bgmGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.02);
  }

  function updateSfxGain() {
    if (!sfxGain || !audioCtx) return;
    const scalar = getVolumeScalar(audioState.sfxVolumeLevel);
    const target = scalar <= 0 ? 0.0001 : 0.62 * scalar;
    sfxGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.01);
  }

  function ensureContext() {
    if (!AudioCtx) return null;

    if (!audioCtx) {
      audioCtx = new AudioCtx();
      masterGain = audioCtx.createGain();
      bgmGain = audioCtx.createGain();
      sfxGain = audioCtx.createGain();

      masterGain.gain.value = 0.9;
      bgmGain.gain.value = 0.0001;
      sfxGain.gain.value = 0.0001;

      bgmGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(audioCtx.destination);
      audioState.initialized = true;
      updateBgmGain();
      updateSfxGain();
    }

    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }

    return audioCtx;
  }

  function playTone(opts) {
    const ctxLocal = ensureContext();
    if (!ctxLocal || !sfxGain) return;
    const scalar = getVolumeScalar(audioState.sfxVolumeLevel);
    if (scalar <= 0) return;

    const now = ctxLocal.currentTime;
    const start = now + (opts.delay || 0);
    const attack = opts.attack || 0.002;
    const release = opts.release || 0.11;
    const peak = opts.volume || 0.18;

    const osc = ctxLocal.createOscillator();
    const gain = ctxLocal.createGain();
    osc.type = opts.type || "square";
    osc.frequency.setValueAtTime(opts.freq, start);
    if (opts.slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(opts.slideToFreq, start + release);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + release);

    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(start);
    osc.stop(start + release + 0.02);
  }

  function scheduleBgmStep(time, idx) {
    const ctxLocal = ensureContext();
    if (!ctxLocal || !bgmGain) return;

    const profile = lifeProfiles[audioState.lifeTier] || lifeProfiles[3];
    const variant = bgmVariants[audioState.bgmActiveVariant] || bgmVariants[0];
    const seq = variant.sequence;
    const baseMidi = 57 + profile.semitoneShift;
    const leadMidi = baseMidi + seq[idx % seq.length];
    const bassMidi = baseMidi - 12 + (idx % 4 === 3 ? 2 : 0);

    const leadOsc = ctxLocal.createOscillator();
    const leadGain = ctxLocal.createGain();
    leadOsc.type = variant.leadWave;
    leadOsc.frequency.setValueAtTime(midiToHz(leadMidi), time);
    leadGain.gain.setValueAtTime(0.0001, time);
    leadGain.gain.linearRampToValueAtTime(0.07, time + 0.008);
    leadGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.17);
    leadOsc.connect(leadGain);
    leadGain.connect(bgmGain);
    leadOsc.start(time);
    leadOsc.stop(time + 0.2);

    if (idx % 2 === 0) {
      const bassOsc = ctxLocal.createOscillator();
      const bassGainNode = ctxLocal.createGain();
      bassOsc.type = variant.bassWave;
      bassOsc.frequency.setValueAtTime(midiToHz(bassMidi), time);
      bassGainNode.gain.setValueAtTime(0.0001, time);
      bassGainNode.gain.linearRampToValueAtTime(0.05, time + 0.012);
      bassGainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
      bassOsc.connect(bassGainNode);
      bassGainNode.connect(bgmGain);
      bassOsc.start(time);
      bassOsc.stop(time + 0.23);
    }
  }

  function pickBgmVariantForRun() {
    if (audioState.bgmVariant === -1) {
      audioState.bgmActiveVariant = Math.floor(Math.random() * bgmVariants.length);
    } else {
      audioState.bgmActiveVariant = clampVariant(audioState.bgmVariant);
    }
  }

  function tickBgm() {
    if (!audioCtx || audioState.bgmVolumeLevel === 0) return;
    const profile = lifeProfiles[audioState.lifeTier] || lifeProfiles[3];
    const variant = bgmVariants[audioState.bgmActiveVariant] || bgmVariants[0];

    while (nextStepTime < audioCtx.currentTime + 0.16) {
      scheduleBgmStep(nextStepTime, stepIndex);
      stepIndex = (stepIndex + 1) % variant.sequence.length;
      nextStepTime += profile.stepSeconds;
    }
  }

  return {
    clampLevel,
    normalizeBgmVariantSetting,
    getSettings() {
      return {
        bgmVolumeLevel: audioState.bgmVolumeLevel,
        sfxVolumeLevel: audioState.sfxVolumeLevel,
        bgmVariant: audioState.bgmVariant,
      };
    },
    ensureReady() {
      ensureContext();
    },
    setBgmVolumeLevel(level) {
      audioState.bgmVolumeLevel = clampLevel(level);
      persistAudioSettings();
      ensureContext();
      updateBgmGain();
      if (audioState.bgmVolumeLevel === 0) {
        this.stopBgm();
      } else if (getMode() === "running") {
        this.startBgm();
      }
    },
    setSfxVolumeLevel(level) {
      audioState.sfxVolumeLevel = clampLevel(level);
      persistAudioSettings();
      ensureContext();
      updateSfxGain();
    },
    setBgmVariant(variant) {
      audioState.bgmVariant = normalizeBgmVariantSetting(variant);
      persistAudioSettings();
      this.refreshBgmVariantForRun();
      if (bgmTimer && audioCtx) {
        nextStepTime = audioCtx.currentTime + 0.02;
        stepIndex = 0;
      }
    },
    refreshBgmVariantForRun() {
      pickBgmVariantForRun();
    },
    setBgmLifeTier(life) {
      audioState.lifeTier = clampLifeTier(life);
    },
    startBgm() {
      if (audioState.bgmVolumeLevel === 0) return;
      if (audioState.bgmActiveVariant < 0 || audioState.bgmActiveVariant >= bgmVariants.length) {
        pickBgmVariantForRun();
      }
      const ctxLocal = ensureContext();
      if (!ctxLocal || bgmTimer) return;
      nextStepTime = ctxLocal.currentTime + 0.02;
      stepIndex = 0;
      bgmTimer = window.setInterval(tickBgm, 40);
      tickBgm();
    },
    stopBgm() {
      if (!bgmTimer) return;
      window.clearInterval(bgmTimer);
      bgmTimer = null;
    },
    playJumpSfx() {
      playTone({ freq: 490, slideToFreq: 680, release: 0.1, volume: 0.2, type: "square" });
    },
    playBigJumpLayerSfx() {
      playTone({ freq: 620, slideToFreq: 900, release: 0.12, volume: 0.16, type: "triangle" });
    },
    playHitSfx() {
      playTone({ freq: 180, slideToFreq: 110, release: 0.2, volume: 0.22, type: "sawtooth" });
    },
    playGameOverSfx() {
      playTone({ freq: 420, slideToFreq: 260, release: 0.16, volume: 0.18, type: "triangle" });
      playTone({ freq: 300, slideToFreq: 180, release: 0.22, volume: 0.2, delay: 0.08, type: "sawtooth" });
      playTone({ freq: 170, slideToFreq: 120, release: 0.28, volume: 0.22, delay: 0.16, type: "square" });
    },
  };
}
