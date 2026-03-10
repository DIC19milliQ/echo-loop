import { createAudioEngine } from "./audio.js";
import { CONFIG, STORAGE_KEYS } from "./core/config.js";
import { createInitialState, createLapStats, createPlayer, createTrend, resetPlayer } from "./core/state.js";
import { clamp } from "./core/utils.js";
import { registerInputHandlers } from "./input.js";
import { render, updateHud } from "./renderer.js";
import { buildMirrorSchedule, compressInputLog } from "./systems/mirror.js";
import { enemyCapForLap, evolveTrend, generateLapTerrain, summarizeLap, computeBaseSpeed } from "./systems/terrain.js";
import { updateRunning } from "./systems/update-running.js";

export function bootGame() {
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
    best: requireEl("bestValue"),
  };

  const state = createInitialState(CONFIG, localStorage);
  const player = createPlayer(CONFIG);
  const uiState = { settingsOpen: false };

  const audio = createAudioEngine({
    storage: localStorage,
    getMode: () => state.mode,
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

  function endGame() {
    state.mode = "gameover";
    audio.stopBgm();
    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      localStorage.setItem(STORAGE_KEYS.best, String(state.bestScore));
    }
    showGameOverOverlay();
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

  function loop(now) {
    const dt = clamp((now - state.clockMs) / 1000, 0, 0.033);
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
        onGameOver: endGame,
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
    },
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
