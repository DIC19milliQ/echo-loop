const CONFIG = {
  canvas: { width: 960, height: 540 },
  world: { groundY: 430, gravity: 2200, maxFallSpeed: 1450 },
  player: {
    width: 34,
    height: 46,
    startX: 110,
    startY: 384,
    baseSpeed: 215,
    speedStepPerFiveLaps: 6,
    smallJumpVelocity: -640,
    bigJumpVelocity: -840,
    invincibleMs: 1150,
    knockbackSpeed: 150,
  },
  input: {
    bigPressMs: 260,
  },
  obstacles: {
    lowWallHeight: 54,
    highWallHeight: 104,
    wallWidth: 36,
    pitMinWidth: 74,
    pitMaxWidth: 136,
    minGap: 58,
    safeStartZone: 180,
  },
  difficulty: {
    startDensity: 0.24,
    maxDensity: 0.62,
    startHighWallRate: 0.18,
    startChainRate: 0.1,
    startPitRate: 0.2,
    enemyBaseCap: 6,
    enemyMaxCap: 15,
  },
  enemies: {
    radius: 13,
    mergeProgressGap: 0.045,
    despawnX: -70,
    spawnAheadX: 82,
    maxSpawnPerFrame: 1,
    baseActiveCap: 3,
    capGrowthEveryLap: 3,
    rightEdgeNoHitWidth: 84,
    leftEdgeNoHitWidth: 42,
    leftEdgeSafeMs: 130,
    speedGrowthPerLap: 1.4,
    speedByKind: {
      sineLow: 178,
      sineHigh: 192,
      hover: 168,
      runner: 206,
    },
  },
  scoring: {
    survivalPerSecond: 10,
    lapBonus: 400,
    dodgeBonus: 70,
  },
  storage: {
    bestScoreKey: "echoLoopBestScore",
  },
};

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const overlayEl = document.getElementById("overlay");
const overlayMessageEl = document.getElementById("overlayMessage");
const overlayActionsEl = document.getElementById("overlayActions");
const overlayPrimaryButtonEl = document.getElementById("overlayPrimaryButton");
const overlaySettingsButtonEl = document.getElementById("overlaySettingsButton");
const settingsPanelEl = document.getElementById("settingsPanel");
const bgmVolumeSelectEl = document.getElementById("bgmVolumeSelect");
const sfxVolumeSelectEl = document.getElementById("sfxVolumeSelect");
const bgmTypeSelectEl = document.getElementById("bgmTypeSelect");
const pauseButtonEl = document.getElementById("pauseButton");
const hud = {
  life: document.getElementById("lifeValue"),
  lap: document.getElementById("lapValue"),
  score: document.getElementById("scoreValue"),
  best: document.getElementById("bestValue"),
};

const STORAGE_BEST = CONFIG.storage.bestScoreKey;
const STORAGE_BGM_VOLUME_LEVEL = "echoLoopBgmVolumeLevel";
const STORAGE_SFX_VOLUME_LEVEL = "echoLoopSfxVolumeLevel";
const STORAGE_BGM_VARIANT = "echoLoopBgmVariant";
const STORAGE_OLD_BGM_ENABLED = "echoLoopBgmEnabled";
const STORAGE_OLD_SFX_ENABLED = "echoLoopSfxEnabled";
const TYPE_PRIORITY = { smallJump: 1, bigJump: 2, brake: 3 };

function clampLevel(level) {
  return Math.max(0, Math.min(3, Number(level) || 0));
}

function clampVariant(variant) {
  return Math.max(0, Math.min(4, Number(variant) || 0));
}

function parseStoredVolumeLevel(key, defaultValue, legacyKey) {
  const stored = localStorage.getItem(key);
  if (stored !== null) return clampLevel(stored);

  const legacy = localStorage.getItem(legacyKey);
  if (legacy === "off") return 0;
  if (legacy === "on") return 2;
  return defaultValue;
}

function normalizeBgmVariantSetting(value) {
  const n = Number(value);
  if (n === -1) return -1;
  return clampVariant(n);
}

function parseStoredVariant(key, defaultValue) {
  const stored = localStorage.getItem(key);
  if (stored === null) return defaultValue;
  return normalizeBgmVariantSetting(stored);
}

const audioState = {
  initialized: false,
  bgmVolumeLevel: parseStoredVolumeLevel(STORAGE_BGM_VOLUME_LEVEL, 2, STORAGE_OLD_BGM_ENABLED),
  sfxVolumeLevel: parseStoredVolumeLevel(STORAGE_SFX_VOLUME_LEVEL, 2, STORAGE_OLD_SFX_ENABLED),
  bgmVariant: parseStoredVariant(STORAGE_BGM_VARIANT, 0),
  bgmActiveVariant: 0,
  lifeTier: 3,
};

const uiState = {
  settingsOpen: false,
};

