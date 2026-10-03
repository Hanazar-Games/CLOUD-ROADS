import { expect, it } from 'vitest';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { collideVehicles } from '../src/vehicle/VehicleContact';

const car = (speed: number, z: number, kind: 'sedan' | 'truck8' = 'sedan') => {
  const value = new VehiclePhysics(kind);
  value.reset(0, z, 0, () => ({ height: 0, grip: 1 })); value.parked = false; value.speed = speed;
  return value;
};

it('transfers a rear impact using relative speed and both vehicle masses', () => {
  const a = car(20, 0), b = car(5, -4.5), momentum = a.profile.mass * a.speed + b.profile.mass * b.speed;
  expect(collideVehicles(a, b, 0, 0.3)).toBe(true);
  expect(a.speed).toBeGreaterThan(5); expect(a.speed).toBeLessThan(20); expect(b.speed).toBeGreaterThan(5);
  expect(a.profile.mass * a.speed + b.profile.mass * b.speed).toBeCloseTo(momentum, 4);
  expect(a.impact).toBeGreaterThan(10); expect(b.impact).toBeGreaterThan(10);
  expect(a.collision?.strength).toBeGreaterThan(10);
  const heavy = car(5, -6.2, 'truck8'), light = car(20, 0);
  collideVehicles(light, heavy, 0, 0.3);
  expect(heavy.speed - 5).toBeLessThan(b.speed - 5);
});

it('separates overlap without inventing impact energy for equal-speed vehicles or different decks', () => {
  const a = car(12, 0), b = car(12, -4.5);
  collideVehicles(a, b, 0, 0.2);
  expect(a.speed).toBe(12); expect(b.speed).toBe(12); expect(a.collision).toBeUndefined();
  b.y += 10; expect(collideVehicles(a, b)).toBe(false);
});

it('catches a fast sweep and preserves tangential speed in a sideswipe', () => {
  const a = car(60, -12), b = car(0, -7); b.parked = true;
  expect(collideVehicles(a, b, 0, 0)).toBe(true); expect(a.z).toBeGreaterThan(b.z);
  const side = car(20, 0), neighbor = car(20, 0); neighbor.x = 1.8; side.lateralSpeed = 2;
  expect(collideVehicles(side, neighbor, -0.2, 0)).toBe(true);
  expect(side.speed).toBeGreaterThan(19); expect(side.lateralSpeed).toBeLessThan(2);
});

it('dissipates total kinetic energy including rotation in an off-center impact', () => {
  const a = car(27, 0), b = car(4, -4.2); a.x = 0.7; a.lateralSpeed = -2; b.yawRate = 0.15;
  const energy = () => [a, b].reduce((sum, v) => sum + v.profile.mass / 2 * (v.speed ** 2 + v.lateralSpeed ** 2)
    + v.profile.mass * (v.profile.chassisLength ** 2 + v.profile.width ** 2) / 24 * v.yawRate ** 2, 0);
  const before = energy();
  expect(collideVehicles(a, b, 0.7, 0.4)).toBe(true);
  expect(energy()).toBeLessThan(before);
  expect(a.collision).toBe(b.collision);
});
