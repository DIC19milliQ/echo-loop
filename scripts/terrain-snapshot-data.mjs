import { CONFIG } from "../src/core/config.js";
import { generateLapTerrain } from "../src/systems/terrain.js";

const cases = [
  {
    name: "lap1-default",
    lap: 1,
    trend: {
      density: CONFIG.difficulty.startDensity,
      highWallRate: CONFIG.difficulty.startHighWallRate,
      chainRate: CONFIG.difficulty.startChainRate,
      pitRate: CONFIG.difficulty.startPitRate,
      brakePressure: 0,
    },
    previousSummary: {
      jumps: 0,
      pitFalls: 0,
      hits: 0,
    },
  },
  {
    name: "lap3-mid",
    lap: 3,
    trend: {
      density: 0.36,
      highWallRate: 0.29,
      chainRate: 0.18,
      pitRate: 0.24,
      brakePressure: 0.2,
    },
    previousSummary: {
      jumps: 8,
      pitFalls: 1,
      hits: 1,
    },
  },
  {
    name: "lap8-high-pressure",
    lap: 8,
    trend: {
      density: 0.56,
      highWallRate: 0.43,
      chainRate: 0.28,
      pitRate: 0.31,
      brakePressure: 0.6,
    },
    previousSummary: {
      jumps: 14,
      pitFalls: 2,
      hits: 2,
    },
  },
];

export function createTerrainSnapshots() {
  const snapshots = cases.map((c) => {
    const terrain = generateLapTerrain(c.lap, c.trend, c.previousSummary, CONFIG);
    return {
      name: c.name,
      seed: terrain.debug.seed,
      mode: terrain.debug.mode,
      motifs: terrain.debug.motifs,
      counts: {
        walls: terrain.walls.length,
        pits: terrain.pits.length,
        platforms: terrain.platforms.length,
      },
      wallSample: terrain.walls.slice(0, 3).map((w) => ({ x: Number(w.x.toFixed(2)), h: w.h, type: w.type })),
      pitSample: terrain.pits.slice(0, 3).map((p) => ({ x: Number(p.x.toFixed(2)), w: Number(p.w.toFixed(2)) })),
      platformSample: terrain.platforms.slice(0, 3).map((p) => ({
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2)),
        w: Number(p.w.toFixed(2)),
      })),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    snapshots,
  };
}
