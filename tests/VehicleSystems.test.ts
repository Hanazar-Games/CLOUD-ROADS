import { expect, it } from 'vitest';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';

const tick = (systems: VehicleSystems, seconds: number, rain = 1, shelter = 0, dt = 1 / 60) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) systems.update(dt, 1, rain, shelter);
};

it('sprays washer fluid and runs a cleanup cycle even with wipers switched off', () => {
  const systems = new VehicleSystems(); systems.wipers = 'off';
  expect(systems.wash()).toBe(true);
  tick(systems, 0.2, 0);
  expect(systems.washerSpray).toBeGreaterThan(0);
  expect(systems.washerFluid).toBeLessThan(3);
  expect(systems.sweep).toBeGreaterThan(0);
  const fluid = systems.washerFluid;
  systems.update(0, 0, 0, 0); expect(systems.washerFluid).toBe(fluid);
  tick(systems, 6, 0); expect(systems.washerSpray).toBe(0); expect(systems.sweep).toBe(0);
  systems.washerFluid = 0; expect(systems.wash()).toBe(false);
  expect(systems.refill(10)).toBe(false); expect(systems.refill(0)).toBe(true);
  expect(systems.washerFluid).toBe(3);
});

it('animates windows and the convertible roof, with speed and equipment limits', () => {
  const systems = new VehicleSystems(); systems.configure('roadster');
  systems.windowTarget = 1;
  expect(systems.toggleRoof(20)).toBe(false);
  expect(systems.toggleRoof(0)).toBe(true);
  const roof = systems.roofOpen;
  systems.update(0, 0, 0, 0); expect(systems.roofOpen).toBe(roof);
  tick(systems, 5, 0);
  expect(systems.windowOpen).toBe(1); expect(systems.roofOpen).toBe(0);
  systems.configure('motorcycle');
  expect(systems.hasWindows).toBe(false); expect(systems.hasWindshield).toBe(false);
  expect(systems.toggleRoof(0)).toBe(false); expect(systems.wash()).toBe(false);
  expect(systems.cabinExposure).toBe(1);
  systems.configure('sedan'); systems.windowTarget = 0; tick(systems, 5, 0);
  expect(systems.cabinExposure).toBe(0);
});

it('only runs the equipment motor while windows or the roof actually move', () => {
  const systems = new VehicleSystems(); systems.configure('roadster'); systems.toggleRoof(0);
  systems.update(0.1, 0, 0, 0, 0, 0);
  expect(systems.equipmentMotor).toBe(true);
  const roof = systems.roofOpen;
  systems.update(0.1, 0, 0, 0, 0, 10);
  expect(systems.roofOpen).toBe(roof); expect(systems.equipmentMotor).toBe(false);
  systems.windowTarget = 1; systems.update(0.1, 0, 0, 0, 0, 10);
  expect(systems.equipmentMotor).toBe(true);
  systems.update(0, 0, 0, 0);
  expect(systems.equipmentMotor).toBe(false);
  tick(systems, 5, 0); expect(systems.equipmentMotor).toBe(false);
});

it('reports the complete blade sweep when a frame crosses the reversal point', () => {
  const systems = new VehicleSystems(); systems.wipers = 'high';
  tick(systems, 0.3, 1, 0, 0.1);
  systems.update(0.1, 1, 1, 0);
  expect(systems.sweepTo).toBe(1);
  expect(systems.sweepFrom).toBeLessThanOrEqual(systems.sweep);
  systems.update(0, 1, 1, 0);
  expect(systems.sweepFrom).toBe(systems.sweepTo);
});

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

it('blinks left, right and hazard lamps in phase, freezes when paused and cancels after a turn', () => {
  const systems = new VehicleSystems();
  systems.signal = 'left'; systems.update(0.1, 0, 0, 0, -0.3);
  expect(systems.leftSignal).toBe(true); expect(systems.rightSignal).toBe(false);
  const lit = systems.leftSignal; systems.update(0, 0, 0, 0, -0.3); expect(systems.leftSignal).toBe(lit);
  systems.update(0.1, 0, 0, 0, 0); expect(systems.signal).toBe('off');
  systems.signal = 'hazard'; tick(systems, 0.15);
  expect(systems.leftSignal).toBe(systems.rightSignal);
  tick(systems, 0.3); expect(systems.leftSignal).toBe(false);
});
