import { Noise } from '../terrain/Noise';
import { createRng, hashSeed } from '../world/WorldSeed';

export const CLOUD_BASE = 1800;
export const CLOUD_TOP = 2300;
export const CLOUD_TILE = 8192;
export const CLOUD_RESOLUTION = 128;
export const CLOUD_RELIEF = 320;
export const wrapCloudCoordinate = (value: number): number => ((value % CLOUD_TILE) + CLOUD_TILE) % CLOUD_TILE;

const smooth = (min: number, max: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export class CloudField {
  readonly data = new Uint8Array(CLOUD_RESOLUTION * CLOUD_RESOLUTION * 4);

  constructor(seed: string) {
    const noise = new Noise(hashSeed(`${seed}:clouds`));
    const rng = createRng(hashSeed(`${seed}:billows`));
    const cells = 16, centers = Float32Array.from({ length: cells * cells * 2 }, () => 0.2 + rng() * 0.6);
    const billow = (u: number, v: number) => {
      const x = u * cells, z = v * cells, ix = Math.floor(x), iz = Math.floor(z);
      let distance = Infinity;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const index = (((iz + dz + cells) % cells) * cells + (ix + dx + cells) % cells) * 2;
        distance = Math.min(distance, (x - ix - dx - centers[index]) ** 2 + (z - iz - dz - centers[index + 1]) ** 2);
      }
      return Math.exp(-distance * 3);
    };
    const tiled = (u: number, v: number, scale: number, offset: number) => {
      const x = u * scale + offset, z = v * scale - offset;
      return mix(mix(noise.sample(x, z), noise.sample(x - scale, z), smooth(0, 1, u)),
        mix(noise.sample(x, z - scale), noise.sample(x - scale, z - scale), smooth(0, 1, u)), smooth(0, 1, v));
    };
    for (let z = 0; z < CLOUD_RESOLUTION; z++) for (let x = 0; x < CLOUD_RESOLUTION; x++) {
      const u = x / CLOUD_RESOLUTION, v = z / CLOUD_RESOLUTION, offset = (z * CLOUD_RESOLUTION + x) * 4;
      this.data[offset] = Math.round((0.5 + tiled(u, v, 7, 13) * 0.4) * 255);
      this.data[offset + 1] = Math.round((0.2 + billow(u, v) * 0.7 + tiled(u, v, 4, 79) * 0.08) * 255);
      this.data[offset + 2] = Math.round((0.5 + tiled(u, v, 23, 131) * 0.4) * 255);
      this.data[offset + 3] = 255;
    }
  }

  private channel(x: number, z: number, channel: number): number {
    const px = wrapCloudCoordinate(x) / CLOUD_TILE * CLOUD_RESOLUTION - 0.5;
    const pz = wrapCloudCoordinate(z) / CLOUD_TILE * CLOUD_RESOLUTION - 0.5;
    const ix = Math.floor(px), iz = Math.floor(pz);
    const read = (x: number, z: number) => this.data[(((z + CLOUD_RESOLUTION) % CLOUD_RESOLUTION) * CLOUD_RESOLUTION
      + (x + CLOUD_RESOLUTION) % CLOUD_RESOLUTION) * 4 + channel] / 255;
    return mix(mix(read(ix, iz), read(ix + 1, iz), px - ix), mix(read(ix, iz + 1), read(ix + 1, iz + 1), px - ix), pz - iz);
  }

  sample(x: number, y: number, z: number) {
    const top = CLOUD_TOP + (this.channel(x, z, 1) - 0.5) * CLOUD_RELIEF;
    const density = smooth(CLOUD_BASE, CLOUD_BASE + 100, y) * (1 - smooth(top - 120, top, y)) * (0.85 + this.channel(x, z, 0) * 0.15);
    return {
      base: CLOUD_BASE, top, density,
      region: y < CLOUD_BASE ? 'below' as const : y > top ? 'above' as const : 'inside' as const,
      fogNear: mix(1000, 12, density), fogFar: mix(1950, 110, density),
    };
  }
}
