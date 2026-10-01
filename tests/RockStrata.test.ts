import { expect, it } from 'vitest';
import { stratifiedHeight } from '../src/terrain/RockStrata';

it('forms bounded terraces without reversing the terrain slope', () => {
  for (const spacing of [64, 96, 128]) for (const strength of [0, 0.4, 0.8]) {
    let previous = stratifiedHeight(-500, spacing, strength), minStep = Infinity, maxOffset = 0;
    for (let h = -499.75; h < 6000; h += 0.25) {
      const height = stratifiedHeight(h, spacing, strength);
      minStep = Math.min(minStep, height - previous); maxOffset = Math.max(maxOffset, Math.abs(height - h));
      previous = height;
    }
    expect(minStep).toBeGreaterThan(0);
    expect(maxOffset).toBeLessThanOrEqual(spacing * strength * 0.097 + 1e-9);
    if (strength === 0) expect(maxOffset).toBe(0);
  }
  expect(stratifiedHeight(24, 96, 0.8)).not.toBe(24);
});

it('joins sediment layers continuously in height and slope, including negative heights', () => {
  for (let layer = -8; layer <= 80; layer++) {
    const h = layer * 96, epsilon = 0.001;
    expect(stratifiedHeight(h, 96, 0.8)).toBeCloseTo(h, 8);
    const left = (stratifiedHeight(h, 96, 0.8) - stratifiedHeight(h - epsilon, 96, 0.8)) / epsilon;
    const right = (stratifiedHeight(h + epsilon, 96, 0.8) - stratifiedHeight(h, 96, 0.8)) / epsilon;
    expect(left).toBeCloseTo(right, 6); expect(left).toBeGreaterThan(0.19);
  }
});
