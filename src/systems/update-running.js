import { STORAGE_KEYS } from "../core/config.js";
import { clamp, circleRectHit, deterministicNoise, overlaps } from "../core/utils.js";
import { laneCenterY } from "../systems/mirror.js";
import { computeBaseSpeed } from "../systems/terrain.js";

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
    hit: false,
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

export function updateRunning(dt, now, ctx) {
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

  const score =
    Math.floor(state.survivalTime * config.scoring.survivalPerSecond) +
    (state.lap - 1) * config.scoring.lapBonus +
    state.dodgedEnemies * config.scoring.dodgeBonus;

  state.score = score;
  if (score > state.bestScore) {
    state.bestScore = score;
    storage.setItem(STORAGE_KEYS.best, String(state.bestScore));
  }
}
