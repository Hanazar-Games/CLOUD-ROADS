import { hashSeed } from '../world/WorldSeed';
import { Noise } from './Noise';
import type { RouteStyle, TerrainKind, WorldOptions } from '../world/WorldOptions';
import { MountainRanges } from './MountainRanges';
import { CliffLandscape } from './CliffLandscape';

export class HeightFunction {
  readonly noise: Noise;
  readonly ranges: MountainRanges;
  private readonly cliffs;

  constructor(seed: string, readonly terrain: TerrainKind = 'alpine', routeStyle: RouteStyle = 'natural', roadType: WorldOptions['roadType'] = 'mountain') {
    this.noise = new Noise(hashSeed(seed)); this.ranges = new MountainRanges(seed, roadType === 'highway' ? 64000 : 32000);
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
    const region = this.noise.fractal(wx / 8700 + 19, wz / 7300 - 37, 2);
    const basin = Math.max(0, this.noise.sample(wx / 2100 + 53, wz / 1700 - 71));
    if (this.terrain === 'forest') return 180 + macro * 0.34 + ranges * (0.2 + (region + 1) * 0.12) + medium * (0.3 + basin) + detail * 0.55
      + (this.noise.ridged(wx / 180, wz / 280, 2) - 0.5) * 26 - basin * basin * 115;
    if (this.terrain === 'dunes') {
      const u = wx * 0.94 + wz * 0.34, v = -wx * 0.42 + wz * 0.91;
      const dunes = Math.sin(u / 145 + this.noise.sample(wx / 620, wz / 720) * 3) * (0.7 + region * 0.3)
        + Math.sin(v / 230 + this.noise.sample(wx / 1200 + 73, wz / 900) * 2) * (0.3 - region * 0.3);
      const crossed = this.noise.ridged(wx / 450 - 17, wz / 280 + 31, 2);
      return 150 + macro * 0.18 + ranges * 0.06 + (dunes + 1) ** 2 * (15 + (region + 1) * 12) * (1 - basin * 0.55)
        + crossed * 25 + medium * 0.12;
    }
    if (this.terrain === 'desert') {
      const mesa = this.noise.ridged(wx / 1900, wz / 2400, 2);
      const t = Math.max(0, Math.min(1, (mesa - 0.26 - region * 0.09) / (0.42 + basin * 0.16)));
      const dunes = Math.sin(wx / 115 + this.noise.sample(wx / 700, wz / 700) * 3 + wz / 330) * 22;
      const gullies = this.noise.ridged(wx / 240, wz / 650, 2);
      return 220 + macro * 0.24 + t * t * (3 - 2 * t) * (850 + (region + 1) * 240)
        + medium * 0.2 + dunes * (1 - t) + detail * 0.15 - gullies * basin * (1 - t) * 70;
    }
    const guide = this.ranges.sample(z), lateral = Math.abs(x - guide.x);
    const valleyWidth = 350 + this.noise.sample(z / 5100, 149) * 180 - guide.level * 150;
    const flank = Math.max(0, Math.min(1, (lateral - valleyWidth) / (1250 + region * 350)));
    const relief = flank * flank * (3 - 2 * flank);
    const saddle = Math.min(1, Math.abs(z - this.ranges.passZ(guide.id)) / 1600);
    const ribs = this.noise.ridged(wx / 180, wz / 290, 2);
    return guide.height + relief * (180 + ranges * (0.12 + guide.level * (0.65 + region * 0.25)) + macro * 0.12 + (ribs - 0.45) * (55 + guide.level * 135))
      + medium * (0.1 + saddle * 0.3) + detail * 0.45;
  }
}
