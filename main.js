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
const hud = {
  life: document.getElementById("lifeValue"),
  lap: document.getElementById("lapValue"),
  score: document.getElementById("scoreValue"),
  best: document.getElementById("bestValue"),
};

const STORAGE_BEST = CONFIG.storage.bestScoreKey;
const TYPE_PRIORITY = { smallJump: 1, bigJump: 2, brake: 3 };

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

function setOverlay(text) {
  overlayMessageEl.textContent = text;
  overlayEl.classList.remove("hidden");
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
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
  resetRun();
  state.mode = "running";
  hideOverlay();
}

function endGame() {
  state.mode = "gameover";
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem(STORAGE_BEST, String(state.bestScore));
  }
  setOverlay(`GAME OVER  SCORE ${state.score} / BEST ${state.bestScore}  (SPACE/TAP で再開)`);
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
  if (state.mode === "title" || state.mode === "gameover") {
    startGame();
    return;
  }

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
  const blink = invincible && Math.floor(now / 80) % 2 === 0;

  if (blink) return;

  ctx.fillStyle = "#9bffcf";
  if (now < player.invincibleUntilMs) ctx.fillStyle = "#b58cff";

  ctx.fillRect(player.x, player.y, player.w, player.h);
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
  if (e.code !== "Space") return;
  e.preventDefault();
  startPress(performance.now());
}

function onKeyUp(e) {
  if (e.code !== "Space") return;
  e.preventDefault();
  endPress();
}

function onPointerDown(e) {
  e.preventDefault();
  startPress(performance.now());
}

function onPointerUp(e) {
  e.preventDefault();
  endPress();
}

window.addEventListener("keydown", onKeyDown, { passive: false });
window.addEventListener("keyup", onKeyUp, { passive: false });
canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
window.addEventListener("pointerup", onPointerUp, { passive: false });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

setOverlay("SPACE / TAP で開始");
state.terrain = generateLapTerrain(state.lap, state.trend, state.lapStats);
hud.best.textContent = String(state.bestScore);
requestAnimationFrame((t) => {
  state.clockMs = t;
  loop(t);
});









