import { expect, it } from 'vitest';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { BiomeSystem } from '../src/biome/BiomeSystem';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it.each(['badlands', 'karst'] as const)('rounds %s peaks instead of producing thin height-field spikes', terrain => {
  const height = new HeightFunction('CLOUD-ROAD-001', terrain);
  let steepest = 0, roughest = 0;
  for (let x = -2000; x <= 2000; x += 8) for (let z = -2000; z <= 2000; z += 24) {
    const a = height.sample(x - 4, z), b = height.sample(x, z), c = height.sample(x + 4, z);
    steepest = Math.max(steepest, Math.abs(c - a) / 8);
    roughest = Math.max(roughest, Math.abs(a + c - 2 * b));
  }
  expect(steepest).toBeLessThan(6);
  expect(roughest).toBeLessThan(12);
});

it('offers distinct meadow hills, red-rock badlands and karst peaks with continuous seeded terrain', () => {
  const shapes: number[][] = [];
  for (const terrain of ['meadow', 'badlands', 'karst', 'volcanic', 'tundra', 'autumn'] as const) {
    const height = new HeightFunction('new-landforms', terrain), values: number[] = [];
    for (let x = -100000; x < 100000; x += 997) {
      const y = height.sample(x, x * 0.37); values.push(y);
      expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(6000);
      const delta = Math.abs(y - height.sample(x + 0.01, x * 0.37));
      expect(Math.abs(y - height.sample(x + 0.001, x * 0.37))).toBeLessThan(delta * 0.2 + 0.001);
    }
    shapes.push(values);
    const generator = new TerrainGenerator('new-landforms', { ...DEFAULT_OPTIONS, terrain });
    const a = generator.generate(-1, 0, 64), b = generator.generate(0, 0, 8);
    const edge = (data: typeof a, x: number) => {
      const result = new Map<number, number[]>();
      for (let i = 0; i < data.positions.length; i += 3) if (data.positions[i] === x) result.set(data.positions[i + 2], [data.positions[i + 1], ...data.normals.slice(i, i + 3), ...data.colors.slice(i, i + 3)]);
      return result;
    };
    expect(edge(a, 256)).toEqual(edge(b, 0));
    expect(generator.generate(-1, 0, 64)).toEqual(a);
  }
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) expect(shapes[i]).not.toEqual(shapes[j]);
  expect(new BiomeSystem('new-landforms', 'badlands').sample(128, 128, 900, 1).weights.desert).toBeGreaterThan(0.8);
  expect(new BiomeSystem('new-landforms', 'meadow').sample(128, 128, 900, 1).weights.valley).toBeGreaterThan(0.6);
});

it('gives new climates normalized habitats and appropriate vegetation', () => {
  const volcanic = new BiomeSystem('ecology', 'volcanic'), tundra = new BiomeSystem('ecology', 'tundra');
  expect(volcanic.treeDensity).toBeLessThan(0.2); expect(tundra.treeDensity).toBeLessThan(0.2);
  for (const terrain of ['volcanic', 'tundra', 'autumn'] as const) for (const h of [300, 1000, 2200, 3500]) {
    const biome = new BiomeSystem('ecology', terrain).sample(128, -128, h, 0.85);
    expect(Object.values(biome.weights).reduce((a, b) => a + b)).toBeCloseTo(1, 8);
    expect(biome.color.every(v => v >= 0 && v <= 1)).toBe(true);
    expect(biome.weights.desert).toBe(0);
  }
  expect(tundra.sample(0, 0, 1800, 1).weights.snow).toBeGreaterThan(0.9);
});
