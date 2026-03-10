# Regression Checklist (Manual)

## Overlay / UI
- [ ] Initial load shows title overlay and disabled pause button.
- [ ] Opening settings panel from overlay works and closes correctly.
- [ ] BGM/SFX volume and BGM type selectors reflect stored values on load.

## Input
- [ ] `Space` starts from title and restarts from game over.
- [ ] Tap/click starts and triggers jump.
- [ ] Hold input for >= 260ms promotes to big jump.
- [ ] `Escape` toggles pause/resume while running.

## Gameplay
- [ ] Lap increments when player wraps right edge.
- [ ] Mirror enemies spawn based on previous lap input.
- [ ] Enemy hit reduces life and applies temporary invincibility.
- [ ] Life 0 transitions to game over overlay.
- [ ] Falling into pits wraps player without life loss.

## Scoring / Persistence
- [ ] Score increases during forward movement.
- [ ] Best score updates and is persisted.
- [ ] Audio settings are persisted and restored.

## Visual / Audio parity
- [ ] Jump height (small/big) feels unchanged.
- [ ] Knockback and pause freeze behavior are unchanged.
- [ ] BGM starts/stops correctly on run/pause/game-over.
