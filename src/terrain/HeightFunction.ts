import { hashSeed } from '../world/WorldSeed';
import { Noise } from './Noise';
import type { TerrainKind } from '../world/WorldOptions';

export class HeightFunction {
  readonly noise: Noise;

  constructor(seed: string, readonly terrain: TerrainKind = 'alpine') { this.noise = new Noise(hashSeed(seed)); }

  sample(x: number, z: number): number {
    const warpX = this.noise.fractal(x / 4200, z / 4200, 2) * 650;
    const warpZ = this.noise.fractal(x / 4200 + 73, z / 4200 - 29, 2) * 650;
    const wx = x + warpX, wz = z + warpZ;
    const macro = (this.noise.fractal(wx / 6200, wz / 6200, 3) + 1) * 820;
    const ranges = this.noise.ridged(wx / 3400, wz / 4600, 4) * 3100;
    const medium = this.noise.fractal(wx / 380, wz / 380, 3) * 145;
    const detail = this.noise.fractal(x / 90, z / 90, 2) * 18;
    if (this.terrain === 'forest') return 180 + macro * 0.34 + ranges * 0.3 + medium * 0.45 + detail * 0.4;
    if (this.terrain === 'dunes') {
      const dunes = Math.sin(wx / 140 + wz / 360 + this.noise.sample(wx / 800, wz / 800) * 2);
      return 150 + macro * 0.18 + ranges * 0.06 + (dunes + 1) ** 2 * 22 + medium * 0.12;
    }
    if (this.terrain === 'desert') {
      const mesa = this.noise.ridged(wx / 1900, wz / 2400, 2);
      const t = Math.max(0, Math.min(1, (mesa - 0.26) / 0.48));
      const dunes = Math.sin(wx / 115 + this.noise.sample(wx / 700, wz / 700) * 3 + wz / 330) * 22;
      return 220 + macro * 0.24 + t * t * (3 - 2 * t) * 1050 + medium * 0.2 + dunes * (1 - t) + detail * 0.15;
    }
    return 140 + macro + ranges + medium + detail;
  }
}
