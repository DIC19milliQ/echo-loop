(() => {
  // src/core/config.js
  var CONFIG = {
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
      knockbackSpeed: 150
    },
    input: {
      bigPressMs: 260
    },
    obstacles: {
      lowWallHeight: 54,
      highWallHeight: 104,
      wallWidth: 36,
      pitMinWidth: 74,
      pitMaxWidth: 136,
      minGap: 58,
      safeStartZone: 180
    },
    difficulty: {
      startDensity: 0.24,
      maxDensity: 0.62,
      startHighWallRate: 0.18,
      startChainRate: 0.1,
      startPitRate: 0.2,
      enemyBaseCap: 6,
      enemyMaxCap: 15
    },
    terrain: {
      useBrakeV2: true,
      useMotifGenerator: true,
      enablePlatforms: true,
      baseDangerBudget: 9.8,
      dangerBudgetPerLap: 0.28,
      dangerBudgetVariance: 1.1,
      maxSameMotifStreak: 2,
      restZoneMinPerLap: 1,
      motifWeights: {
        flatRun: 0.95,
        chain: 1,
        pitZone: 0.9,
        restZone: 0.56,
        platformZone: 0.82
      },
      platformRate: 0.16,
      platformChainRate: 0.46,
      platformHeightBandMin: 110,
      platformHeightBandMax: 170,
      platformWidthMin: 42,
      platformWidthMax: 84,
      platformGapMin: 34,
      platformGapMax: 78,
      platformCost: 0.85,
      introSimpleLaps: 1,
      wallGapTightMaxPx: 17,
      wallGapOpenMinPx: 68
    },
    debug: {
      showTerrainOverlay: false,
      logTerrainReason: false
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
        runner: 206
      }
    },
    scoring: {
      survivalPerSecond: 10,
      lapBonus: 400,
      dodgeBonus: 70
    },
    storage: {
      bestScoreKey: "echoLoopBestScore"
    }
  };
  var STORAGE_KEYS = {
    best: CONFIG.storage.bestScoreKey,
    bgmVolumeLevel: "echoLoopBgmVolumeLevel",
    sfxVolumeLevel: "echoLoopSfxVolumeLevel",
    bgmVariant: "echoLoopBgmVariant",
    legacyBgmEnabled: "echoLoopBgmEnabled",
    legacySfxEnabled: "echoLoopSfxEnabled"
  };
  var TYPE_PRIORITY = { smallJump: 1, bigJump: 2, brake: 3 };

  // src/audio.js
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
  function createAudioEngine({ storage, getMode }) {
    const audioState = {
      initialized: false,
      bgmVolumeLevel: parseStoredVolumeLevel(storage, STORAGE_KEYS.bgmVolumeLevel, 2, STORAGE_KEYS.legacyBgmEnabled),
      sfxVolumeLevel: parseStoredVolumeLevel(storage, STORAGE_KEYS.sfxVolumeLevel, 2, STORAGE_KEYS.legacySfxEnabled),
      bgmVariant: parseStoredVariant(storage, STORAGE_KEYS.bgmVariant, 0),
      bgmActiveVariant: 0,
      lifeTier: 3
    };
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const lifeProfiles = {
      3: { stepSeconds: 0.28, semitoneShift: 0 },
      2: { stepSeconds: 0.245, semitoneShift: 2 },
      1: { stepSeconds: 0.21, semitoneShift: 4 }
    };
    const bgmVariants = [
      {
        label: "TYPE 1",
        sequence: [0, 2, 4, 5, 7, 5, 4, 2, 0, 2, 4, 7, 9, 7, 5, 2],
        leadWave: "square",
        bassWave: "triangle"
      },
      {
        label: "TYPE 2",
        sequence: [0, 3, 5, 7, 5, 3, 2, 0, -2, 0, 2, 3, 5, 3, 2, 0],
        leadWave: "triangle",
        bassWave: "square"
      },
      {
        label: "TYPE 3",
        sequence: [0, -2, 1, 3, 5, 3, 1, 0, 3, 5, 7, 8, 7, 5, 3, 1],
        leadWave: "sawtooth",
        bassWave: "triangle"
      },
      {
        label: "TYPE 4",
        sequence: [0, 4, 7, 11, 7, 4, 2, 0, 2, 4, 5, 7, 9, 7, 5, 4],
        leadWave: "square",
        bassWave: "square"
      },
      {
        label: "TYPE 5",
        sequence: [0, 1, 3, 6, 8, 6, 3, 1, 0, -2, 1, 3, 5, 3, 1, 0],
        leadWave: "triangle",
        bassWave: "triangle"
      }
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
      const target = scalar <= 0 ? 1e-4 : 0.58 * scalar;
      bgmGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.02);
    }
    function updateSfxGain() {
      if (!sfxGain || !audioCtx) return;
      const scalar = getVolumeScalar(audioState.sfxVolumeLevel);
      const target = scalar <= 0 ? 1e-4 : 0.62 * scalar;
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
        bgmGain.gain.value = 1e-4;
        sfxGain.gain.value = 1e-4;
        bgmGain.connect(masterGain);
        sfxGain.connect(masterGain);
        masterGain.connect(audioCtx.destination);
        audioState.initialized = true;
        updateBgmGain();
        updateSfxGain();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {
        });
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
      const attack = opts.attack || 2e-3;
      const release = opts.release || 0.11;
      const peak = opts.volume || 0.18;
      const osc = ctxLocal.createOscillator();
      const gain = ctxLocal.createGain();
      osc.type = opts.type || "square";
      osc.frequency.setValueAtTime(opts.freq, start);
      if (opts.slideToFreq) {
        osc.frequency.exponentialRampToValueAtTime(opts.slideToFreq, start + release);
      }
      gain.gain.setValueAtTime(1e-4, start);
      gain.gain.linearRampToValueAtTime(peak, start + attack);
      gain.gain.exponentialRampToValueAtTime(1e-4, start + release);
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
      leadGain.gain.setValueAtTime(1e-4, time);
      leadGain.gain.linearRampToValueAtTime(0.07, time + 8e-3);
      leadGain.gain.exponentialRampToValueAtTime(1e-4, time + 0.17);
      leadOsc.connect(leadGain);
      leadGain.connect(bgmGain);
      leadOsc.start(time);
      leadOsc.stop(time + 0.2);
      if (idx % 2 === 0) {
        const bassOsc = ctxLocal.createOscillator();
        const bassGainNode = ctxLocal.createGain();
        bassOsc.type = variant.bassWave;
        bassOsc.frequency.setValueAtTime(midiToHz(bassMidi), time);
        bassGainNode.gain.setValueAtTime(1e-4, time);
        bassGainNode.gain.linearRampToValueAtTime(0.05, time + 0.012);
        bassGainNode.gain.exponentialRampToValueAtTime(1e-4, time + 0.2);
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
          bgmVariant: audioState.bgmVariant
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
      }
    };
  }

  // src/core/state.js
  function createTrend(config) {
    return {
      density: config.difficulty.startDensity,
      highWallRate: config.difficulty.startHighWallRate,
      chainRate: config.difficulty.startChainRate,
      pitRate: config.difficulty.startPitRate,
      brakePressure: 0
    };
  }
  function createLapStats() {
    return {
      jumps: 0,
      bigJumps: 0,
      brakes: 0,
      stallTimeSec: 0,
      lapTimeSec: 0,
      forwardDistancePx: 0,
      progressEfficiency: 1,
      pitFalls: 0,
      hits: 0
    };
  }
  function createInitialState(config, storage) {
    return {
      mode: "title",
      life: 3,
      lap: 1,
      score: 0,
      bestScore: Number(storage.getItem(config.storage.bestScoreKey) || 0),
      survivalTime: 0,
      dodgedEnemies: 0,
      lapProgress: 0,
      currentLapLog: [],
      prevLapLogCompressed: [],
      mirrorSchedule: [],
      enemies: [],
      particles: [],
      terrain: null,
      terrainDebug: null,
      trend: createTrend(config),
      lapStats: createLapStats(),
      input: {
        active: false,
        startedAt: 0,
        canPromote: false,
        promoted: false
      },
      clockMs: performance.now()
    };
  }
  function createPlayer(config) {
    return {
      x: config.player.startX,
      y: config.player.startY,
      w: config.player.width,
      h: config.player.height,
      vx: config.player.baseSpeed,
      vy: 0,
      onGround: true,
      invincibleUntilMs: 0,
      takingKnockbackUntilMs: 0,
      leftEdgeSafeUntilMs: 0
    };
  }
  function resetPlayer(player, config) {
    player.x = config.player.startX;
    player.y = config.player.startY;
    player.vx = config.player.baseSpeed;
    player.vy = 0;
    player.onGround = true;
    player.invincibleUntilMs = 0;
    player.takingKnockbackUntilMs = 0;
    player.leftEdgeSafeUntilMs = 0;
  }

  // src/core/utils.js
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
      t += 1831565813;
      let r = Math.imul(t ^ t >>> 15, t | 1);
      r ^= r + Math.imul(r ^ r >>> 7, r | 61);
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }
  function randomRange(rand, min, max) {
    return min + (max - min) * rand();
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
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const normalized = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(normalized, 16);
    const r = n >> 16 & 255;
    const g = n >> 8 & 255;
    const b = n & 255;
    return `${r},${g},${b}`;
  }

  // src/input.js
  function registerInputHandlers(deps) {
    const {
      config,
      canvas,
      pauseButtonEl,
      overlayPrimaryButtonEl,
      overlaySettingsButtonEl,
      bgmVolumeSelectEl,
      sfxVolumeSelectEl,
      bgmTypeSelectEl,
      getMode,
      togglePause,
      resumeGame,
      startPress,
      endPress,
      runPrimaryOverlayAction,
      onToggleSettings,
      onBgmVolumeChange,
      onSfxVolumeChange,
      onBgmTypeChange
    } = deps;
    function isUiControlTarget(target) {
      return target instanceof Element && target.closest(".ui-control");
    }
    function onKeyDown(e) {
      if (e.code === "F3") {
        e.preventDefault();
        config.debug.showTerrainOverlay = !config.debug.showTerrainOverlay;
        return;
      }
      if (e.code === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (e.code !== "Space") return;
      e.preventDefault();
      if (getMode() === "paused") {
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
      onToggleSettings();
    }
    function handleBgmVolumeChange(e) {
      onBgmVolumeChange(e.target.value);
    }
    function handleSfxVolumeChange(e) {
      onSfxVolumeChange(e.target.value);
    }
    function handleBgmTypeChange(e) {
      onBgmTypeChange(e.target.value);
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
    bgmVolumeSelectEl.addEventListener("change", handleBgmVolumeChange);
    sfxVolumeSelectEl.addEventListener("change", handleSfxVolumeChange);
    bgmTypeSelectEl.addEventListener("change", handleBgmTypeChange);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // src/renderer.js
  function drawBackground(ctx, state, config) {
    const grd = ctx.createLinearGradient(0, 0, 0, config.canvas.height);
    grd.addColorStop(0, "#101b2f");
    grd.addColorStop(1, "#0a1220");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, config.canvas.width, config.canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    for (let i = 0; i < 40; i += 1) {
      const x = (i * 73 + state.lap * 21) % config.canvas.width;
      const y = i * 37 % (config.canvas.height - 130);
      ctx.fillRect(x, y, 2, 2);
    }
  }
  function drawTerrain(ctx, state, config) {
    const gY = config.world.groundY;
    ctx.fillStyle = "#355a7c";
    ctx.fillRect(0, gY, config.canvas.width, config.canvas.height - gY);
    ctx.fillStyle = "#1a2f45";
    for (const pit of state.terrain.pits) {
      ctx.fillRect(pit.x, gY - 3, pit.w, config.canvas.height - gY + 6);
    }
    for (const platform of state.terrain.platforms || []) {
      ctx.fillStyle = "#9ef0bf";
      ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(platform.x, platform.y + platform.h - 3, platform.w, 3);
    }
    for (const wall of state.terrain.walls) {
      ctx.fillStyle = wall.type === "highWall" ? "#ff9f45" : "#67b7ff";
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(wall.x + wall.w - 6, wall.y, 6, wall.h);
    }
  }
  function drawEnemies(ctx, state, config) {
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
        ctx.arc(enemy.x, enemy.y, config.enemies.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(8,12,18,0.7)";
        ctx.fillRect(enemy.x - 6, enemy.y - 2, 12, 4);
      }
    }
  }
  function drawPlayer(now, ctx2d, state, player) {
    const invincible = now < player.invincibleUntilMs;
    const lifeKey = String(clamp(state.life, 1, 3));
    const lifeColors = {
      "3": "#45e8ff",
      "2": "#4f7dff",
      "1": "#ff4f6d"
    };
    const invincibleColors = {
      "3": "#98f4ff",
      "2": "#aebfff",
      "1": "#ff9fae"
    };
    ctx2d.fillStyle = invincible ? invincibleColors[lifeKey] : lifeColors[lifeKey];
    ctx2d.fillRect(player.x, player.y, player.w, player.h);
    ctx2d.lineWidth = 2;
    ctx2d.strokeStyle = invincible ? "rgba(255,255,255,0.9)" : "rgba(9,16,28,0.82)";
    ctx2d.strokeRect(player.x + 1, player.y + 1, player.w - 2, player.h - 2);
    ctx2d.fillStyle = "#0d1627";
    ctx2d.fillRect(player.x + 7, player.y + 9, 7, 7);
    ctx2d.fillRect(player.x + player.w - 14, player.y + 9, 7, 7);
  }
  function drawParticles(ctx, state) {
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
  function drawProgressHint(ctx, state, config) {
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(24, 26, config.canvas.width - 48, 5);
    ctx.fillStyle = "#8ed0ff";
    ctx.fillRect(24, 26, (config.canvas.width - 48) * state.lapProgress, 5);
  }
  function drawTerrainDebugOverlay(ctx, state, config) {
    if (!config.debug.showTerrainOverlay) return;
    const debug = state.terrainDebug;
    if (!debug) return;
    const panelX = 16;
    const panelY = 42;
    const panelW = 520;
    const panelH = 104;
    ctx.fillStyle = "rgba(8,12,18,0.68)";
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = "rgba(142,208,255,0.5)";
    ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);
    const motifText = (debug.motifs || []).slice(0, 7).join(" > ");
    const trend = debug.trend || {};
    const danger = debug.danger || { target: 0, spent: 0 };
    const lines = [
      `Lap ${state.lap}  seed ${debug.seed}  mode ${debug.mode}`,
      `trend d=${(trend.density || 0).toFixed(2)} hw=${(trend.highWallRate || 0).toFixed(2)} ch=${(trend.chainRate || 0).toFixed(2)} pit=${(trend.pitRate || 0).toFixed(2)} brake=${(trend.brakePressure || 0).toFixed(2)}`,
      `budget ${danger.spent.toFixed(2)} / ${danger.target.toFixed(2)}   stalls ${state.lapStats.stallTimeSec.toFixed(2)}s   eff ${state.lapStats.progressEfficiency.toFixed(2)}`,
      `motifs ${motifText}`
    ];
    ctx.fillStyle = "#d6e7ff";
    ctx.font = "12px monospace";
    for (let i = 0; i < lines.length; i += 1) {
      ctx.fillText(lines[i], panelX + 10, panelY + 22 + i * 22);
    }
  }
  function render(now, view) {
    const { ctx, state, player, config } = view;
    drawBackground(ctx, state, config);
    drawTerrain(ctx, state, config);
    drawEnemies(ctx, state, config);
    drawPlayer(now, ctx, state, player);
    drawParticles(ctx, state);
    drawProgressHint(ctx, state, config);
    drawTerrainDebugOverlay(ctx, state, config);
  }
  function updateHud(view) {
    const { hud, state } = view;
    hud.life.textContent = String(state.life);
    hud.lap.textContent = String(state.lap);
    hud.score.textContent = String(state.score);
    hud.best.textContent = String(state.bestScore);
  }

  // src/systems/mirror.js
  function compressInputLog(log, cap, config) {
    if (!log.length) return [];
    const sorted = [...log].sort((a, b) => a.progress - b.progress);
    const merged = [];
    for (const evt of sorted) {
      const prev = merged[merged.length - 1];
      if (prev && Math.abs(evt.progress - prev.progress) <= config.enemies.mergeProgressGap) {
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
  function chooseEnemyKind(evt, index, lap) {
    const noise = deterministicNoise(evt.progress * 1e3, index + 1, lap + 17);
    if (evt.type === "bigJump") {
      return noise < 0.72 ? "sineHigh" : "hover";
    }
    if (evt.type === "smallJump") {
      const runnerRate = clamp(0.34 + (lap - 1) * 0.015, 0.34, 0.62);
      return noise < runnerRate ? "runner" : "sineLow";
    }
    return "hover";
  }
  function pickLaneIndex(kind, index, previousLane, lap) {
    const laneCount = 5;
    if (kind === "runner") return laneCount - 1;
    const base = (index + lap) % 4;
    const noise = deterministicNoise(index + 41, lap * 9, kind.length * 13);
    let lane = clamp(base + Math.floor(noise * 3) - 1, 0, 3);
    if (kind === "sineHigh") lane = clamp(lane - 1, 0, 2);
    if (kind === "hover") lane = clamp(lane + 1, 1, 3);
    if (lane === previousLane) {
      lane = clamp(lane + (noise < 0.5 ? -1 : 1), 0, 3);
    }
    return lane;
  }
  function buildMirrorSchedule(compressedLog, config, lap) {
    const schedule = [];
    let previousLane = -1;
    for (let index = 0; index < compressedLog.length; index += 1) {
      const evt = compressedLog[index];
      const kind = chooseEnemyKind(evt, index, lap);
      const laneIndex = pickLaneIndex(kind, index, previousLane, lap);
      previousLane = laneIndex;
      schedule.push({
        trigger: clamp(1 - evt.progress, 0.12, 0.88),
        type: evt.type,
        holdMs: evt.holdMs,
        kind,
        laneIndex,
        spawned: false,
        id: `${lap}-${index}-${evt.type}`
      });
    }
    return schedule.sort((a, b) => a.trigger - b.trigger);
  }
  function laneCenterY(laneIndex, config) {
    const top = 74;
    const bottom = config.world.groundY - 26;
    const step = (bottom - top) / 4;
    return clamp(top + laneIndex * step, top, bottom);
  }

  // src/systems/terrain.js
  function removeWallsOnPits(walls, pits) {
    if (!pits.length || !walls.length) return walls;
    return walls.filter((wall) => {
      for (const pit of pits) {
        if (wall.x < pit.x + pit.w - 2 && wall.x + wall.w > pit.x + 2) {
          return false;
        }
      }
      return true;
    });
  }
  function enforceWallGapRule(walls, laneWidth, config) {
    if (!walls.length) return [];
    const tightMax = Math.max(2, config.terrain.wallGapTightMaxPx || Math.floor(config.player.width * 0.5));
    const openMin = Math.max(tightMax + 1, config.terrain.wallGapOpenMinPx || config.player.width * 2);
    const sorted = [...walls].sort((a, b) => a.x - b.x);
    const out = [Object.assign({}, sorted[0])];
    for (let i = 1; i < sorted.length; i += 1) {
      const current = Object.assign({}, sorted[i]);
      const prev = out[out.length - 1];
      const prevEnd = prev.x + prev.w;
      if (current.x < prevEnd + 2) {
        current.x = prevEnd + 2;
      }
      let gap = current.x - prevEnd;
      if (gap > tightMax && gap < openMin) {
        current.x = prevEnd + openMin;
        gap = openMin;
      }
      if (current.x + current.w >= laneWidth - 20) continue;
      if (gap <= tightMax) {
        current.h = prev.h;
        current.y = prev.y;
        current.type = prev.type;
      }
      out.push(current);
    }
    return out;
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
  function terrainSeedFrom(lap, trend, previousSummary) {
    return lap * 9973 + Math.floor(trend.density * 1e3) * 37 + Math.floor((previousSummary.jumps || 0) * 13) + Math.floor((previousSummary.pitFalls || 0) * 29) >>> 0;
  }
  function generateLapTerrainLegacy(lap, trend, seed, config) {
    const { width, height } = config.canvas;
    const rand = mulberry32(seed);
    const walls = [];
    const pits = [];
    const lowH = config.obstacles.lowWallHeight;
    const highH = config.obstacles.highWallHeight;
    const wallW = config.obstacles.wallWidth;
    const simpleLap = lap <= config.terrain.introSimpleLaps;
    let cursor = config.obstacles.safeStartZone;
    const laneEnd = width - 80;
    while (cursor < laneEnd) {
      const progress = cursor / width;
      const spacing = randomRange(rand, 70, 142) - trend.chainRate * 30;
      const willPlace = rand() < trend.density * (simpleLap ? 0.55 : 1);
      if (!willPlace) {
        cursor += spacing;
        continue;
      }
      const roll = rand();
      const allowPit = !simpleLap && progress > 0.12 && progress < 0.93;
      if (allowPit && roll < trend.pitRate * 1.35) {
        const pitW = randomRange(rand, config.obstacles.pitMinWidth, config.obstacles.pitMaxWidth);
        pits.push({ x: cursor, w: pitW });
        cursor += pitW + config.obstacles.minGap + randomRange(rand, 36, 90);
        continue;
      }
      if (roll < trend.pitRate + trend.chainRate) {
        const chainCount = 2 + Math.floor(rand() * 2);
        let chainX = cursor;
        for (let i = 0; i < chainCount; i += 1) {
          const useHigh = !simpleLap && rand() < trend.highWallRate * 0.5;
          walls.push({
            x: chainX,
            y: config.world.groundY - (useHigh ? highH : lowH),
            w: wallW,
            h: useHigh ? highH : lowH,
            type: useHigh ? "highWall" : "lowWall"
          });
          chainX += wallW + randomRange(rand, 28, 44);
        }
        cursor = chainX + config.obstacles.minGap;
        continue;
      }
      const high = !simpleLap && rand() < trend.highWallRate;
      walls.push({
        x: cursor,
        y: config.world.groundY - (high ? highH : lowH),
        w: wallW,
        h: high ? highH : lowH,
        type: high ? "highWall" : "lowWall"
      });
      cursor += wallW + spacing;
    }
    const mergedPits = mergeIntervals(pits, 8).map((pit) => ({
      x: clamp(pit.x, config.obstacles.safeStartZone, width - 40),
      w: clamp(pit.w, config.obstacles.pitMinWidth, config.obstacles.pitMaxWidth + 24)
    }));
    const filteredLegacyPits = mergedPits.filter((p) => p.x + p.w < width - 10);
    const filteredLegacyWalls = removeWallsOnPits(
      enforceWallGapRule(walls.filter((w) => w.x + w.w < width - 20), width, config),
      filteredLegacyPits
    );
    return {
      width,
      height,
      walls: filteredLegacyWalls,
      pits: filteredLegacyPits,
      platforms: [],
      debug: {
        seed,
        mode: "legacy",
        motifs: ["legacy"],
        danger: { target: 0, spent: 0, reserve: 0 },
        trend
      }
    };
  }
  function buildMotifCatalog(trend, lap, config) {
    const mw = config.terrain.motifWeights;
    return {
      flatRun: {
        id: "flatRun",
        weight: mw.flatRun * clamp(1.16 - trend.density * 0.54, 0.55, 1.35),
        minLen: 120,
        maxLen: 220
      },
      chain: {
        id: "chain",
        weight: mw.chain * clamp(0.52 + trend.chainRate * 2.1, 0.4, 1.55),
        minLen: 120,
        maxLen: 230
      },
      pitZone: {
        id: "pitZone",
        weight: mw.pitZone * clamp(0.48 + trend.pitRate * 2.2, 0.35, 1.6) * (lap <= config.terrain.introSimpleLaps ? 0 : 1),
        minLen: 120,
        maxLen: 220
      },
      restZone: {
        id: "restZone",
        weight: mw.restZone * clamp(1.25 - trend.density * 0.62, 0.65, 1.6),
        minLen: 90,
        maxLen: 180
      },
      platformZone: {
        id: "platformZone",
        weight: mw.platformZone * (config.terrain.enablePlatforms && lap > config.terrain.introSimpleLaps ? 1 : 0) * clamp(config.terrain.platformRate * (0.8 + trend.highWallRate * 0.9), 0, 1.1),
        minLen: 140,
        maxLen: 240
      }
    };
  }
  function pickMotif(rand, motifCatalog, prevId, streak, restRequired, config) {
    const entries = [];
    for (const id of Object.keys(motifCatalog)) {
      const motif = motifCatalog[id];
      if (motif.weight <= 0) continue;
      if (id === prevId && streak >= config.terrain.maxSameMotifStreak) continue;
      let weight = motif.weight;
      if (restRequired > 0 && id === "restZone") {
        weight *= 1.55;
      }
      entries.push({ id, weight });
    }
    if (!entries.length) return "flatRun";
    const sum = entries.reduce((acc, e) => acc + e.weight, 0);
    let roll = rand() * sum;
    for (const e of entries) {
      roll -= e.weight;
      if (roll <= 0) return e.id;
    }
    return entries[entries.length - 1].id;
  }
  function buildLapPlan(lap, trend, previousSummary, seed, config) {
    const width = config.canvas.width;
    const start = config.obstacles.safeStartZone;
    const laneEnd = width - 80;
    const rand = mulberry32(seed ^ 2654435769);
    const motifCatalog = buildMotifCatalog(trend, lap, config);
    const motifs = [];
    let cursor = start;
    let prevId = "";
    let sameStreak = 0;
    let restCount = 0;
    if (lap <= config.terrain.introSimpleLaps) {
      const simpleMid = start + (laneEnd - start) * 0.6;
      return {
        motifs: [
          { id: "flatRun", startX: start, endX: simpleMid },
          { id: "restZone", startX: simpleMid, endX: laneEnd }
        ],
        budget: {
          target: 4.8,
          spent: 0,
          reserve: 0.35
        }
      };
    }
    while (cursor < laneEnd) {
      const restRequired = Math.max(0, config.terrain.restZoneMinPerLap - restCount);
      const id = pickMotif(rand, motifCatalog, prevId, sameStreak, restRequired, config);
      const spec = motifCatalog[id] || motifCatalog.flatRun;
      const len = Math.min(laneEnd - cursor, randomRange(rand, spec.minLen, spec.maxLen));
      motifs.push({ id, startX: cursor, endX: cursor + len });
      cursor += len;
      if (id === "restZone") restCount += 1;
      if (id === prevId) {
        sameStreak += 1;
      } else {
        sameStreak = 1;
        prevId = id;
      }
    }
    if (restCount < config.terrain.restZoneMinPerLap && motifs.length) {
      for (let i = motifs.length - 1; i >= 0; i -= 1) {
        if (motifs[i].id !== "restZone") {
          motifs[i].id = "restZone";
          restCount += 1;
        }
        if (restCount >= config.terrain.restZoneMinPerLap) break;
      }
    }
    if (config.terrain.enablePlatforms && lap > config.terrain.introSimpleLaps && !motifs.some((m) => m.id === "platformZone")) {
      const boostPlatform = deterministicNoise(seed, lap * 3, previousSummary.hits || 0) < 0.45;
      if (boostPlatform) {
        const candidateIndex = motifs.findIndex((m) => m.id === "flatRun" || m.id === "chain");
        if (candidateIndex >= 0) {
          motifs[candidateIndex].id = "platformZone";
        }
      }
    }
    const budgetRand = deterministicNoise(seed, lap + 31, previousSummary.hits || 0);
    const budgetTarget = config.terrain.baseDangerBudget + (lap - 1) * config.terrain.dangerBudgetPerLap + (budgetRand * 2 - 1) * config.terrain.dangerBudgetVariance;
    return {
      motifs,
      budget: {
        target: clamp(budgetTarget, 5.5, 26),
        spent: 0,
        reserve: 0.55
      }
    };
  }
  function pushWall(walls, x, h, type, config) {
    walls.push({
      x,
      y: config.world.groundY - h,
      w: config.obstacles.wallWidth,
      h,
      type
    });
  }
  function materializeMotif(plan, trend, seed, lap, config) {
    const rand = mulberry32(seed ^ 2246822507);
    const walls = [];
    const pits = [];
    const platforms = [];
    const lowH = config.obstacles.lowWallHeight;
    const highH = config.obstacles.highWallHeight;
    const budget = plan.budget;
    const simpleLap = lap <= config.terrain.introSimpleLaps;
    function canSpend(cost) {
      return budget.spent + cost <= budget.target + budget.reserve;
    }
    function spend(cost) {
      if (!canSpend(cost)) return false;
      budget.spent += cost;
      return true;
    }
    for (const motif of plan.motifs) {
      let x = motif.startX;
      if (motif.id === "restZone") {
        continue;
      }
      if (motif.id === "flatRun") {
        while (x < motif.endX - config.obstacles.wallWidth - 12) {
          const spacing = randomRange(rand, simpleLap ? 98 : 80, simpleLap ? 162 : 146);
          if (rand() < trend.density * (simpleLap ? 0.16 : 0.34) && spend(0.55)) {
            const high = !simpleLap && rand() < trend.highWallRate * 0.42;
            pushWall(walls, x, high ? highH : lowH, high ? "highWall" : "lowWall", config);
            x += config.obstacles.wallWidth + spacing;
          } else {
            x += spacing;
          }
        }
        continue;
      }
      if (motif.id === "chain") {
        if (simpleLap) continue;
        while (x < motif.endX - config.obstacles.wallWidth * 2) {
          const chainCount = 2 + Math.floor(rand() * 2);
          const chainCost = 0.88 + chainCount * 0.36;
          if (!spend(chainCost)) break;
          for (let i = 0; i < chainCount; i += 1) {
            const useHigh = rand() < trend.highWallRate * 0.52;
            pushWall(walls, x, useHigh ? highH : lowH, useHigh ? "highWall" : "lowWall", config);
            x += config.obstacles.wallWidth + randomRange(rand, 26, 42);
          }
          x += randomRange(rand, 36, 68);
        }
        continue;
      }
      if (motif.id === "pitZone") {
        if (simpleLap) continue;
        const localPitRate = trend.pitRate;
        const localHighRate = trend.highWallRate;
        while (x < motif.endX - 52) {
          const wantPit = rand() < localPitRate * 1.35;
          if (wantPit && spend(1.1)) {
            const pitW = randomRange(rand, config.obstacles.pitMinWidth, config.obstacles.pitMaxWidth);
            pits.push({ x, w: pitW });
            x += pitW + config.obstacles.minGap + randomRange(rand, 24, 62);
            continue;
          }
          if (rand() < trend.density * 0.4 && spend(0.64)) {
            const high = rand() < localHighRate * 0.45;
            pushWall(walls, x, high ? highH : lowH, high ? "highWall" : "lowWall", config);
            x += config.obstacles.wallWidth + randomRange(rand, 44, 92);
            continue;
          }
          x += randomRange(rand, 54, 102);
        }
        continue;
      }
      if (motif.id === "platformZone") {
        if (simpleLap) continue;
        const localPitRate = trend.pitRate * 0.72;
        const localHighRate = trend.highWallRate * 0.86;
        while (x < motif.endX - 46) {
          const makePlatform = rand() < config.terrain.platformChainRate;
          if (makePlatform && spend(config.terrain.platformCost)) {
            const w = randomRange(rand, config.terrain.platformWidthMin, config.terrain.platformWidthMax);
            const hOffset = randomRange(rand, config.terrain.platformHeightBandMin, config.terrain.platformHeightBandMax);
            const y = config.world.groundY - hOffset;
            platforms.push({ x, y, w, h: 10, type: "platform" });
            x += w + randomRange(rand, config.terrain.platformGapMin, config.terrain.platformGapMax);
            continue;
          }
          if (rand() < localPitRate * 0.35 && spend(0.8)) {
            pits.push({ x, w: randomRange(rand, config.obstacles.pitMinWidth, config.obstacles.pitMaxWidth * 0.86) });
            x += config.obstacles.minGap + randomRange(rand, 36, 80);
            continue;
          }
          if (rand() < trend.density * 0.24 && spend(0.58)) {
            const high = rand() < localHighRate * 0.35;
            pushWall(walls, x, high ? highH : lowH, high ? "highWall" : "lowWall", config);
            x += config.obstacles.wallWidth + randomRange(rand, 52, 98);
            continue;
          }
          x += randomRange(rand, 52, 96);
        }
      }
    }
    return { walls, pits, platforms, budget };
  }
  function normalizeTerrainResult(rawTerrain, trend, plan, seed, lap, config) {
    const width = config.canvas.width;
    const height = config.canvas.height;
    const mergedPits = mergeIntervals(rawTerrain.pits, 8).map((pit) => ({
      x: clamp(pit.x, config.obstacles.safeStartZone, width - 40),
      w: clamp(pit.w, config.obstacles.pitMinWidth, config.obstacles.pitMaxWidth + 24)
    }));
    const filteredPits = mergedPits.filter((p) => p.x + p.w < width - 10);
    const filteredWalls = removeWallsOnPits(
      enforceWallGapRule(rawTerrain.walls.filter((w) => w.x + w.w < width - 20), width, config),
      filteredPits
    );
    const terrain = {
      width,
      height,
      walls: filteredWalls,
      pits: filteredPits,
      platforms: (rawTerrain.platforms || []).filter((pf) => pf.x + pf.w < width - 12),
      debug: {
        seed,
        mode: config.terrain.useMotifGenerator ? "motif" : "legacy",
        motifs: plan ? plan.motifs.map((m) => m.id) : ["legacy"],
        danger: plan ? plan.budget : { target: 0, spent: 0, reserve: 0 },
        trend: {
          density: trend.density,
          highWallRate: trend.highWallRate,
          chainRate: trend.chainRate,
          pitRate: trend.pitRate,
          brakePressure: trend.brakePressure || 0
        }
      }
    };
    if (config.debug.logTerrainReason) {
      const wallCount = terrain.walls.length;
      const pitWidth = terrain.pits.reduce((acc, p) => acc + p.w, 0);
      const platformCount = terrain.platforms.length;
      console.groupCollapsed(`terrain lap=${lap} seed=${seed}`);
      console.log("trend", terrain.debug.trend);
      console.log("motifs", terrain.debug.motifs);
      console.log("budget", terrain.debug.danger);
      console.log("counts", { wallCount, pitWidth, platformCount });
      console.groupEnd();
    }
    return terrain;
  }
  function ensureEarlyLapAnchorWall(terrain, lap, seed, config) {
    const noHazard = terrain.walls.length === 0 && terrain.pits.length === 0 && (terrain.platforms || []).length === 0;
    const needAnchor = lap === 1 || noHazard;
    if (!needAnchor) return terrain;
    const wallW = config.obstacles.wallWidth;
    const lowH = config.obstacles.lowWallHeight;
    const minX = config.obstacles.safeStartZone + 28;
    const maxX = Math.max(minX + 20, terrain.width - 140);
    const rand = mulberry32((seed ^ 2738958700 ^ lap * 97) >>> 0);
    let chosenX = minX;
    for (let i = 0; i < 10; i += 1) {
      const candidate = randomRange(rand, minX, maxX);
      const overlapPit = terrain.pits.some((pit) => candidate < pit.x + pit.w - 2 && candidate + wallW > pit.x + 2);
      if (!overlapPit) {
        chosenX = candidate;
        break;
      }
    }
    const anchorWall = {
      x: chosenX,
      y: config.world.groundY - lowH,
      w: wallW,
      h: lowH,
      type: "lowWall"
    };
    const mergedWalls = enforceWallGapRule([...terrain.walls, anchorWall], terrain.width, config);
    terrain.walls = removeWallsOnPits(mergedWalls, terrain.pits);
    if (terrain.debug) {
      terrain.debug.anchorWallAdded = true;
    }
    return terrain;
  }
  function generateLapTerrain(lap, trend, previousSummary, config) {
    const seed = terrainSeedFrom(lap, trend, previousSummary);
    let terrain;
    if (!config.terrain.useMotifGenerator) {
      terrain = generateLapTerrainLegacy(lap, trend, seed, config);
    } else {
      const plan = buildLapPlan(lap, trend, previousSummary, seed, config);
      const rawTerrain = materializeMotif(plan, trend, seed, lap, config);
      terrain = normalizeTerrainResult(rawTerrain, trend, plan, seed, lap, config);
    }
    if (!terrain.platforms) terrain.platforms = [];
    return ensureEarlyLapAnchorWall(terrain, lap, seed, config);
  }
  function computeBaseSpeed(lap, config) {
    const boost = Math.floor((lap - 1) / 5) * config.player.speedStepPerFiveLaps;
    return config.player.baseSpeed + boost;
  }
  function summarizeLap(stats, lap, baseSpeed) {
    const jumpSafe = Math.max(1, stats.jumps);
    const lapTimeSec = Math.max(1e-3, stats.lapTimeSec || 0);
    const baseTravel = Math.max(1, lapTimeSec * baseSpeed);
    const measuredEfficiency = clamp((stats.forwardDistancePx || 0) / baseTravel, 0, 1.3);
    const progressEfficiency = clamp(stats.progressEfficiency || measuredEfficiency, 0, 1.3);
    return {
      jumps: stats.jumps,
      bigJumpRatio: stats.bigJumps / jumpSafe,
      brakes: stats.brakes,
      stallTimeSec: stats.stallTimeSec || 0,
      lapTimeSec,
      forwardDistancePx: stats.forwardDistancePx || 0,
      progressEfficiency,
      pitFalls: stats.pitFalls,
      hits: stats.hits,
      lap
    };
  }
  function evolveTrend(currentTrend, lapSummary, lap, config) {
    const jumpPressure = clamp(lapSummary.jumps / 10, 0, 1);
    const pitPressure = clamp(lapSummary.pitFalls / 3, 0, 1);
    const hitPressure = clamp(lapSummary.hits / 3, 0, 1);
    let brakePressure = clamp(lapSummary.brakes / 6, 0, 1);
    if (config.terrain.useBrakeV2) {
      const stallNorm = clamp((lapSummary.stallTimeSec || 0) / 1.8, 0, 1);
      const effPenalty = clamp((0.92 - (lapSummary.progressEfficiency || 1)) / 0.32, 0, 1);
      brakePressure = 0.75 * stallNorm + 0.25 * effPenalty;
    }
    const baseHighWall = config.difficulty.startHighWallRate + lapSummary.bigJumpRatio * 0.24 + lap * 3e-3;
    const baseChain = config.difficulty.startChainRate + lap * 3e-3;
    const basePit = config.difficulty.startPitRate + pitPressure * 0.24 + lap * 3e-3;
    return {
      density: clamp(
        config.difficulty.startDensity + lap * 0.01 + jumpPressure * 0.08 + hitPressure * 0.03,
        config.difficulty.startDensity,
        config.difficulty.maxDensity
      ),
      highWallRate: clamp(baseHighWall - brakePressure * 0.04, 0.12, 0.62),
      chainRate: clamp(baseChain + brakePressure * 0.1, 0.08, 0.55),
      pitRate: clamp(basePit - brakePressure * 0.06, 0.1, 0.42),
      brakePressure: clamp(brakePressure, 0, 1)
    };
  }
  function enemyCapForLap(lap, config) {
    return clamp(
      config.difficulty.enemyBaseCap + Math.floor((lap - 1) / 2),
      config.difficulty.enemyBaseCap,
      config.difficulty.enemyMaxCap
    );
  }

  // src/systems/update-running.js
  function isPitAtX(x, terrain) {
    for (const pit of terrain.pits) {
      if (x >= pit.x && x <= pit.x + pit.w) return true;
    }
    return false;
  }
  function hasGroundSupport(player, terrain) {
    const leftFoot = player.x + 4;
    const rightFoot = player.x + player.w - 4;
    return !isPitAtX(leftFoot, terrain) && !isPitAtX(rightFoot, terrain);
  }
  function resolveVertical(previousY, ctx) {
    const { player, state, config } = ctx;
    player.onGround = false;
    if (player.vy >= 0) {
      const hasGround = hasGroundSupport(player, state.terrain);
      if (hasGround && player.y + player.h >= config.world.groundY) {
        player.y = config.world.groundY - player.h;
        player.vy = 0;
        player.onGround = true;
      }
      for (const platform of state.terrain.platforms || []) {
        const prevBottom = previousY + player.h;
        const nowBottom = player.y + player.h;
        const overlapsX = player.x + player.w - 2 > platform.x && player.x + 2 < platform.x + platform.w;
        if (!overlapsX) continue;
        if (prevBottom <= platform.y + 4 && nowBottom >= platform.y) {
          player.y = platform.y - player.h;
          player.vy = 0;
          player.onGround = true;
        }
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
  function resolveHorizontal(previousX, ctx) {
    const { player, state } = ctx;
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
  function spawnEnemyFromSchedule(item, ctx) {
    const { state, config } = ctx;
    const lapBoost = (state.lap - 1) * config.enemies.speedGrowthPerLap;
    const speed = config.enemies.speedByKind[item.kind] + lapBoost;
    const laneY = laneCenterY(item.laneIndex ?? 2, config);
    const jitter = (deterministicNoise(item.trigger * 1777, speed, state.lap) - 0.5) * 58;
    let baseY = laneY + jitter;
    if (item.kind === "sineHigh") baseY -= 30;
    if (item.kind === "hover") baseY += 18;
    if (item.kind === "runner") baseY = config.world.groundY - 15 + jitter * 0.12;
    baseY = clamp(baseY, 58, config.world.groundY - 14);
    state.enemies.push({
      id: item.id,
      type: item.type,
      kind: item.kind,
      x: config.canvas.width + config.enemies.spawnAheadX,
      y: baseY,
      baseY,
      speed,
      phase: deterministicNoise(item.trigger * 1400, speed, state.lap) * Math.PI * 2,
      age: 0,
      hit: false
    });
  }
  function enemyActiveCap(state, config) {
    return clamp(
      config.enemies.baseActiveCap + Math.floor((state.lap - 1) / config.enemies.capGrowthEveryLap),
      config.enemies.baseActiveCap,
      config.difficulty.enemyMaxCap
    );
  }
  function takeDamage(now, ctx) {
    const { player, state, config, audio, emitBurst, onGameOver } = ctx;
    if (state.mode !== "running") return;
    if (now < player.invincibleUntilMs) return;
    player.invincibleUntilMs = now + config.player.invincibleMs;
    player.takingKnockbackUntilMs = now + 180;
    player.vx = -config.player.knockbackSpeed;
    state.life -= 1;
    audio.setBgmLifeTier(state.life);
    audio.playHitSfx();
    state.lapStats.hits += 1;
    emitBurst(player.x + player.w * 0.5, player.y + player.h * 0.4, 14, "#ff6c83");
    if (state.life <= 0) {
      onGameOver(now);
    }
  }
  function updateEnemies(dt, now, ctx) {
    const { state, player, config } = ctx;
    let spawnedThisFrame = 0;
    const activeCap = enemyActiveCap(state, config);
    for (const item of state.mirrorSchedule) {
      if (spawnedThisFrame >= config.enemies.maxSpawnPerFrame) break;
      if (state.enemies.length >= activeCap) break;
      if (!item.spawned && state.lapProgress >= item.trigger) {
        item.spawned = true;
        spawnEnemyFromSchedule(item, ctx);
        spawnedThisFrame += 1;
      }
    }
    const remaining = [];
    const rightEdgeUnsafe = player.x >= config.canvas.width - config.enemies.rightEdgeNoHitWidth;
    const leftEdgeUnsafe = player.x <= config.enemies.leftEdgeNoHitWidth;
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
        const hit = circleRectHit(enemy.x, enemy.y, config.enemies.radius, player);
        if (hit && !enemy.hit) {
          enemy.hit = true;
          takeDamage(now, ctx);
        }
      }
      if (enemy.x < config.enemies.despawnX) {
        if (!enemy.hit) {
          state.dodgedEnemies += 1;
        }
        continue;
      }
      remaining.push(enemy);
    }
    state.enemies = remaining;
  }
  function updateParticles(dt, state) {
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
  function updateRunning(dt, now, ctx) {
    const { state, player, config, storage, onLapComplete, emitBurst } = ctx;
    const baseSpeed = computeBaseSpeed(state.lap, config);
    const inKnockback = now < player.takingKnockbackUntilMs;
    if (inKnockback) {
      player.vx = -config.player.knockbackSpeed;
    } else {
      player.vx = baseSpeed;
    }
    const xBefore = player.x;
    player.vy += config.world.gravity * dt;
    player.vy = Math.min(player.vy, config.world.maxFallSpeed);
    const prevY = player.y;
    player.y += player.vy * dt;
    resolveVertical(prevY, ctx);
    const prevX = player.x;
    player.x += player.vx * dt;
    resolveHorizontal(prevX, ctx);
    let forwardMove = player.x - xBefore;
    if (forwardMove < -config.canvas.width * 0.5) {
      forwardMove += config.canvas.width;
    }
    if (forwardMove > config.canvas.width * 0.5) {
      forwardMove -= config.canvas.width;
    }
    state.lapStats.lapTimeSec += dt;
    if (forwardMove > 0) {
      state.lapStats.forwardDistancePx += forwardMove;
    }
    const expectedTravel = Math.max(1, state.lapStats.lapTimeSec * baseSpeed);
    state.lapStats.progressEfficiency = clamp(state.lapStats.forwardDistancePx / expectedTravel, 0, 1.3);
    if (!inKnockback && player.onGround) {
      const expectedStep = baseSpeed * dt;
      if (forwardMove < expectedStep * 0.35) {
        state.lapStats.stallTimeSec += dt;
      }
    }
    state.lapStats.brakes = Math.round(state.lapStats.stallTimeSec * 4);
    if (player.x >= config.canvas.width) {
      player.x -= config.canvas.width;
      onLapComplete();
      player.leftEdgeSafeUntilMs = now + config.enemies.leftEdgeSafeMs;
    }
    if (player.x < 0) {
      player.x += config.canvas.width;
    }
    if (player.y > config.canvas.height + player.h) {
      player.y = -player.h;
      player.vy = 0;
      state.lapStats.pitFalls += 1;
      emitBurst(player.x + player.w * 0.4, config.canvas.height - 6, 8, "#8ce2ff");
    }
    if (player.y + player.h < 0) {
      player.y = config.canvas.height;
      player.vy = 0;
    }
    if (forwardMove > 0.5) {
      state.survivalTime += dt;
    }
    state.lapProgress = clamp(player.x / config.canvas.width, 0, 1);
    updateEnemies(dt, now, ctx);
    updateParticles(dt, state);
    const score = Math.floor(state.survivalTime * config.scoring.survivalPerSecond) + (state.lap - 1) * config.scoring.lapBonus + state.dodgedEnemies * config.scoring.dodgeBonus;
    state.score = score;
    if (score > state.bestScore) {
      state.bestScore = score;
      storage.setItem(STORAGE_KEYS.best, String(state.bestScore));
    }
  }

  // src/bootstrap.js
  function bootGame() {
    function requireEl(id) {
      const el = document.getElementById(id);
      if (!el) throw new Error(`Missing required element: #${id}`);
      return el;
    }
    const canvas = requireEl("gameCanvas");
    const ctx = canvas.getContext("2d");
    const overlayEl = requireEl("overlay");
    const overlayMessageEl = requireEl("overlayMessage");
    const overlayActionsEl = requireEl("overlayActions");
    const overlayPrimaryButtonEl = requireEl("overlayPrimaryButton");
    const overlaySettingsButtonEl = requireEl("overlaySettingsButton");
    const settingsPanelEl = requireEl("settingsPanel");
    const bgmVolumeSelectEl = requireEl("bgmVolumeSelect");
    const sfxVolumeSelectEl = requireEl("sfxVolumeSelect");
    const bgmTypeSelectEl = requireEl("bgmTypeSelect");
    const pauseButtonEl = requireEl("pauseButton");
    const hud = {
      life: requireEl("lifeValue"),
      lap: requireEl("lapValue"),
      score: requireEl("scoreValue"),
      best: requireEl("bestValue")
    };
    const state = createInitialState(CONFIG, localStorage);
    const player = createPlayer(CONFIG);
    const uiState = { settingsOpen: false };
    let gameOverLockUntilMs = 0;
    let awaitRestartRelease = false;
    let gameOverPhase = "banner";
    const audio = createAudioEngine({
      storage: localStorage,
      getMode: () => state.mode
    });
    function syncTerrainDebug() {
      state.terrainDebug = state.terrain?.debug || null;
    }
    function refreshTerrain(previousSummary) {
      state.terrain = generateLapTerrain(state.lap, state.trend, previousSummary, CONFIG);
      syncTerrainDebug();
    }
    function updateAudioToggleUi() {
      const settings = audio.getSettings();
      bgmVolumeSelectEl.value = String(settings.bgmVolumeLevel);
      sfxVolumeSelectEl.value = String(settings.sfxVolumeLevel);
      bgmTypeSelectEl.value = String(settings.bgmVariant);
    }
    function setSettingsPanelOpen(open) {
      uiState.settingsOpen = open;
      settingsPanelEl.classList.toggle("hidden", !open);
      overlayEl.classList.toggle("settings-open", open);
    }
    function setOverlay(text, primaryLabel, showActions = true) {
      overlayMessageEl.textContent = text;
      overlayPrimaryButtonEl.textContent = primaryLabel;
      overlayActionsEl.hidden = !showActions;
      setSettingsPanelOpen(false);
      overlayEl.classList.remove("hidden");
    }
    function hideOverlay() {
      setSettingsPanelOpen(false);
      overlayEl.classList.add("hidden");
    }
    function updatePauseButton() {
      pauseButtonEl.textContent = state.mode === "paused" ? "\u518D\u958B" : "\u4E00\u6642\u505C\u6B62";
      pauseButtonEl.disabled = state.mode === "title" || state.mode === "gameover";
    }
    function showTitleOverlay() {
      setOverlay("SPACE / TAP \u3067\u958B\u59CB", "\u958B\u59CB");
    }
    function showPauseOverlay() {
      setOverlay("PAUSED", "\u518D\u958B");
    }
    function showGameOverBanner() {
      setOverlay("GAME OVER!", "\u6B21\u3078", false);
    }
    function showGameOverScoreOverlay() {
      setOverlay(`SCORE ${state.score} / BEST ${state.bestScore}`, "\u3082\u3046\u4E00\u5EA6", true);
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
          color
        });
      }
    }
    function recordInputEvent(type, holdMs = 0) {
      const progress = clamp(player.x / CONFIG.canvas.width, 0, 1);
      state.currentLapLog.push({ progress, type, holdMs });
    }
    function promoteHeldJump(holdMs) {
      if (player.vy >= 0) return false;
      player.vy = Math.min(player.vy, CONFIG.player.bigJumpVelocity);
      state.lapStats.bigJumps += 1;
      recordInputEvent("bigJump", holdMs);
      audio.playBigJumpLayerSfx();
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
      audio.playJumpSfx();
      emitBurst(player.x + player.w * 0.4, player.y + player.h, 7, "#91c8ff");
      return true;
    }
    function endPress() {
      if (state.mode === "gameover") {
        awaitRestartRelease = false;
      }
      if (!state.input.active) return;
      state.input.active = false;
      state.input.canPromote = false;
      state.input.promoted = false;
    }
    function pauseGame() {
      if (state.mode !== "running") return;
      state.mode = "paused";
      endPress();
      audio.stopBgm();
      showPauseOverlay();
      updatePauseButton();
    }
    function resumeGame() {
      if (state.mode !== "paused") return;
      state.mode = "running";
      audio.startBgm();
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
    function resetRun() {
      state.life = 3;
      audio.setBgmLifeTier(state.life);
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
      state.trend = createTrend(CONFIG);
      state.lapStats = createLapStats();
      state.input.active = false;
      state.input.canPromote = false;
      state.input.promoted = false;
      gameOverLockUntilMs = 0;
      awaitRestartRelease = false;
      gameOverPhase = "banner";
      resetPlayer(player, CONFIG);
      refreshTerrain(state.lapStats);
    }
    function startGame() {
      audio.refreshBgmVariantForRun();
      audio.ensureReady();
      resetRun();
      state.mode = "running";
      audio.startBgm();
      hideOverlay();
      updatePauseButton();
    }
    function endGame(now = performance.now()) {
      if (state.mode === "gameover") return;
      state.mode = "gameover";
      gameOverLockUntilMs = now + 600;
      awaitRestartRelease = true;
      gameOverPhase = "banner";
      audio.stopBgm();
      audio.playGameOverSfx();
      if (state.score > state.bestScore) {
        state.bestScore = state.score;
        localStorage.setItem(STORAGE_KEYS.best, String(state.bestScore));
      }
      showGameOverBanner();
      updatePauseButton();
    }
    function nextLap() {
      const lapSummary = summarizeLap(state.lapStats, state.lap, computeBaseSpeed(state.lap, CONFIG));
      state.trend = evolveTrend(state.trend, lapSummary, state.lap, CONFIG);
      state.prevLapLogCompressed = compressInputLog(state.currentLapLog, enemyCapForLap(state.lap + 1, CONFIG), CONFIG);
      state.currentLapLog = [];
      state.lap += 1;
      state.lapProgress = 0;
      state.lapStats = createLapStats();
      refreshTerrain(lapSummary);
      state.mirrorSchedule = buildMirrorSchedule(state.prevLapLogCompressed, CONFIG, state.lap);
    }
    function startPress(now) {
      audio.ensureReady();
      if (state.mode === "title") {
        startGame();
        return;
      }
      if (state.mode === "gameover") {
        if (now < gameOverLockUntilMs || awaitRestartRelease) return;
        if (gameOverPhase === "banner") {
          gameOverPhase = "score";
          awaitRestartRelease = true;
          showGameOverScoreOverlay();
          return;
        }
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
    function runPrimaryOverlayAction() {
      const now = performance.now();
      setSettingsPanelOpen(false);
      if (state.mode === "title") {
        startGame();
        return;
      }
      if (state.mode === "gameover") {
        if (now < gameOverLockUntilMs || awaitRestartRelease) return;
        if (gameOverPhase === "banner") {
          gameOverPhase = "score";
          showGameOverScoreOverlay();
          return;
        }
        startGame();
        return;
      }
      if (state.mode === "paused") {
        resumeGame();
      }
    }
    function loop(now) {
      const dt = clamp((now - state.clockMs) / 1e3, 0, 0.033);
      state.clockMs = now;
      if (state.mode === "running") {
        if (state.input.active && state.input.canPromote && !state.input.promoted) {
          const holdMs = now - state.input.startedAt;
          if (holdMs >= CONFIG.input.bigPressMs) {
            state.input.promoted = promoteHeldJump(holdMs);
          }
        }
        updateRunning(dt, now, {
          state,
          player,
          config: CONFIG,
          audio,
          storage: localStorage,
          emitBurst,
          onLapComplete: nextLap,
          onGameOver: endGame
        });
      }
      render(now, { ctx, state, player, config: CONFIG });
      updateHud({ hud, state });
      requestAnimationFrame(loop);
    }
    registerInputHandlers({
      config: CONFIG,
      canvas,
      pauseButtonEl,
      overlayPrimaryButtonEl,
      overlaySettingsButtonEl,
      bgmVolumeSelectEl,
      sfxVolumeSelectEl,
      bgmTypeSelectEl,
      getMode: () => state.mode,
      togglePause,
      resumeGame,
      startPress,
      endPress,
      runPrimaryOverlayAction,
      onToggleSettings: () => {
        audio.ensureReady();
        setSettingsPanelOpen(!uiState.settingsOpen);
      },
      onBgmVolumeChange: (value) => {
        audio.setBgmVolumeLevel(audio.clampLevel(value));
        updateAudioToggleUi();
      },
      onSfxVolumeChange: (value) => {
        audio.setSfxVolumeLevel(audio.clampLevel(value));
        updateAudioToggleUi();
      },
      onBgmTypeChange: (value) => {
        audio.setBgmVariant(audio.normalizeBgmVariantSetting(value));
        updateAudioToggleUi();
      }
    });
    updateAudioToggleUi();
    setSettingsPanelOpen(false);
    showTitleOverlay();
    updatePauseButton();
    refreshTerrain(state.lapStats);
    hud.best.textContent = String(state.bestScore);
    requestAnimationFrame((t) => {
      state.clockMs = t;
      loop(t);
    });
  }

  // src/main-entry.js
  bootGame();
})();
