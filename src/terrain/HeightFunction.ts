import { hashSeed } from '../world/WorldSeed';
import { Noise } from './Noise';

export class HeightFunction {
  readonly noise: Noise;

  constructor(seed: string) { this.noise = new Noise(hashSeed(seed)); }

  sample(x: number, z: number): number {
    const warpX = this.noise.fractal(x / 4200, z / 4200, 2) * 650;
    const warpZ = this.noise.fractal(x / 4200 + 73, z / 4200 - 29, 2) * 650;
    const wx = x + warpX, wz = z + warpZ;
    const macro = (this.noise.fractal(wx / 6200, wz / 6200, 3) + 1) * 820;
    const ranges = this.noise.ridged(wx / 3400, wz / 4600, 4) * 3100;
    const medium = this.noise.fractal(wx / 380, wz / 380, 3) * 145;
    const detail = this.noise.fractal(x / 90, z / 90, 2) * 18;
    return 140 + macro + ranges + medium + detail;
  }
}
