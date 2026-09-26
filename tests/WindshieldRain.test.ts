import { expect, it } from 'vitest';
import { WindshieldRain } from '../src/vehicle/WindshieldRain';

it('receives washer spray in clear weather and clears it with the blade sweep', () => {
  const glass = new WindshieldRain(1.55, 0.81);
  for (let i = 0; i < 10; i++) glass.update(0.1, 0, 0, 0, 0, 1);
  expect(glass.coverage).toBeGreaterThan(0.5);
  glass.update(0.1, 0, 0, 1, 0);
  expect(glass.sweptCoverage).toBe(0); expect(glass.coverage).toBeGreaterThan(0);
});

it('accumulates water, clears the blade arcs and wets them again after wiping stops', () => {
  const rain = new WindshieldRain(1.55, 0.81);
  for (let i = 0; i < 100; i++) rain.update(0.1, 1, 0, 0, 0);
  expect(rain.coverage).toBeGreaterThan(0.9);
  rain.update(0.1, 1, 0, 1, 0);
  expect(rain.sweptCoverage).toBeLessThan(0.04);
  expect(rain.coverage).toBeGreaterThan(0.15);
  const held = rain.data.slice(); rain.update(0, 1, 0, 1, 0);
  expect(rain.data).toEqual(held);
  for (let i = 0; i < 100; i++) rain.update(0.1, 1, 0, 0, 0);
  expect(rain.sweptCoverage).toBeGreaterThan(0.9);
  for (let i = 0; i < 800; i++) rain.update(0.1, 0, 0, 0, 15);
  expect(rain.coverage).toBe(0);
});
