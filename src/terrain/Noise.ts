import { createRng } from '../world/WorldSeed';

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class Noise {
  private readonly offsetX: number;
  private readonly offsetZ: number;

  constructor(private readonly seed: number) {
    const rng = createRng(seed);
    this.offsetX = rng() * 10_000;
    this.offsetZ = rng() * 10_000;
  }

  private gradient(x: number, z: number, dx: number, dz: number): number {
    let hash = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ this.seed;
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    hash ^= hash >>> 16;
    switch (hash & 7) {
      case 0: return dx;
      case 1: return -dx;
      case 2: return dz;
      case 3: return -dz;
      case 4: return (dx + dz) * Math.SQRT1_2;
      case 5: return (dx - dz) * Math.SQRT1_2;
      case 6: return (-dx + dz) * Math.SQRT1_2;
      default: return (-dx - dz) * Math.SQRT1_2;
    }
  }

  sample(x: number, z: number): number {
    x += this.offsetX;
    z += this.offsetZ;
    const ix = Math.floor(x), iz = Math.floor(z);
    const dx = x - ix, dz = z - iz;
    const u = fade(dx), v = fade(dz);
    return lerp(
      lerp(this.gradient(ix, iz, dx, dz), this.gradient(ix + 1, iz, dx - 1, dz), u),
      lerp(this.gradient(ix, iz + 1, dx, dz - 1), this.gradient(ix + 1, iz + 1, dx - 1, dz - 1), u), v,
    ) * 1.7;
  }

  fractal(x: number, z: number, octaves: number): number {
    let value = 0, amplitude = 1, total = 0;
    for (let i = 0; i < octaves; i++) {
      value += this.sample(x, z) * amplitude;
      total += amplitude;
      amplitude *= 0.5;
      x *= 2.03;
      z *= 2.03;
    }
    return value / total;
  }

  ridged(x: number, z: number, octaves: number): number {
    let value = 0, amplitude = 1, total = 0, weight = 1;
    for (let i = 0; i < octaves; i++) {
      const ridge = (1 - Math.abs(this.sample(x, z))) ** 2;
      value += ridge * amplitude * weight;
      weight = 0.75 + ridge * 0.25;
      total += amplitude;
      amplitude *= 0.38;
      x *= 2.07;
      z *= 2.07;
    }
    return value / total;
  }
}
