export function registerInputHandlers(deps) {
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
    onBgmTypeChange,
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