function clampLifeTier(life) {
  return Math.max(1, Math.min(3, life | 0));
}

function getVolumeScalar(level) {
  const table = [0, 0.45, 0.8, 1.25];
  return table[clampLevel(level)];
}

function persistAudioSettings() {
  localStorage.setItem(STORAGE_BGM_VOLUME_LEVEL, String(audioState.bgmVolumeLevel));
  localStorage.setItem(STORAGE_SFX_VOLUME_LEVEL, String(audioState.sfxVolumeLevel));
  localStorage.setItem(STORAGE_BGM_VARIANT, String(audioState.bgmVariant));
}

function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function createAudioEngine() {
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
      } else if (state.mode === "running") {
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
  };
}

const audioEngine = createAudioEngine();

const state = {
  mode: "title",
  life: 3,
  lap: 1,
  score: 0,
  bestScore: Number(localStorage.getItem(STORAGE_BEST) || 0),
  survivalTime: 0,
  dodgedEnemies: 0,
  lapProgress: 0,
  currentLapLog: [],
  prevLapLogCompressed: [],
  mirrorSchedule: [],
  enemies: [],
  particles: [],
  terrain: null,
  trend: {
    density: CONFIG.difficulty.startDensity,
    highWallRate: CONFIG.difficulty.startHighWallRate,
    chainRate: CONFIG.difficulty.startChainRate,
    pitRate: CONFIG.difficulty.startPitRate,
  },
  lapStats: {
    jumps: 0,
    bigJumps: 0,
    brakes: 0,
    pitFalls: 0,
    hits: 0,
  },
  input: {
    active: false,
    startedAt: 0,
    canPromote: false,
    promoted: false,
  },
  clockMs: performance.now(),
};

