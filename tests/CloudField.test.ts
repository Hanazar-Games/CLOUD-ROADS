import { expect, it } from 'vitest';
import { CLOUD_BASE, CLOUD_TILE, CloudField, wrapCloudCoordinate } from '../src/atmosphere/CloudField';

it('reproduces seeded cloud shapes and distinguishes seeds', () => {
  const a = new CloudField('CLOUD-ROAD-001'), b = new CloudField('CLOUD-ROAD-001');
  expect(a.data).toEqual(b.data);
  expect(a.data).not.toEqual(new CloudField('OTHER').data);
  expect(a.sample(-1234, 2100, 5678)).toEqual(b.sample(-1234, 2100, 5678));
});

it('passes smoothly from clear air through dense cloud and back to clear air', () => {
  const field = new CloudField('CLOUD-ROAD-001');
  const below = field.sample(128, CLOUD_BASE - 100, 128);
  const inside = field.sample(128, 2050, 128);
  const above = field.sample(128, 2700, 128);
  expect([below.region, inside.region, above.region]).toEqual(['below', 'inside', 'above']);
  expect(below.density).toBe(0);
  expect(above.density).toBe(0);
  expect(inside.density).toBeGreaterThan(0.8);
  expect(inside.fogFar).toBeLessThan(400);
  expect(below.fogFar).toBe(1950);
  for (let y = 1600; y <= 2600; y += 2) {
    const a = field.sample(-256, y, -512), b = field.sample(-256, y + 0.01, -512);
    expect(a.fogFar).toBeGreaterThan(a.fogNear);
    expect(Math.abs(a.density - b.density)).toBeLessThan(0.001);
    expect(Math.abs(a.fogFar - b.fogFar)).toBeLessThan(1);
  }
});

it('wraps seamless cloud texture coordinates without changing the logical cloud field', () => {
  const field = new CloudField('CLOUD-ROAD-001');
  for (const x of [-100_000, -8192, -256, 0, 256, 100_000]) {
    expect(field.sample(x, 2050, x * 0.5)).toEqual(field.sample(x + CLOUD_TILE, 2050, x * 0.5 - CLOUD_TILE));
    const a = field.sample(x, 2050, x * 0.5), b = field.sample(x + 0.001, 2050, x * 0.5);
    expect(Math.abs(a.top - b.top)).toBeLessThan(0.01);
    expect(wrapCloudCoordinate(x)).toBeGreaterThanOrEqual(0);
    expect(wrapCloudCoordinate(x)).toBeLessThan(CLOUD_TILE);
  }
  expect(field.sample(0, 2050, 0).top).toBeCloseTo(field.sample(-0.001, 2050, -0.001).top, 2);
});

it('keeps cloud samples finite over a 100 km flight and varies the cloud top', () => {
  const field = new CloudField('CLOUD-ROAD-001');
  const tops: number[] = [];
  for (let distance = 0; distance <= 100_000; distance += 257) {
    const sample = field.sample(Math.sin(distance / 6000) * 8000, 1800 + distance / 100, -distance);
    expect([sample.base, sample.top, sample.density, sample.fogNear, sample.fogFar].every(Number.isFinite)).toBe(true);
    expect(sample.top).toBeGreaterThan(sample.base + 300);
    expect(sample.density).toBeGreaterThanOrEqual(0);
    expect(sample.density).toBeLessThanOrEqual(1);
    tops.push(sample.top);
  }
  expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(20);
});
