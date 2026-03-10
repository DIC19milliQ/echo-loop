import { TYPE_PRIORITY } from "../core/config.js";
import { clamp, deterministicNoise } from "../core/utils.js";

export function compressInputLog(log, cap, config) {
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
  const noise = deterministicNoise(evt.progress * 1000, index + 1, lap + 17);

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

export function buildMirrorSchedule(compressedLog, config, lap) {
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
      id: `${lap}-${index}-${evt.type}`,
    });
  }

  return schedule.sort((a, b) => a.trigger - b.trigger);
}

export function laneCenterY(laneIndex, config) {
  const top = 74;
  const bottom = config.world.groundY - 26;
  const step = (bottom - top) / 4;
  return clamp(top + laneIndex * step, top, bottom);
}