const player = {
  x: CONFIG.player.startX,
  y: CONFIG.player.startY,
  w: CONFIG.player.width,
  h: CONFIG.player.height,
  vx: CONFIG.player.baseSpeed,
  vy: 0,
  onGround: true,
  invincibleUntilMs: 0,
  takingKnockbackUntilMs: 0,
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function frac(v) {
  return v - Math.floor(v);
}

function deterministicNoise(a, b, c) {
  return frac(Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function nextRand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRange(rand, min, max) {
  return min + (max - min) * rand();
}

function updateAudioToggleUi() {
  bgmVolumeSelectEl.value = String(audioState.bgmVolumeLevel);
  sfxVolumeSelectEl.value = String(audioState.sfxVolumeLevel);
  bgmTypeSelectEl.value = String(audioState.bgmVariant);
}

function setSettingsPanelOpen(open) {
  uiState.settingsOpen = open;
  settingsPanelEl.classList.toggle("hidden", !open);
  overlayEl.classList.toggle("settings-open", open);
}

function setOverlay(text, primaryLabel) {
  overlayMessageEl.textContent = text;
  overlayPrimaryButtonEl.textContent = primaryLabel;
  overlayActionsEl.hidden = false;
  setSettingsPanelOpen(false);
  overlayEl.classList.remove("hidden");
}

function hideOverlay() {
  setSettingsPanelOpen(false);
  overlayEl.classList.add("hidden");
}

function updatePauseButton() {
  pauseButtonEl.textContent = state.mode === "paused" ? "\u518d\u958b" : "\u4e00\u6642\u505c\u6b62";
  pauseButtonEl.disabled = state.mode === "title" || state.mode === "gameover";
}

function showTitleOverlay() {
  setOverlay("SPACE / TAP \u3067\u958b\u59cb", "\u958b\u59cb");
}

function showPauseOverlay() {
  setOverlay("PAUSED", "\u518d\u958b");
}

function showGameOverOverlay() {
  setOverlay(`GAME OVER  SCORE ${state.score} / BEST ${state.bestScore}  (SPACE \u3067\u518d\u958b)`, "\u3082\u3046\u4e00\u5ea6");
}

function pauseGame() {
  if (state.mode !== "running") return;
  state.mode = "paused";
  endPress();
  audioEngine.stopBgm();
  showPauseOverlay();
  updatePauseButton();
}

function resumeGame() {
  if (state.mode !== "paused") return;
  state.mode = "running";
  audioEngine.startBgm();
  hideOverlay();
  updatePauseButton();
}

function togglePause() {
  if (state.mode === "running") {
    pauseGame();
  } else if (state.mode === "paused") {
    resumeGame();
  }
}

function runPrimaryOverlayAction() {
  setSettingsPanelOpen(false);

  if (state.mode === "title" || state.mode === "gameover") {
    startGame();
    return;
  }

  if (state.mode === "paused") {
    resumeGame();
  }
}

function resetPlayer() {
  player.x = CONFIG.player.startX;
  player.y = CONFIG.player.startY;
  player.vx = CONFIG.player.baseSpeed;
  player.vy = 0;
  player.onGround = true;
  player.invincibleUntilMs = 0;
  player.takingKnockbackUntilMs = 0;
  player.leftEdgeSafeUntilMs = 0;
}

function resetRun() {
  state.life = 3;
  audioEngine.setBgmLifeTier(state.life);
  state.lap = 1;
  state.score = 0;
  state.survivalTime = 0;
  state.dodgedEnemies = 0;
  state.lapProgress = 0;
  state.currentLapLog = [];
  state.prevLapLogCompressed = [];
  state.mirrorSchedule = [];
  state.enemies = [];
  state.particles = [];
  state.trend = {
    density: CONFIG.difficulty.startDensity,
    highWallRate: CONFIG.difficulty.startHighWallRate,
    chainRate: CONFIG.difficulty.startChainRate,
    pitRate: CONFIG.difficulty.startPitRate,
  };
  state.lapStats = {
    jumps: 0,
    bigJumps: 0,
    brakes: 0,
    pitFalls: 0,
    hits: 0,
  };
  state.input.active = false;
  state.input.canPromote = false;
  state.input.promoted = false;
  state.terrain = generateLapTerrain(state.lap, state.trend, state.lapStats);
  resetPlayer();
}

function startGame() {
  audioEngine.refreshBgmVariantForRun();
  audioEngine.ensureReady();
  resetRun();
  state.mode = "running";
  audioEngine.startBgm();
  hideOverlay();
  updatePauseButton();
}

function endGame() {
  state.mode = "gameover";
  audioEngine.stopBgm();
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem(STORAGE_BEST, String(state.bestScore));
  }
  showGameOverOverlay();
  updatePauseButton();
}

function nextLap() {
  const lapSummary = summarizeLap(state.lapStats);
  state.trend = evolveTrend(state.trend, lapSummary, state.lap);
  state.prevLapLogCompressed = compressInputLog(state.currentLapLog, enemyCapForLap(state.lap + 1));
  state.currentLapLog = [];

  state.lap += 1;
  state.lapProgress = 0;
  state.lapStats = {
    jumps: 0,
    bigJumps: 0,
    brakes: 0,
    pitFalls: 0,
    hits: 0,
  };

  state.terrain = generateLapTerrain(state.lap, state.trend, lapSummary);
  state.mirrorSchedule = buildMirrorSchedule(state.prevLapLogCompressed);
}

function enemyCapForLap(lap) {
  return clamp(
    CONFIG.difficulty.enemyBaseCap + Math.floor((lap - 1) / 2),
    CONFIG.difficulty.enemyBaseCap,
    CONFIG.difficulty.enemyMaxCap
  );
}

function summarizeLap(stats) {
  const jumpSafe = Math.max(1, stats.jumps);
  return {
    jumps: stats.jumps,
    bigJumpRatio: stats.bigJumps / jumpSafe,
    brakes: stats.brakes,
    pitFalls: stats.pitFalls,
    hits: stats.hits,
    lap: state.lap,
  };
}

function evolveTrend(currentTrend, lapSummary, lap) {
  const jumpPressure = clamp(lapSummary.jumps / 10, 0, 1);
  const brakePressure = clamp(lapSummary.brakes / 6, 0, 1);
  const pitPressure = clamp(lapSummary.pitFalls / 3, 0, 1);
  const hitPressure = clamp(lapSummary.hits / 3, 0, 1);

  return {
    density: clamp(
      CONFIG.difficulty.startDensity + lap * 0.01 + jumpPressure * 0.08 + hitPressure * 0.03,
      CONFIG.difficulty.startDensity,
      CONFIG.difficulty.maxDensity
    ),
    highWallRate: clamp(
      CONFIG.difficulty.startHighWallRate + lapSummary.bigJumpRatio * 0.24 + lap * 0.003,
      0.12,
      0.62
    ),
    chainRate: clamp(
      CONFIG.difficulty.startChainRate + brakePressure * 0.22 + lap * 0.003,
      0.08,
      0.55
    ),
    pitRate: clamp(
      CONFIG.difficulty.startPitRate + pitPressure * 0.24 + lap * 0.003,
      0.1,
      0.42
    ),
  };
}

function generateLapTerrain(lap, trend, previousSummary) {
  const { width, height } = CONFIG.canvas;
  const seed =
    (lap * 9973 +
      Math.floor(trend.density * 1000) * 37 +
      Math.floor((previousSummary.jumps || 0) * 13) +
      Math.floor((previousSummary.pitFalls || 0) * 29)) >>>
    0;
  const rand = mulberry32(seed);

  const walls = [];
  const pits = [];

  const lowH = CONFIG.obstacles.lowWallHeight;
  const highH = CONFIG.obstacles.highWallHeight;
  const wallW = CONFIG.obstacles.wallWidth;

  let cursor = CONFIG.obstacles.safeStartZone;
  const laneEnd = width - 80;

  while (cursor < laneEnd) {
    const progress = cursor / width;
    const spacing = randomRange(rand, 70, 142) - trend.chainRate * 30;
    const willPlace = rand() < trend.density;

    if (!willPlace) {
      cursor += spacing;
      continue;
    }

    const roll = rand();
    const allowPit = progress > 0.12 && progress < 0.93;

    if (allowPit && roll < trend.pitRate * 1.35) {
      const pitW = randomRange(rand, CONFIG.obstacles.pitMinWidth, CONFIG.obstacles.pitMaxWidth);
      pits.push({ x: cursor, w: pitW });
      cursor += pitW + CONFIG.obstacles.minGap + randomRange(rand, 36, 90);
      continue;
    }

    if (roll < trend.pitRate + trend.chainRate) {
      const chainCount = 2 + Math.floor(rand() * 2);
      let chainX = cursor;
      for (let i = 0; i < chainCount; i += 1) {
        const useHigh = rand() < trend.highWallRate * 0.5;
        walls.push({
          x: chainX,
          y: CONFIG.world.groundY - (useHigh ? highH : lowH),
          w: wallW,
          h: useHigh ? highH : lowH,
          type: useHigh ? "highWall" : "lowWall",
        });
        chainX += wallW + randomRange(rand, 28, 44);
      }
      cursor = chainX + CONFIG.obstacles.minGap;
      continue;
    }

    const high = rand() < trend.highWallRate;
    walls.push({
      x: cursor,
      y: CONFIG.world.groundY - (high ? highH : lowH),
      w: wallW,
      h: high ? highH : lowH,
      type: high ? "highWall" : "lowWall",
    });
    cursor += wallW + spacing;
  }

  const mergedPits = mergeIntervals(pits, 8).map((pit) => ({
    x: clamp(pit.x, CONFIG.obstacles.safeStartZone, width - 40),
    w: clamp(pit.w, CONFIG.obstacles.pitMinWidth, CONFIG.obstacles.pitMaxWidth + 24),
  }));

  return {
    width,
    height,
    walls: walls.filter((w) => w.x + w.w < width - 20),
    pits: mergedPits.filter((p) => p.x + p.w < width - 10),
  };
}

function mergeIntervals(intervals, minGap) {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.x - b.x);
  const merged = [Object.assign({}, sorted[0])];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.x <= last.x + last.w + minGap) {
      const end = Math.max(last.x + last.w, current.x + current.w);
      last.w = end - last.x;
    } else {
      merged.push(Object.assign({}, current));
    }
  }

  return merged;
}

