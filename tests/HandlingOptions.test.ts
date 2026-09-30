import { expect, it } from 'vitest';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';

const ice = () => ({ height: 0, grip: 0.15 });

it.each(Object.keys(vehicleProfiles) as VehicleKind[])('disables sliding and handbrake oversteer for %s', kind => {
  const car = new VehiclePhysics(kind);
  car.reset(0, 0, 0, ice); car.ignition = 'running'; car.parked = false;
  car.speed = 20; car.gripScale = 0.25; car.steeringAssist = false;
  car.lateralSpeed = 7; car.yawRate = 0.8; car.tireSlip = 1;
  car.driftEnabled = false;
  expect(car.lateralSpeed).toBe(0); expect(car.tireSlip).toBe(0);
  for (let i = 0; i < 120; i++) {
    car.update(1 / 60, { throttle: 0, steer: 1, handbrake: true }, ice);
    expect(car.lateralSpeed).toBe(0); expect(car.tireSlip).toBe(0); expect(car.drifting).toBe(false);
    expect(Number.isFinite(car.x + car.y + car.z)).toBe(true);
  }
  expect(car.speed).toBeLessThan(20);
});

it('sets an explicit steering radius, preserves speed assist and permits restoring factory geometry', () => {
  const car = new VehiclePhysics(); car.steeringAssist = false;
  const factory = car.steeringLock;
  car.turningRadius = 25;
  expect(car.wheelbase / Math.tan(car.steeringLock)).toBeCloseTo(25);
  car.turningRadius = 50;
  expect(car.steeringLock).toBeLessThan(factory);
  car.steeringAssist = true; car.speed = 50;
  expect(car.wheelbase / Math.tan(car.steeringLock)).toBeGreaterThan(50);
  car.turningRadius = undefined; car.steeringAssist = false;
  expect(car.steeringLock).toBe(factory);
});

it('keeps reverse steering and collision response stable with drift disabled', () => {
  const car = new VehiclePhysics(); car.reset(0, 0, 0.4, ice); car.parked = false;
  car.driftEnabled = false; car.speed = -5;
  car.update(0.1, { throttle: 0, steer: 1, handbrake: false }, ice);
  expect(car.heading).toBeLessThan(0.4);
  car.speed = 20;
  car.slideMotion(0, 0, -1, 0, 1 / 120, ice);
  expect(car.lateralSpeed).toBe(0); expect(car.motionSpeed).toBeLessThan(20);
});
