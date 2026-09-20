import { expect, it } from 'vitest';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';

const tick = (systems: VehicleSystems, seconds: number, rain = 1, shelter = 0, dt = 1 / 60) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) systems.update(dt, 1, rain, shelter);
};

it('honors manual lights in daylight and darkness and distinguishes high beams', () => {
  const systems = new VehicleSystems();
  systems.update(0, 0, 0, 0); expect(systems.beam).toBe('off');
  systems.update(0, 1, 0, 0); expect(systems.beam).toBe('low');
  systems.lights = 'off'; systems.update(0, 1, 1, 0); expect(systems.beam).toBe('off');
  systems.lights = 'high'; systems.update(0, 0, 0, 0); expect(systems.beam).toBe('high');
});

it('parks after the current sweep, freezes at zero time and never wipes a motorcycle', () => {
  const systems = new VehicleSystems(); systems.wipers = 'high'; tick(systems, 0.25);
  expect(systems.sweep).toBeGreaterThan(0);
  const sweep = systems.sweep; systems.update(0, 1, 1, 0); expect(systems.sweep).toBe(sweep);
  systems.wipers = 'off'; tick(systems, 2); expect(systems.sweep).toBe(0);
  systems.wipers = 'high'; systems.hasWindshield = false; tick(systems, 1);
  expect(systems.sweep).toBe(0); expect(systems.wiperRate).toBe(0);
});

it('responds to rain and shelter, and keeps wiper timing independent of frame rate', () => {
  const a = new VehicleSystems(), b = new VehicleSystems();
  tick(a, 0.5, 1, 0, 1 / 30); tick(b, 0.5, 1, 0, 1 / 144);
  expect(a.sweep).toBeCloseTo(b.sweep, 8);
  expect(a.wiperRate).toBeGreaterThan(1);
  tick(a, 3, 1, 1); expect(a.sweep).toBe(0); expect(a.wiperRate).toBe(0);
  tick(a, 1, 0); expect(a.sweep).toBe(0);
  a.wipers = 'intermittent'; tick(a, 1, 0); expect(a.sweep).toBe(0);
  tick(a, 2.5, 0); expect(a.sweep).toBeGreaterThan(0);
});

it('starts continuous wiping immediately when leaving the intermittent pause', () => {
  const systems = new VehicleSystems(); systems.wipers = 'intermittent'; tick(systems, 1);
  expect(systems.sweep).toBe(0);
  systems.wipers = 'high'; tick(systems, 0.15);
  expect(systems.sweep).toBeGreaterThan(0.2);
});
