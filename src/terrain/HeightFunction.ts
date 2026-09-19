import { hashSeed } from '../world/WorldSeed';
import { Noise } from './Noise';
import type { RouteStyle, TerrainKind } from '../world/WorldOptions';
import { MountainRanges } from './MountainRanges';
import { CliffLandscape } from './CliffLandscape';

export class HeightFunction {
  readonly noise: Noise;
  readonly ranges: MountainRanges;
  private readonly cliffs;

  constructor(seed: string, readonly terrain: TerrainKind = 'alpine', routeStyle: RouteStyle = 'natural') {
    this.noise = new Noise(hashSeed(seed)); this.ranges = new MountainRanges(seed);
    this.cliffs = routeStyle === 'cliff' ? new CliffLandscape(seed, this.ranges) : undefined;
  }

  route(z: number) { return this.cliffs ? this.cliffs.route(z) : this.terrain === 'alpine' ? this.ranges.sample(z) : undefined; }

  sample(x: number, z: number): number {
    if (this.cliffs) return this.cliffs.sample(x, z);
    const warpX = this.noise.fractal(x / 4200, z / 4200, 2) * 650;
    const warpZ = this.noise.fractal(x / 4200 + 73, z / 4200 - 29, 2) * 650;
    const wx = x + warpX, wz = z + warpZ;
    const macro = (this.noise.fractal(wx / 6200, wz / 6200, 3) + 1) * 820;
    const ranges = this.noise.ridged(wx / 3400, wz / 4600, 4) * 3100;
    const medium = this.noise.fractal(wx / 380, wz / 380, 3) * 145;
    const detail = this.noise.fractal(x / 90, z / 90, 2) * 18;
    if (this.terrain === 'forest') return 180 + macro * 0.34 + ranges * 0.3 + medium * 0.52 + detail * 0.55
      + (this.noise.ridged(wx / 180, wz / 280, 2) - 0.5) * 26;
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
    const guide = this.ranges.sample(z), lateral = Math.abs(x - guide.x);
    const flank = Math.max(0, Math.min(1, (lateral - 350 + guide.level * 150) / 1400));
    const relief = flank * flank * (3 - 2 * flank);
    const saddle = Math.min(1, Math.abs(z - this.ranges.passZ(guide.id)) / 1600);
    const ribs = this.noise.ridged(wx / 180, wz / 290, 2);
    return guide.height + relief * (180 + ranges * (0.12 + guide.level * 0.78) + macro * 0.12 + (ribs - 0.45) * (55 + guide.level * 135))
      + medium * (0.1 + saddle * 0.3) + detail * 0.45;
  }
}
