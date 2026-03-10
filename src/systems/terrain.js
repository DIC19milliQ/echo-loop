import { clamp, deterministicNoise, mulberry32, randomRange } from "../core/utils.js";

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

export function terrainSeedFrom(lap, trend, previousSummary) {
  return (
    lap * 9973 +
    Math.floor(trend.density * 1000) * 37 +
    Math.floor((previousSummary.jumps || 0) * 13) +
    Math.floor((previousSummary.pitFalls || 0) * 29)
  ) >>> 0;
}

function highWallRollRate(baseRate, localScale, config) {
  const scale = config.terrain.highWallSpawnScale || 1;
  return clamp(baseRate * localScale * scale, 0, 0.95);
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
        const useHigh = !simpleLap && rand() < highWallRollRate(trend.highWallRate, 0.5, config);
        walls.push({
          x: chainX,
          y: config.world.groundY - (useHigh ? highH : lowH),
          w: wallW,
          h: useHigh ? highH : lowH,
          type: useHigh ? "highWall" : "lowWall",
        });
        chainX += wallW + randomRange(rand, 28, 44);
      }
      cursor = chainX + config.obstacles.minGap;
      continue;
    }

    const high = !simpleLap && rand() < highWallRollRate(trend.highWallRate, 1, config);
    walls.push({
      x: cursor,
      y: config.world.groundY - (high ? highH : lowH),
      w: wallW,
      h: high ? highH : lowH,
      type: high ? "highWall" : "lowWall",
    });
    cursor += wallW + spacing;
  }

  const mergedPits = mergeIntervals(pits, 8).map((pit) => ({
    x: clamp(pit.x, config.obstacles.safeStartZone, width - 40),
    w: clamp(pit.w, config.obstacles.pitMinWidth, config.obstacles.pitMaxWidth + 24),
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
      trend,
    },
  };
}

function buildMotifCatalog(trend, lap, config) {
  const mw = config.terrain.motifWeights;
  return {
    flatRun: {
      id: "flatRun",
      weight: mw.flatRun * clamp(1.16 - trend.density * 0.54, 0.55, 1.35),
      minLen: 120,
      maxLen: 220,
    },
    chain: {
      id: "chain",
      weight: mw.chain * clamp(0.52 + trend.chainRate * 2.1, 0.4, 1.55),
      minLen: 120,
      maxLen: 230,
    },
    pitZone: {
      id: "pitZone",
      weight: mw.pitZone * clamp(0.48 + trend.pitRate * 2.2, 0.35, 1.6) * (lap <= config.terrain.introSimpleLaps ? 0 : 1),
      minLen: 120,
      maxLen: 220,
    },
    restZone: {
      id: "restZone",
      weight: mw.restZone * clamp(1.25 - trend.density * 0.62, 0.65, 1.6),
      minLen: 90,
      maxLen: 180,
    },
    platformZone: {
      id: "platformZone",
      weight:
        mw.platformZone *
        (config.terrain.enablePlatforms && lap > config.terrain.introSimpleLaps ? 1 : 0) *
        clamp(config.terrain.platformRate * (0.8 + trend.highWallRate * 0.9), 0, 1.1),
      minLen: 140,
      maxLen: 240,
    },
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
  const rand = mulberry32(seed ^ 0x9e3779b9);
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
        { id: "restZone", startX: simpleMid, endX: laneEnd },
      ],
      budget: {
        target: 4.8,
        spent: 0,
        reserve: 0.35,
      },
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
  const budgetTarget =
    config.terrain.baseDangerBudget +
    (lap - 1) * config.terrain.dangerBudgetPerLap +
    (budgetRand * 2 - 1) * config.terrain.dangerBudgetVariance;

  return {
    motifs,
    budget: {
      target: clamp(budgetTarget, 5.5, 26),
      spent: 0,
      reserve: 0.55,
    },
  };
}

function pushWall(walls, x, h, type, config) {
  walls.push({
    x,
    y: config.world.groundY - h,
    w: config.obstacles.wallWidth,
    h,
    type,
  });
}

function materializeMotif(plan, trend, seed, lap, config) {
  const rand = mulberry32(seed ^ 0x85ebca6b);
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
          const high = !simpleLap && rand() < highWallRollRate(trend.highWallRate, 0.42, config);
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
          const useHigh = rand() < highWallRollRate(trend.highWallRate, 0.52, config);
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
          const high = rand() < highWallRollRate(localHighRate, 0.45, config);
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
          const high = rand() < highWallRollRate(localHighRate, 0.35, config);
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
    w: clamp(pit.w, config.obstacles.pitMinWidth, config.obstacles.pitMaxWidth + 24),
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
        brakePressure: trend.brakePressure || 0,
      },
    },
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
  const rand = mulberry32((seed ^ 0xa341316c ^ (lap * 97)) >>> 0);

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
    type: "lowWall",
  };

  const mergedWalls = enforceWallGapRule([...terrain.walls, anchorWall], terrain.width, config);
  terrain.walls = removeWallsOnPits(mergedWalls, terrain.pits);
  if (terrain.debug) {
    terrain.debug.anchorWallAdded = true;
  }

  return terrain;
}

export function generateLapTerrain(lap, trend, previousSummary, config) {
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

export function computeBaseSpeed(lap, config) {
  const boost = Math.floor((lap - 1) / 5) * config.player.speedStepPerFiveLaps;
  return config.player.baseSpeed + boost;
}

export function summarizeLap(stats, lap, baseSpeed) {
  const jumpSafe = Math.max(1, stats.jumps);
  const lapTimeSec = Math.max(0.001, stats.lapTimeSec || 0);
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
    lap,
  };
}

export function evolveTrend(currentTrend, lapSummary, lap, config) {
  const jumpPressure = clamp(lapSummary.jumps / 10, 0, 1);
  const pitPressure = clamp(lapSummary.pitFalls / 3, 0, 1);
  const hitPressure = clamp(lapSummary.hits / 3, 0, 1);

  let brakePressure = clamp(lapSummary.brakes / 6, 0, 1);
  if (config.terrain.useBrakeV2) {
    const stallNorm = clamp((lapSummary.stallTimeSec || 0) / 1.8, 0, 1);
    const effPenalty = clamp((0.92 - (lapSummary.progressEfficiency || 1)) / 0.32, 0, 1);
    brakePressure = 0.75 * stallNorm + 0.25 * effPenalty;
  }

  const baseHighWall = config.difficulty.startHighWallRate + lapSummary.bigJumpRatio * 0.24 + lap * 0.003;
  const baseChain = config.difficulty.startChainRate + lap * 0.003;
  const basePit = config.difficulty.startPitRate + pitPressure * 0.24 + lap * 0.003;

  return {
    density: clamp(
      config.difficulty.startDensity + lap * 0.01 + jumpPressure * 0.08 + hitPressure * 0.03,
      config.difficulty.startDensity,
      config.difficulty.maxDensity
    ),
    highWallRate: clamp(baseHighWall - brakePressure * 0.04, 0.12, 0.62),
    chainRate: clamp(baseChain + brakePressure * 0.1, 0.08, 0.55),
    pitRate: clamp(basePit - brakePressure * 0.06, 0.1, 0.42),
    brakePressure: clamp(brakePressure, 0, 1),
  };
}

export function enemyCapForLap(lap, config) {
  return clamp(
    config.difficulty.enemyBaseCap + Math.floor((lap - 1) / 2),
    config.difficulty.enemyBaseCap,
    config.difficulty.enemyMaxCap
  );
}


