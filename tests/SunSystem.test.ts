import { Color } from 'three';
import { expect, it } from 'vitest';
import { SunSystem } from '../src/atmosphere/SunSystem';

it('moves one sun smoothly from afternoon to sunset and keeps light values finite', () => {
  const sun = new SunSystem();
  let previousElevation = Infinity;
  for (let time = 0; time <= 100; time++) {
    sun.setTime(time / 100);
    expect(sun.direction.length()).toBeCloseTo(1, 10);
    expect(sun.elevation).toBeLessThan(previousElevation);
    expect(sun.direction.y).toBeCloseTo(Math.sin(sun.elevation * Math.PI / 180), 10);
    expect(sun.light.x).toBeGreaterThanOrEqual(0);
    for (const color of [sun.sunColor, sun.zenith, sun.horizon, sun.haze, sun.ambient]) {
      expect(color.toArray().every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    }
    previousElevation = sun.elevation;
  }
  expect(sun.elevation).toBeLessThan(0);
  expect(sun.light.x).toBe(0);
});

it('reproduces lighting independent of sampling order and warms the lowering sun', () => {
  const sun = new SunSystem();
  sun.setTime(0);
  const afternoon = sun.sunColor.clone(), intensity = sun.light.x;
  sun.setTime(0.9);
  expect(sun.sunColor.r / sun.sunColor.b).toBeGreaterThan(afternoon.r / afternoon.b);
  expect(sun.light.x).toBeLessThan(intensity);
  const sunset = sun.horizon.clone(), direction = sun.direction.clone();
  sun.setTime(0.3);
  sun.setTime(0.9);
  expect(sun.horizon).toEqual(sunset);
  expect(sun.direction).toEqual(direction);
  expect(new SunSystem().time).toBe(0.7);
});

it('interpolates palette transitions continuously without replacing shared uniforms', () => {
  const sun = new SunSystem(), direction = sun.direction, horizon = sun.horizon;
  const distance = (a: Color, b: Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  sun.setTime(0.69999);
  const before = sun.horizon.clone();
  sun.setTime(0.70001);
  expect(distance(before, sun.horizon)).toBeLessThan(0.001);
  expect(sun.direction).toBe(direction);
  expect(sun.horizon).toBe(horizon);
  sun.setTime(-1);
  expect(sun.time).toBe(0);
  sun.setTime(2);
  expect(sun.time).toBe(1);
});
