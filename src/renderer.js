import { clamp, hexToRgb } from "./core/utils.js";

function drawBackground(ctx, state, config) {
  const grd = ctx.createLinearGradient(0, 0, 0, config.canvas.height);
  grd.addColorStop(0, "#101b2f");
  grd.addColorStop(1, "#0a1220");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, config.canvas.width, config.canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.045)";
  for (let i = 0; i < 40; i += 1) {
    const x = (i * 73 + state.lap * 21) % config.canvas.width;
    const y = (i * 37) % (config.canvas.height - 130);
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
    "1": "#ff4f6d",
  };
  const invincibleColors = {
    "3": "#98f4ff",
    "2": "#aebfff",
    "1": "#ff9fae",
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
    `motifs ${motifText}`,
  ];

  ctx.fillStyle = "#d6e7ff";
  ctx.font = "12px monospace";
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i], panelX + 10, panelY + 22 + i * 22);
  }
}

export function render(now, view) {
  const { ctx, state, player, config } = view;
  drawBackground(ctx, state, config);
  drawTerrain(ctx, state, config);
  drawEnemies(ctx, state, config);
  drawPlayer(now, ctx, state, player);
  drawParticles(ctx, state);
  drawProgressHint(ctx, state, config);
  drawTerrainDebugOverlay(ctx, state, config);
}

export function updateHud(view) {
  const { hud, state } = view;
  hud.life.textContent = String(state.life);
  hud.lap.textContent = String(state.lap);
  hud.score.textContent = String(state.score);
  hud.best.textContent = String(state.bestScore);
}
