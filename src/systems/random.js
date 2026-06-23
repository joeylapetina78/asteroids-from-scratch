export function createRandom(seed) {
  let state = seed >>> 0;

  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashNumbers(...numbers) {
  let hash = 2166136261;

  numbers.forEach((number) => {
    hash ^= number | 0;
    hash = Math.imul(hash, 16777619);
  });

  return hash >>> 0;
}

export function randomRange(random, min, max) {
  return min + random() * (max - min);
}
