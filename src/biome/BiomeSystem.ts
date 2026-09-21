import { Noise } from '../terrain/Noise';
import { hashSeed } from '../world/WorldSeed';
import { isAridTerrain, type TerrainKind } from '../world/WorldOptions';

export type Biome = 'valley' | 'forest' | 'rock' | 'alpine' | 'snow' | 'desert';

export interface BiomeSample {
  kind: Biome;
  weights: Record<Biome, number>;
  color: [number, number, number];
  temperature: number;
  humidity: number;
  snowLine: number;
}

export const createBiomeSample = (): BiomeSample => ({
  kind: 'valley', weights: { valley: 1, forest: 0, rock: 0, alpine: 0, snow: 0, desert: 0 },
  color: [0, 0, 0], temperature: 0, humidity: 0, snowLine: 3000,
});

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const smooth = (min: number, max: number, value: number): number => {
  const t = clamp((value - min) / (max - min));
  return t * t * (3 - 2 * t);
};

// Linear RGB for the shared terrain material.
const palette: Record<Biome, readonly [number, number, number]> = {
  valley: [0.09, 0.16, 0.049], forest: [0.042, 0.087, 0.039],
  rock: [0.23, 0.21, 0.185], alpine: [0.24, 0.28, 0.22], snow: [0.76, 0.84, 0.88],
  desert: [0.58, 0.32, 0.13],
};
const kinds: readonly Biome[] = ['valley', 'forest', 'rock', 'alpine', 'snow', 'desert'];

export class BiomeSystem {
  private readonly noise: Noise;
  readonly treeDensity: number;
  readonly autumn: boolean;

  constructor(seed: string, private readonly terrain: TerrainKind = 'alpine') {
    this.noise = new Noise(hashSeed(`${seed}:biomes`));
    this.treeDensity = terrain === 'meadow' ? 0.18 : terrain === 'volcanic' ? 0.08 : terrain === 'tundra' ? 0.04 : 1;
    this.autumn = terrain === 'autumn';
  }

  sample(x: number, z: number, height: number, normalY: number, target = createBiomeSample()): BiomeSample {
    const arid = isAridTerrain(this.terrain);
    const climate = this.noise.fractal(x / 5000, z / 5000, 2);
    const humidity = clamp((arid ? 0.12 : this.terrain === 'karst' ? 0.84 : this.terrain === 'forest' || this.autumn ? 0.72 : 0.5)
      + this.noise.fractal(x / 2100 + 31, z / 2100 - 47, 2) * (arid ? 0.12 : 0.45));
    const variation = this.noise.sample(x / 310 - 19, z / 310 + 53);
    const warmth = arid ? 32 : this.terrain === 'tundra' ? 6 : this.autumn ? 15 : 18;
    target.temperature = warmth + climate * 1.6 - height * 0.006;
    target.humidity = humidity;
    target.snowLine = warmth / 0.006 + climate * (1.6 / 0.006) + variation * 100 - (humidity - 0.5) * 120;
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
    weights.desert = arid ? (1 - snow) * (1 - cliff * 0.35) : 0;
    if (this.terrain === 'meadow') { weights.valley += weights.forest * 0.85; weights.forest *= 0.15; }
    if (this.terrain === 'volcanic') {
      const cover = weights.valley + weights.forest + weights.alpine;
      weights.rock += cover * 0.82;
      weights.valley *= 0.18; weights.forest *= 0.18; weights.alpine *= 0.18;
    }
    if (this.terrain === 'tundra') { weights.alpine += weights.valley + weights.forest; weights.valley = weights.forest = 0; }
    if (arid) {
      weights.valley = weights.forest = weights.alpine = 0;
      weights.rock = (1 - snow) * cliff * 0.35;
    }
    const shade = 0.94 + variation * 0.06;
    const meadow = this.noise.sample(x / 85 + 11, z / 85 - 9);
    target.color.fill(0);
    target.kind = 'valley';
    for (const kind of kinds) {
      if (weights[kind] > weights[target.kind]) target.kind = kind;
      for (let channel = 0; channel < 3; channel++) target.color[channel] += palette[kind][channel] * weights[kind] * shade;
    }
    const strata = 1 + Math.sin(height / 18 + this.noise.sample(x / 800, z / 800) * 2) * (this.terrain === 'desert' ? 0.08 : 0.035) * (weights.rock + weights.desert);
    for (let channel = 0; channel < 3; channel++) target.color[channel] *= strata;
    const soilCover = weights.valley + weights.forest + weights.alpine;
    target.color[0] += meadow * 0.017 * soilCover;
    target.color[1] += meadow * 0.018 * soilCover;
    target.color[2] += meadow * 0.009 * soilCover;
    if (this.terrain === 'dunes') {
      target.color[1] += palette.desert[1] * weights.desert * shade * strata * 0.18;
      target.color[2] += palette.desert[2] * weights.desert * shade * strata * 0.35;
    }
    if (this.terrain === 'badlands') { target.color[0] *= 1.13; target.color[1] *= 0.78; target.color[2] *= 0.75; }
    if (this.terrain === 'karst') for (let channel = 0; channel < 3; channel++) target.color[channel] += weights.rock * [0.055, 0.065, 0.07][channel];
    if (this.terrain === 'volcanic') for (let channel = 0; channel < 3; channel++) target.color[channel] *= 1 - weights.rock * [0.64, 0.62, 0.55][channel];
    if (this.terrain === 'tundra') { target.color[0] += weights.alpine * 0.02; target.color[1] -= weights.alpine * 0.04; }
    return target;
  }
}
