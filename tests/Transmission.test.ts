import { expect, it } from 'vitest';
import { Transmission } from '../src/vehicle/Transmission';
import { vehicleProfiles } from '../src/vehicle/VehicleConfig';

it('automatically upshifts with hysteresis and reduces RPM after a shift', () => {
  const box = new Transmission(vehicleProfiles.sedan);
  box.update(0.1, 7, 1);
  const rpm = box.rpm;
  for (let i = 0; i < 10; i++) box.update(0.1, 8, 1);
  expect(box.gear).toBe(2);
  expect(box.rpm).toBeLessThan(rpm);
  for (let i = 0; i < 30; i++) box.update(0.1, 8, 0);
  expect(box.gear).toBe(2);
  box.update(0, 40, 1); expect(box.gear).toBe(2);
});

it('supports manual gears, protects against over-revving and interrupts torque', () => {
  const box = new Transmission(vehicleProfiles.sedan); box.mode = 'manual';
  expect(box.shift(1, 0)).toBe(true);
  expect(box.gear).toBe(2); expect(box.driveScale).toBeLessThan(0.5);
  for (let i = 0; i < 10; i++) box.update(0.1, 20, 1);
  expect(box.gear).toBe(2);
  expect(box.shift(-1, 20)).toBe(false);
  expect(box.gear).toBe(2);
  expect(box.shift(1, -2)).toBe(false);
  box.reset(); expect(box.gear).toBe(1); expect(box.mode).toBe('manual');
});

it('matches RPM ranges and gear counts to heavy vehicles and motorcycles', () => {
  const truck = new Transmission(vehicleProfiles.truck8), bike = new Transmission(vehicleProfiles.motorcycle);
  expect(truck.gears).toBe(8); expect(bike.gears).toBe(6);
  expect(truck.redline).toBeLessThan(bike.redline);
  for (let i = 0; i < 50; i++) truck.update(0.1, i * 0.4, 1);
  expect(truck.gear).toBeGreaterThan(3);
  expect(Number.isFinite(truck.rpm)).toBe(true);
});

it('recovers from high wheel speed by upshifting while protecting downshifts', () => {
  const truck = new Transmission(vehicleProfiles.semi20);
  for (let i = 0; i < 30; i++) truck.update(0.1, 10, 0.4);
  expect(truck.gear).toBe(6);
  expect(truck.rpm).toBeLessThan(truck.redline);
  expect(truck.driveScale).toBe(1);
  expect(truck.shift(-1, 15)).toBe(false);
});
