export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function frac(v) {
  return v - Math.floor(v);
}

export function deterministicNoise(a, b, c) {
  return frac(Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453);
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function nextRand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomRange(rand, min, max) {
  return min + (max - min) * rand();
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function circleRectHit(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const normalized = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(normalized, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `${r},${g},${b}`;
}
