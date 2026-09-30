import { expect, it } from 'vitest';
import { Transmission } from '../src/vehicle/Transmission';
import { vehicleProfiles } from '../src/vehicle/VehicleConfig';

it('releases launch clutch slip progressively while retaining wheel coupling', () => {
  const box = new Transmission(vehicleProfiles.sedan); box.mode = 'manual';
  for (let i = 0; i < 120; i++) box.update(1 / 120, 2, 1);
  const loaded = box.rpm;
  box.update(1 / 120, 2, 0);
  expect(box.rpm).toBeGreaterThan(loaded - 150);
  for (let i = 0; i < 120; i++) box.update(1 / 120, 2, 0);
  expect(box.rpm).toBeLessThan(loaded - 150);
  expect(box.rpm).toBeGreaterThan(box.idle * 1.5);
});

it('locks cruise RPM to the wheels instead of adding throttle-dependent slip in a held gear', () => {
  const box = new Transmission(vehicleProfiles.sedan); box.mode = 'manual'; box.gear = 4;
  const speed = box.maxSpeed * 0.4;
  for (let i = 0; i < 50; i++) box.update(0.1, speed, 1);
  const loaded = box.rpm;
  for (let i = 0; i < 50; i++) box.update(0.1, speed, 0);
  expect(box.rpm).toBeCloseTo(loaded, 0); expect(box.fuelCut).toBe(true);
  box.update(0.1, speed, 0.5); expect(box.fuelCut).toBe(false);
});

it('holds the gear through a brief lift, coasts up after sustained release, and retains the gear under braking', () => {
  const coast = new Transmission(vehicleProfiles.sedan), braking = new Transmission(vehicleProfiles.sedan), speed = coast.maxSpeed * 0.27;
  for (let i = 0; i < 80; i++) { coast.update(0.1, speed, 1); braking.update(0.1, speed, 1); }
  const gear = coast.gear;
  for (let i = 0; i < 20; i++) coast.update(0.01, speed, 0);
  expect(coast.gear).toBe(gear);
  for (let i = 0; i < 50; i++) { coast.update(0.1, speed, 0); braking.update(0.1, speed, -1); }
  expect(coast.gear).toBeGreaterThan(gear); expect(braking.gear).toBe(gear);
});

it('makes engine inertia, shift strategy and engine braking independently tunable', () => {
  const slow = new Transmission(vehicleProfiles.sedan), fast = new Transmission(vehicleProfiles.sedan);
  slow.configure({ inertia: 2 }); fast.configure({ inertia: 0.5 });
  slow.update(0.1, 0, 1); fast.update(0.1, 0, 1); expect(fast.rpm).toBeGreaterThan(slow.rpm + 100);
  slow.configure({ shiftPoint: 1.15 }); fast.configure({ shiftPoint: 0.8 }); slow.reset(); fast.reset();
  for (let i = 0; i < 80; i++) { slow.update(0.1, slow.maxSpeed * 0.14, 1); fast.update(0.1, fast.maxSpeed * 0.14, 1); }
  expect(fast.gear).toBeGreaterThan(slow.gear);
  const brake = new Transmission(vehicleProfiles.sedan); brake.mode = 'manual'; brake.gear = 3;
  for (let i = 0; i < 40; i++) brake.update(0.1, 16, 0);
  const baseline = brake.engineBrake; brake.configure({ engineBraking: 2 }); expect(brake.engineBrake).toBeCloseTo(baseline * 2);
  brake.configure({ engineBraking: 0 }); expect(brake.engineBrake).toBe(0);
  brake.configure({ inertia: NaN, shiftSpeed: 100, coastRpm: -1 });
  expect(brake.tuning.inertia).toBe(1); expect(brake.tuning.shiftSpeed).toBe(1.5); expect(brake.tuning.coastRpm).toBe(0.3);
});

it('does not treat forward braking as accelerator load and responds to reverse throttle', () => {
  const coast = new Transmission(vehicleProfiles.truck8), brake = new Transmission(vehicleProfiles.truck8);
  coast.mode = brake.mode = 'manual';
  for (let i = 0; i < 120; i++) { coast.update(1 / 120, 0.5, 0); brake.update(1 / 120, 0.5, -1); }
  expect(brake.rpm).toBeCloseTo(coast.rpm, 8);
  for (let i = 0; i < 120; i++) brake.update(1 / 120, -0.5, -1);
  expect(brake.rpm).toBeGreaterThan(coast.rpm + 100);
});

it('smooths an upshift instead of snapping RPM to the new gear in a single step', () => {
  const box = new Transmission(vehicleProfiles.sedan); box.mode = 'manual';
  for (let i = 0; i < 120; i++) box.update(1 / 120, 6, 1);
  const before = box.rpm; expect(box.shift(1, 6)).toBe(true);
  box.update(1 / 120, 6, 1);
  expect(box.rpm).toBeGreaterThan(before - 500);
  for (let i = 0; i < 120; i++) box.update(1 / 120, 6, 1);
  expect(box.rpm).toBeLessThan(before - 700);
});

it('automatically upshifts with hysteresis and reduces RPM after a shift', () => {
  const box = new Transmission(vehicleProfiles.sedan);
  for (let i = 0; i < 120; i++) box.update(1 / 120, 6, 1);
  const rpm = box.rpm;
  for (let i = 0; i < 10; i++) box.update(0.1, 8, 1);
  expect(box.gear).toBe(2);
  expect(box.rpm).toBeLessThan(rpm);
  for (let i = 0; i < 30; i++) box.update(0.1, 8, 0);
  expect(box.gear).toBeGreaterThan(2);
  const coastGear = box.gear;
  box.update(0, 40, 1); expect(box.gear).toBe(coastGear);
});

it.each(['sedan', 'truck8', 'supercar', 'motorcycle'] as const)('settles %s into a stable unloaded cruise, then returns to idle at rest', kind => {
  const box = new Transmission(vehicleProfiles[kind]), speed = box.maxSpeed * 0.27;
  for (let i = 0; i < 80; i++) box.update(0.1, speed, 1);
  const loaded = box.rpm, gear = box.gear;
  box.update(1 / 120, speed, 0); expect(box.rpm).toBeGreaterThan(loaded * 0.9);
  for (let i = 0; i < 60; i++) box.update(0.1, speed, 0);
  expect(box.rpm).toBeLessThan(loaded * 0.75); expect(box.gear).toBeGreaterThan(gear);
  expect(box.rpm).toBeGreaterThan(box.idle);
  const shifts = box.shifts;
  for (let i = 0; i < 60; i++) box.update(0.1, speed, 0);
  expect(box.shifts).toBe(shifts);
  for (let i = 0; i < 60; i++) box.update(0.1, 0, 0);
  expect(box.rpm).toBeCloseTo(box.idle); expect(box.gear).toBe(1);
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
