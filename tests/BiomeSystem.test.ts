import { describe, expect, it } from 'vitest';
import { BiomeSystem, createBiomeSample } from '../src/biome/BiomeSystem';

describe('altitude biomes', () => {
  it('reproduces climate, snow and color independently of sampling order', () => {
    const a = new BiomeSystem('CLOUD-ROAD-001'), b = new BiomeSystem('CLOUD-ROAD-001');
    const other = new BiomeSystem('ANOTHER-MOUNTAIN');
    for (const x of [-100_000, -256, 0, 256, 100_000]) {
      const sample = a.sample(x, -x * 0.7, 3000, 0.95);
      b.sample(500, 750, 1200, 0.8);
      expect(sample).toEqual(b.sample(x, -x * 0.7, 3000, 0.95));
      expect(sample.snowLine).not.toBe(other.sample(x, -x * 0.7, 3000, 0.95).snowLine);
    }
  });

  it('progresses from valley through forest, rock and alpine to snow', () => {
    const biomes = new BiomeSystem('CLOUD-ROAD-001');
    const kinds = new Set(Array.from({ length: 81 }, (_, i) => biomes.sample(128, 128, i * 50, 1).kind));
    expect([...kinds]).toEqual(['valley', 'forest', 'rock', 'alpine', 'snow']);
    expect(biomes.sample(128, 128, 100, 1).kind).toBe('valley');
    expect(biomes.sample(128, 128, 4000, 1).kind).toBe('snow');
    expect(biomes.sample(128, 128, 4000, 1).temperature).toBeLessThan(biomes.sample(128, 128, 100, 1).temperature);
  });

  it('varies the snow line spatially and keeps snow off steep cliffs', () => {
    const biomes = new BiomeSystem('CLOUD-ROAD-001');
    const lines = Array.from({ length: 41 }, (_, i) => biomes.sample(i * 250 - 5000, 128, 3000, 1).snowLine);
    expect(Math.max(...lines) - Math.min(...lines)).toBeGreaterThan(100);
    for (const x of [-5000, 0, 5000]) {
      const line = biomes.sample(x, 128, 3000, 1).snowLine;
      expect(biomes.sample(x, 128, line - 300, 1).weights.snow).toBe(0);
      expect(biomes.sample(x, 128, line + 300, 1).weights.snow).toBe(1);
      const cliff = biomes.sample(x, 128, line + 600, 0.3);
      expect(cliff.weights.snow).toBe(0);
      expect(cliff.kind).toBe('rock');
      expect(biomes.sample(x, 128, 1000, 0.3).weights.forest).toBe(0);
    }
  });

  it('keeps blends normalized, bounded and continuous across elevation and slope transitions', () => {
    const biomes = new BiomeSystem('CLOUD-ROAD-001');
    const target = createBiomeSample();
    for (let i = 0; i <= 120; i++) {
      const x = i * 107 - 5000, z = -x * 0.71, height = i * 50, normalY = (i % 11) / 10;
      const sample = biomes.sample(x, z, height, normalY);
      expect(biomes.sample(x, z, height, normalY, target)).toBe(target);
      expect(target).toEqual(sample);
      const weights = Object.values(sample.weights);
      expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
      expect([...weights, ...sample.color, sample.humidity].every((value) => value >= 0 && value <= 1)).toBe(true);
      const neighbor = biomes.sample(x + 0.01, z - 0.01, height + 0.01, normalY + 0.00001);
      for (let channel = 0; channel < 3; channel++) expect(Math.abs(sample.color[channel] - neighbor.color[channel])).toBeLessThan(0.001);
    }
  });
});
