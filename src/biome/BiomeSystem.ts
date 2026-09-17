import { Noise } from '../terrain/Noise';
import { hashSeed } from '../world/WorldSeed';

export type Biome = 'valley' | 'forest' | 'rock' | 'alpine' | 'snow';

export interface BiomeSample {
  kind: Biome;
  weights: Record<Biome, number>;
  color: [number, number, number];
  temperature: number;
  humidity: number;
  snowLine: number;
}

export const createBiomeSample = (): BiomeSample => ({
  kind: 'valley', weights: { valley: 1, forest: 0, rock: 0, alpine: 0, snow: 0 },
  color: [0, 0, 0], temperature: 0, humidity: 0, snowLine: 3000,
});

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const smooth = (min: number, max: number, value: number): number => {
  const t = clamp((value - min) / (max - min));
  return t * t * (3 - 2 * t);
};

// Linear RGB for the shared terrain material.
const palette: Record<Biome, readonly [number, number, number]> = {
  valley: [0.075, 0.14, 0.045], forest: [0.032, 0.075, 0.038],
  rock: [0.23, 0.21, 0.185], alpine: [0.24, 0.28, 0.22], snow: [0.76, 0.84, 0.88],
};
const kinds: readonly Biome[] = ['valley', 'forest', 'rock', 'alpine', 'snow'];

export class BiomeSystem {
  private readonly noise: Noise;

  constructor(seed: string) { this.noise = new Noise(hashSeed(`${seed}:biomes`)); }

  sample(x: number, z: number, height: number, normalY: number, target = createBiomeSample()): BiomeSample {
    const climate = this.noise.fractal(x / 5000, z / 5000, 2);
    const humidity = clamp(0.5 + this.noise.fractal(x / 2100 + 31, z / 2100 - 47, 2) * 0.45);
    const variation = this.noise.sample(x / 310 - 19, z / 310 + 53);
    target.temperature = 18 + climate * 1.6 - height * 0.006;
    target.humidity = humidity;
    target.snowLine = 3000 + climate * (1.6 / 0.006) + variation * 100 - (humidity - 0.5) * 120;
    const altitude = (18 - target.temperature) / 0.006 - (humidity - 0.5) * 220;
    const forest = smooth(450, 950, altitude);
    const treeline = smooth(1450, 2250, altitude);
    const alpine = smooth(2150, 2700, altitude);
    const cliff = smooth(0.12, 0.5, 1 - normalY);
    const snow = smooth(target.snowLine - 180, target.snowLine + 180, height) * smooth(0.48, 0.87, normalY);
    const soil = (1 - cliff) * (1 - snow);
    const weights = target.weights;
    weights.valley = (1 - forest) * (1 - treeline) * soil;
    weights.forest = forest * (1 - treeline) * soil;
    weights.rock = treeline * (1 - alpine) * soil + cliff * (1 - snow);
    weights.alpine = treeline * alpine * soil;
    weights.snow = snow;
    const shade = 0.94 + variation * 0.06;
    target.color.fill(0);
    target.kind = 'valley';
    for (const kind of kinds) {
      if (weights[kind] > weights[target.kind]) target.kind = kind;
      for (let channel = 0; channel < 3; channel++) target.color[channel] += palette[kind][channel] * weights[kind] * shade;
    }
    return target;
  }
}
