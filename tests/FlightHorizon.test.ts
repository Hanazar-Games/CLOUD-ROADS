import { expect, it } from 'vitest';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { buildFlightHorizon } from '../src/aviation/FlightHorizonData';

it('builds bounded distant terrain from the current seed and airport ground', () => {
  const height = new HeightFunction('HORIZON'), site = height.airports[0];
  const data = buildFlightHorizon(height, DEFAULT_OPTIONS.terrain, site.x, site.z, 512, 30000);
  expect(data.positions.length / 3).toBeLessThan(12000);
  expect(data.indices.length % 3).toBe(0);
  let radius = 0;
  for (let i = 0; i < data.positions.length; i += 3) {
    const x = data.positions[i], y = data.positions[i + 1], z = data.positions[i + 2];
    radius = Math.max(radius, Math.abs(x), Math.abs(z));
    expect(Math.max(Math.abs(x), Math.abs(z))).toBeGreaterThanOrEqual(512);
    expect(y).toBeCloseTo(height.sample(site.x + x, site.z + z) - 3, 2);
  }
  expect(radius).toBe(30000);
  expect([...data.colors].every(Number.isFinite)).toBe(true);
});