function compressInputLog(log, cap) {
  if (!log.length) return [];
  const sorted = [...log].sort((a, b) => a.progress - b.progress);
  const merged = [];

  for (const evt of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(evt.progress - prev.progress) <= CONFIG.enemies.mergeProgressGap) {
      if (TYPE_PRIORITY[evt.type] >= TYPE_PRIORITY[prev.type]) {
        prev.type = evt.type;
        prev.holdMs = evt.holdMs;
      }
      prev.progress = (prev.progress + evt.progress) * 0.5;
      continue;
    }
    merged.push({ progress: evt.progress, type: evt.type, holdMs: evt.holdMs || 0 });
  }

  if (merged.length <= cap) return merged;

  const step = merged.length / cap;
  const output = [];
  for (let i = 0; i < cap; i += 1) {
    const idx = Math.floor(i * step);
    output.push(merged[idx]);
  }
  return output;
}

function chooseEnemyKind(evt, index) {
  const noise = deterministicNoise(evt.progress * 1000, index + 1, state.lap + 17);

  if (evt.type === "bigJump") {
    return noise < 0.72 ? "sineHigh" : "hover";
  }

  if (evt.type === "smallJump") {
    const runnerRate = clamp(0.34 + (state.lap - 1) * 0.015, 0.34, 0.62);
    return noise < runnerRate ? "runner" : "sineLow";
  }

  return "hover";
}

function pickLaneIndex(kind, index, previousLane) {
  const laneCount = 5;
  if (kind === "runner") return laneCount - 1;

  const base = (index + state.lap) % 4;
  const noise = deterministicNoise(index + 41, state.lap * 9, kind.length * 13);
  let lane = clamp(base + Math.floor(noise * 3) - 1, 0, 3);

  if (kind === "sineHigh") lane = clamp(lane - 1, 0, 2);
  if (kind === "hover") lane = clamp(lane + 1, 1, 3);

  if (lane === previousLane) {
    lane = clamp(lane + (noise < 0.5 ? -1 : 1), 0, 3);
  }

  return lane;
}

