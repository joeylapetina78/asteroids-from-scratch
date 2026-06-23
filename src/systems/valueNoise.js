import { hashNumbers } from "./random.js";

export function createValueNoise(seed) {
  return function noise(x, y, scale) {
    const scaledX = x / scale;
    const scaledY = y / scale;
    const x0 = Math.floor(scaledX);
    const y0 = Math.floor(scaledY);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const tx = smoothStep(scaledX - x0);
    const ty = smoothStep(scaledY - y0);

    const top = lerp(hashToUnit(seed, x0, y0), hashToUnit(seed, x1, y0), tx);
    const bottom = lerp(hashToUnit(seed, x0, y1), hashToUnit(seed, x1, y1), tx);

    return lerp(top, bottom, ty);
  };
}

function hashToUnit(seed, x, y) {
  return hashNumbers(seed, x, y) / 4294967295;
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}
