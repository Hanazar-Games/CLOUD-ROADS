import { expect, it } from 'vitest';
import { Noise } from '../src/terrain/Noise';
import { mountainIncision } from '../src/terrain/MountainErosion';

it('cuts varied continuous drainage channels into mountain flanks while preserving the valley floor', () => {
  const noise = new Noise(817), depths: number[] = [];
  for (let x = -4000; x <= 4000; x += 29) {
    expect(mountainIncision(noise, x, x * 0.3, 0, 1)).toBe(0);
    const depth = mountainIncision(noise, x, x * 0.3, 1, 0.8); depths.push(depth);
    expect(depth).toBeGreaterThanOrEqual(0); expect(depth).toBeLessThanOrEqual(150);
    expect(Math.abs(depth - mountainIncision(noise, x + 0.01, x * 0.3, 1, 0.8))).toBeLessThan(0.08);
  }
  expect(Math.max(...depths)).toBeGreaterThan(50);
  expect(depths.filter(d => d < 1).length).toBeGreaterThan(depths.length / 4);
  expect(mountainIncision(noise, 741, -113, 1, 1)).toBe(mountainIncision(new Noise(817), 741, -113, 1, 1));
});