function buildMirrorSchedule(compressedLog) {
  const schedule = [];
  let previousLane = -1;

  for (let index = 0; index < compressedLog.length; index += 1) {
    const evt = compressedLog[index];
    const kind = chooseEnemyKind(evt, index);
    const laneIndex = pickLaneIndex(kind, index, previousLane);
    previousLane = laneIndex;

    schedule.push({
      trigger: clamp(1 - evt.progress, 0.12, 0.88),
      type: evt.type,
      holdMs: evt.holdMs,
      kind,
      laneIndex,
      spawned: false,
      id: `${state.lap}-${index}-${evt.type}`,
    });
  }

  return schedule.sort((a, b) => a.trigger - b.trigger);
}

function laneCenterY(laneIndex) {
  const top = 74;
  const bottom = CONFIG.world.groundY - 26;
  const step = (bottom - top) / 4;
  return clamp(top + laneIndex * step, top, bottom);
}

function spawnEnemyFromSchedule(item) {
  const lapBoost = (state.lap - 1) * CONFIG.enemies.speedGrowthPerLap;
  const speed = CONFIG.enemies.speedByKind[item.kind] + lapBoost;

  const laneY = laneCenterY(item.laneIndex ?? 2);
  const jitter = (deterministicNoise(item.trigger * 1777, speed, state.lap) - 0.5) * 58;

  let baseY = laneY + jitter;
  if (item.kind === "sineHigh") baseY -= 30;
  if (item.kind === "hover") baseY += 18;
  if (item.kind === "runner") baseY = CONFIG.world.groundY - 15 + jitter * 0.12;

  baseY = clamp(baseY, 58, CONFIG.world.groundY - 14);

  state.enemies.push({
    id: item.id,
    type: item.type,
    kind: item.kind,
    x: CONFIG.canvas.width + CONFIG.enemies.spawnAheadX,
    y: baseY,
    baseY,
    speed,
    phase: deterministicNoise(item.trigger * 1400, speed, state.lap) * Math.PI * 2,
    age: 0,
    hit: false,
  });
}

function recordInputEvent(type, holdMs = 0) {
  const progress = clamp(player.x / CONFIG.canvas.width, 0, 1);
  state.currentLapLog.push({ progress, type, holdMs });
}

function startPress(now) {
  audioEngine.ensureReady();

  if (state.mode === "title" || state.mode === "gameover") {
    startGame();
    return;
  }

  if (state.mode === "paused") return;
  if (state.mode !== "running") return;
  if (state.input.active) return;

  state.input.active = true;
  state.input.startedAt = now;
  state.input.promoted = false;

  const jumped = tryJump("smallJump", 0);
  state.input.canPromote = jumped;
}

function endPress() {
  if (!state.input.active) return;

  state.input.active = false;
  state.input.canPromote = false;
  state.input.promoted = false;
}

function promoteHeldJump(holdMs) {
  if (player.vy >= 0) return false;

  player.vy = Math.min(player.vy, CONFIG.player.bigJumpVelocity);
  state.lapStats.bigJumps += 1;
  recordInputEvent("bigJump", holdMs);
  audioEngine.playBigJumpLayerSfx();
  emitBurst(player.x + player.w * 0.5, player.y + player.h * 0.55, 9, "#d7a8ff");
  return true;
}

