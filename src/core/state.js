export function createTrend(config) {
  return {
    density: config.difficulty.startDensity,
    highWallRate: config.difficulty.startHighWallRate,
    chainRate: config.difficulty.startChainRate,
    pitRate: config.difficulty.startPitRate,
    brakePressure: 0,
  };
}

export function createLapStats() {
  return {
    jumps: 0,
    bigJumps: 0,
    brakes: 0,
    stallTimeSec: 0,
    lapTimeSec: 0,
    forwardDistancePx: 0,
    progressEfficiency: 1,
    pitFalls: 0,
    hits: 0,
  };
}

export function createInitialState(config, storage) {
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
      promoted: false,
    },
    clockMs: performance.now(),
  };
}

export function createPlayer(config) {
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
    leftEdgeSafeUntilMs: 0,
  };
}

export function resetPlayer(player, config) {
  player.x = config.player.startX;
  player.y = config.player.startY;
  player.vx = config.player.baseSpeed;
  player.vy = 0;
  player.onGround = true;
  player.invincibleUntilMs = 0;
  player.takingKnockbackUntilMs = 0;
  player.leftEdgeSafeUntilMs = 0;
}
