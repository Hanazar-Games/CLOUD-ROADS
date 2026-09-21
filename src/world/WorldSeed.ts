export const DEFAULT_SEED = 'CLOUD-ROAD-001';
export const randomSeed = (): string => `ROAD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
export const startingSeed = (search: string): string => new URLSearchParams(search).get('seed')?.trim().slice(0, 80) || randomSeed();

export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