function tryJump(kind, holdMs) {
  if (!player.onGround) return false;

  if (kind === "smallJump") {
    player.vy = CONFIG.player.smallJumpVelocity;
  } else {
    player.vy = CONFIG.player.bigJumpVelocity;
    state.lapStats.bigJumps += 1;
  }

  player.onGround = false;
  state.lapStats.jumps += 1;
  recordInputEvent(kind, holdMs);
  audioEngine.playJumpSfx();
  emitBurst(player.x + player.w * 0.4, player.y + player.h, 7, "#91c8ff");
  return true;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleRectHit(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

function isPitAtX(x) {
  for (const pit of state.terrain.pits) {
    if (x >= pit.x && x <= pit.x + pit.w) return true;
  }
  return false;
}

function hasGroundSupport() {
  const leftFoot = player.x + 4;
  const rightFoot = player.x + player.w - 4;
  return !isPitAtX(leftFoot) && !isPitAtX(rightFoot);
}

function resolveVertical(previousY) {
  player.onGround = false;

  if (player.vy >= 0) {
    const hasGround = hasGroundSupport();
    if (hasGround && player.y + player.h >= CONFIG.world.groundY) {
      player.y = CONFIG.world.groundY - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  }

  for (const wall of state.terrain.walls) {
    if (!overlaps(player, wall)) continue;

    const prevBottom = previousY + player.h;
    const prevTop = previousY;

    if (player.vy >= 0 && prevBottom <= wall.y + 4) {
      player.y = wall.y - player.h;
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0 && prevTop >= wall.y + wall.h - 4) {
      player.y = wall.y + wall.h;
      player.vy = 80;
    }
  }
}

function resolveHorizontal(previousX) {
  for (const wall of state.terrain.walls) {
    if (!overlaps(player, wall)) continue;

    const prevRight = previousX + player.w;
    const prevLeft = previousX;

    if (player.vx > 0 && prevRight <= wall.x + 2) {
      player.x = wall.x - player.w;
      player.vx = 0;
    } else if (player.vx < 0 && prevLeft >= wall.x + wall.w - 2) {
      player.x = wall.x + wall.w;
      player.vx = 0;
    }
  }
}

function takeDamage(now) {
  if (now < player.invincibleUntilMs) return;

  player.invincibleUntilMs = now + CONFIG.player.invincibleMs;
  player.takingKnockbackUntilMs = now + 180;
  player.vx = -CONFIG.player.knockbackSpeed;

  state.life -= 1;
  audioEngine.setBgmLifeTier(state.life);
  audioEngine.playHitSfx();
  state.lapStats.hits += 1;
  emitBurst(player.x + player.w * 0.5, player.y + player.h * 0.4, 14, "#ff6c83");

  if (state.life <= 0) {
    endGame();
  }
}

function enemyActiveCap() {
  return clamp(
    CONFIG.enemies.baseActiveCap + Math.floor((state.lap - 1) / CONFIG.enemies.capGrowthEveryLap),
    CONFIG.enemies.baseActiveCap,
    CONFIG.difficulty.enemyMaxCap
  );
}

function updateEnemies(dt, now) {
  let spawnedThisFrame = 0;
  const activeCap = enemyActiveCap();

  for (const item of state.mirrorSchedule) {
    if (spawnedThisFrame >= CONFIG.enemies.maxSpawnPerFrame) break;
    if (state.enemies.length >= activeCap) break;

    if (!item.spawned && state.lapProgress >= item.trigger) {
      item.spawned = true;
      spawnEnemyFromSchedule(item);
      spawnedThisFrame += 1;
    }
  }

  const remaining = [];
  const rightEdgeUnsafe = player.x >= CONFIG.canvas.width - CONFIG.enemies.rightEdgeNoHitWidth;
  const leftEdgeUnsafe = player.x <= CONFIG.enemies.leftEdgeNoHitWidth;
  const leftEdgeSafe = now < player.leftEdgeSafeUntilMs;

  for (const enemy of state.enemies) {
    enemy.age += dt;

    if (enemy.kind === "sineLow") {
      enemy.y = enemy.baseY + Math.sin(enemy.age * 5.1 + enemy.phase) * 18;
      enemy.x -= enemy.speed * dt;
    } else if (enemy.kind === "sineHigh") {
      enemy.y = enemy.baseY + Math.sin(enemy.age * 5.6 + enemy.phase) * 34;
      enemy.x -= enemy.speed * dt;
    } else if (enemy.kind === "hover") {
      enemy.y = enemy.baseY + Math.sin(enemy.age * 2.3 + enemy.phase) * 10;
      const pulse = 0.7 + 0.3 * (Math.sin(enemy.age * 3.1 + enemy.phase) * 0.5 + 0.5);
      enemy.x -= enemy.speed * pulse * dt;
    } else {
      enemy.y = enemy.baseY;
      enemy.x -= enemy.speed * dt;
    }

    if (!rightEdgeUnsafe && !leftEdgeUnsafe && !leftEdgeSafe) {
      const hit = circleRectHit(enemy.x, enemy.y, CONFIG.enemies.radius, player);
      if (hit && !enemy.hit) {
        enemy.hit = true;
        takeDamage(now);
      }
    }

    if (enemy.x < CONFIG.enemies.despawnX) {
      if (!enemy.hit) {
        state.dodgedEnemies += 1;
      }
      continue;
    }

    remaining.push(enemy);
  }

  state.enemies = remaining;
}

function emitBurst(x, y, count, color) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 70 + Math.random() * 180;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 0.5 + Math.random() * 0.5,
      color,
    });
  }
}

function updateParticles(dt) {
  const next = [];
  for (const p of state.particles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.vy += 460 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    next.push(p);
  }
  state.particles = next;
}

function computeBaseSpeed() {
  const boost = Math.floor((state.lap - 1) / 5) * CONFIG.player.speedStepPerFiveLaps;
  return CONFIG.player.baseSpeed + boost;
}

function updateRunning(dt, now) {
  if (state.input.active && state.input.canPromote && !state.input.promoted) {
    const holdMs = now - state.input.startedAt;
    if (holdMs >= CONFIG.input.bigPressMs) {
      state.input.promoted = promoteHeldJump(holdMs);
    }
  }

  const baseSpeed = computeBaseSpeed();
  if (now < player.takingKnockbackUntilMs) {
    player.vx = -CONFIG.player.knockbackSpeed;
  } else {
    player.vx = baseSpeed;
  }

  const xBefore = player.x;

  player.vy += CONFIG.world.gravity * dt;
  player.vy = Math.min(player.vy, CONFIG.world.maxFallSpeed);

  const prevY = player.y;
  player.y += player.vy * dt;
  resolveVertical(prevY);

  const prevX = player.x;
  player.x += player.vx * dt;
  resolveHorizontal(prevX);

  if (player.x >= CONFIG.canvas.width) {
    player.x -= CONFIG.canvas.width;
    nextLap();
    player.leftEdgeSafeUntilMs = now + CONFIG.enemies.leftEdgeSafeMs;
  }

  if (player.x < 0) {
    player.x += CONFIG.canvas.width;
  }

  if (player.y > CONFIG.canvas.height + player.h) {
    player.y = -player.h;
    player.vy = 0;
    state.lapStats.pitFalls += 1;
    emitBurst(player.x + player.w * 0.4, CONFIG.canvas.height - 6, 8, "#8ce2ff");
  }

  if (player.y + player.h < 0) {
    player.y = CONFIG.canvas.height;
    player.vy = 0;
  }

  let forwardMove = player.x - xBefore;
  if (forwardMove < -CONFIG.canvas.width * 0.5) {
    forwardMove += CONFIG.canvas.width;
  }
  if (forwardMove > 0.5) {
    state.survivalTime += dt;
  }

  state.lapProgress = clamp(player.x / CONFIG.canvas.width, 0, 1);

  updateEnemies(dt, now);
  updateParticles(dt);

  const score =
    Math.floor(state.survivalTime * CONFIG.scoring.survivalPerSecond) +
    (state.lap - 1) * CONFIG.scoring.lapBonus +
    state.dodgedEnemies * CONFIG.scoring.dodgeBonus;

  state.score = score;
  if (score > state.bestScore) {
    state.bestScore = score;
    localStorage.setItem(STORAGE_BEST, String(state.bestScore));
  }
}

function drawBackground() {
  const grd = ctx.createLinearGradient(0, 0, 0, CONFIG.canvas.height);
  grd.addColorStop(0, "#101b2f");
  grd.addColorStop(1, "#0a1220");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.045)";
  for (let i = 0; i < 40; i += 1) {
    const x = (i * 73 + state.lap * 21) % CONFIG.canvas.width;
    const y = (i * 37) % (CONFIG.canvas.height - 130);
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawTerrain() {
  const gY = CONFIG.world.groundY;

  ctx.fillStyle = "#355a7c";
  ctx.fillRect(0, gY, CONFIG.canvas.width, CONFIG.canvas.height - gY);

  ctx.fillStyle = "#1a2f45";
  for (const pit of state.terrain.pits) {
    ctx.fillRect(pit.x, gY - 3, pit.w, CONFIG.canvas.height - gY + 6);
  }

  for (const wall of state.terrain.walls) {
    ctx.fillStyle = wall.type === "highWall" ? "#ff9f45" : "#67b7ff";
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(wall.x + wall.w - 6, wall.y, 6, wall.h);
  }
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    if (enemy.kind === "sineLow") ctx.fillStyle = "#e8f36a";
    if (enemy.kind === "sineHigh") ctx.fillStyle = "#ff6a9d";
    if (enemy.kind === "hover") ctx.fillStyle = "#ffb65d";
    if (enemy.kind === "runner") ctx.fillStyle = "#87f5a2";

    if (enemy.kind === "runner") {
      ctx.fillRect(enemy.x - 12, enemy.y - 8, 24, 16);
      ctx.fillStyle = "rgba(8,12,18,0.75)";
      ctx.fillRect(enemy.x - 6, enemy.y - 2, 12, 4);
    } else {
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, CONFIG.enemies.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(8,12,18,0.7)";
      ctx.fillRect(enemy.x - 6, enemy.y - 2, 12, 4);
    }
  }
}

function drawPlayer(now) {
  const invincible = now < player.invincibleUntilMs;
  const lifeKey = String(clamp(state.life, 1, 3));
  const lifeColors = {
    "3": "#45e8ff",
    "2": "#4f7dff",
    "1": "#ff4f6d",
  };
  const invincibleColors = {
    "3": "#98f4ff",
    "2": "#aebfff",
    "1": "#ff9fae",
  };

  ctx.fillStyle = invincible ? invincibleColors[lifeKey] : lifeColors[lifeKey];
  ctx.fillRect(player.x, player.y, player.w, player.h);

  ctx.lineWidth = 2;
  ctx.strokeStyle = invincible ? "rgba(255,255,255,0.9)" : "rgba(9,16,28,0.82)";
  ctx.strokeRect(player.x + 1, player.y + 1, player.w - 2, player.h - 2);

  ctx.fillStyle = "#0d1627";
  ctx.fillRect(player.x + 7, player.y + 9, 7, 7);
  ctx.fillRect(player.x + player.w - 14, player.y + 9, 7, 7);
}

function drawParticles() {
  for (const p of state.particles) {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    if (p.color.startsWith("#")) {
      ctx.fillStyle = `rgba(${hexToRgb(p.color)},${alpha.toFixed(3)})`;
    } else {
      ctx.fillStyle = p.color.replace(")", `, ${alpha.toFixed(3)})`);
    }

    ctx.fillRect(p.x, p.y, 3, 3);
  }
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const normalized = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(normalized, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `${r},${g},${b}`;
}

function drawProgressHint() {
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(24, 26, CONFIG.canvas.width - 48, 5);
  ctx.fillStyle = "#8ed0ff";
  ctx.fillRect(24, 26, (CONFIG.canvas.width - 48) * state.lapProgress, 5);
}

function render(now) {
  drawBackground();
  drawTerrain();
  drawEnemies();
  drawPlayer(now);
  drawParticles();
  drawProgressHint();
}

function updateHud() {
  hud.life.textContent = String(state.life);
  hud.lap.textContent = String(state.lap);
  hud.score.textContent = String(state.score);
  hud.best.textContent = String(state.bestScore);
}

function loop(now) {
  const dt = clamp((now - state.clockMs) / 1000, 0, 0.033);
  state.clockMs = now;

  if (state.mode === "running") {
    updateRunning(dt, now);
  }

  render(now);
  updateHud();
  requestAnimationFrame(loop);
}

function onKeyDown(e) {
  if (e.code === "Escape") {
    e.preventDefault();
    togglePause();
    return;
  }

  if (e.code !== "Space") return;
  e.preventDefault();

  if (state.mode === "paused") {
    resumeGame();
    return;
  }

  startPress(performance.now());
}

function onKeyUp(e) {
  if (e.code !== "Space") return;
  e.preventDefault();
  endPress();
}

function isUiControlTarget(target) {
  return target instanceof Element && target.closest(".ui-control");
}

function onPointerDown(e) {
  if (isUiControlTarget(e.target)) return;
  e.preventDefault();
  startPress(performance.now());
}

function onPointerUp(e) {
  if (isUiControlTarget(e.target)) return;
  e.preventDefault();
  endPress();
}

function onTouchStart(e) {
  if (isUiControlTarget(e.target)) return;
  e.preventDefault();
  startPress(performance.now());
}

function onTouchEnd(e) {
  if (isUiControlTarget(e.target)) return;
  e.preventDefault();
  endPress();
}

function onPauseButtonClick(e) {
  e.preventDefault();
  togglePause();
}

function onOverlayPrimaryClick(e) {
  e.preventDefault();
  runPrimaryOverlayAction();
}

function onOverlaySettingsClick(e) {
  e.preventDefault();
  audioEngine.ensureReady();
  setSettingsPanelOpen(!uiState.settingsOpen);
}

function onBgmVolumeChange(e) {
  const nextLevel = clampLevel(e.target.value);
  audioEngine.setBgmVolumeLevel(nextLevel);
  updateAudioToggleUi();
}

function onSfxVolumeChange(e) {
  const nextLevel = clampLevel(e.target.value);
  audioEngine.setSfxVolumeLevel(nextLevel);
  updateAudioToggleUi();
}
function onBgmTypeChange(e) {
  const nextVariant = normalizeBgmVariantSetting(e.target.value);
  audioEngine.setBgmVariant(nextVariant);
  updateAudioToggleUi();
}

window.addEventListener("keydown", onKeyDown, { passive: false });
window.addEventListener("keyup", onKeyUp, { passive: false });
window.addEventListener("pointerdown", onPointerDown, { passive: false });
window.addEventListener("pointerup", onPointerUp, { passive: false });
window.addEventListener("pointercancel", onPointerUp, { passive: false });

if (!window.PointerEvent) {
  window.addEventListener("touchstart", onTouchStart, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: false });
  window.addEventListener("touchcancel", onTouchEnd, { passive: false });
}

pauseButtonEl.addEventListener("click", onPauseButtonClick);
overlayPrimaryButtonEl.addEventListener("click", onOverlayPrimaryClick);
overlaySettingsButtonEl.addEventListener("click", onOverlaySettingsClick);
bgmVolumeSelectEl.addEventListener("change", onBgmVolumeChange);
sfxVolumeSelectEl.addEventListener("change", onSfxVolumeChange);
bgmTypeSelectEl.addEventListener("change", onBgmTypeChange);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

updateAudioToggleUi();
setSettingsPanelOpen(false);
showTitleOverlay();
updatePauseButton();
state.terrain = generateLapTerrain(state.lap, state.trend, state.lapStats);
hud.best.textContent = String(state.bestScore);
requestAnimationFrame((t) => {
  state.clockMs = t;
  loop(t);
});

