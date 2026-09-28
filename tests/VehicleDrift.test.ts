import { expect, it } from 'vitest';
import { VehiclePhysics, type VehicleInput } from '../src/vehicle/VehiclePhysics';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';

const flat = () => ({ height: 0, grip: 1 });
const coast = { throttle: 0, steer: 0, handbrake: false };
function create(kind: VehicleKind = 'sedan') {
  const car = new VehiclePhysics(kind); car.reset(0, 0, 0, flat);
  car.ignition = 'running'; car.parked = false; car.speed = 20; return car;
}
function run(car: VehiclePhysics, seconds: number, input: VehicleInput, fps = 120, surface = flat) {
  for (let i = 0; i < Math.round(seconds * fps); i++) car.update(1 / fps, input, surface);
}

it.each(Object.keys(vehicleProfiles) as VehicleKind[])('builds a physical handbrake slide in %s without adding kinetic energy', kind => {
  const car = create(kind), regular = create(kind);
  let lateral = 0, slip = 0, rollingSlip = 0;
  for (let i = 0; i < 240; i++) {
    car.update(1 / 120, { ...coast, steer: 0.8, handbrake: true }, flat);
    regular.update(1 / 120, { ...coast, steer: 0.8 }, flat);
    lateral = Math.max(lateral, Math.abs(car.lateralSpeed));
    slip = Math.max(slip, Math.abs(car.slipAngle)); rollingSlip = Math.max(rollingSlip, Math.abs(regular.slipAngle));
    expect(car.motionSpeed).toBeLessThanOrEqual(20);
  }
  expect(lateral).toBeGreaterThan(0.7);
  expect(slip).toBeGreaterThan(rollingSlip + 0.03);
  expect(car.motionSpeed).toBeLessThan(20);
  expect(car.heading).toBeGreaterThan(0);
  expect([car.x, car.z, car.yawRate, car.roll, car.articulation].every(Number.isFinite)).toBe(true);
});

it('keeps straight-line braking and parked handbrakes free of artificial sideways motion', () => {
  const car = create(); run(car, 6, { ...coast, handbrake: true });
  expect(car.motionSpeed).toBe(0); expect(car.heading).toBe(0); expect(car.x).toBe(0);
  car.park(); run(car, 3, { throttle: 1, steer: 1, handbrake: true });
  expect(car.motionSpeed).toBe(0); expect(car.yawRate).toBe(0); expect(car.heading).toBe(0);
});

it('recovers grip continuously after release and countersteering arrests rotation', () => {
  const car = create(); run(car, 0.55, { ...coast, steer: 0.8, handbrake: true });
  const slip = Math.abs(car.slipAngle), yaw = car.yawRate, speed = car.motionSpeed;
  car.update(1 / 120, { ...coast, steer: -1 }, flat);
  expect(Math.abs(car.slipAngle)).toBeGreaterThan(slip * 0.85);
  expect(car.motionSpeed).toBeLessThanOrEqual(speed + 0.001);
  run(car, 0.5, { ...coast, steer: -1 }); expect(car.yawRate).toBeLessThan(yaw);
  run(car, 4, coast); expect(Math.abs(car.lateralSpeed)).toBeLessThan(0.25);
  expect(Math.abs(car.yawRate)).toBeLessThan(0.05);
});

it('scales wet-road braking and slide recovery with grip, and varies rear locking strength', () => {
  const dry = create(), slippery = create(); slippery.gripScale = 0.35;
  for (const car of [dry, slippery]) car.lateralSpeed = 5;
  run(dry, 0.4, coast); run(slippery, 0.4, coast);
  expect(Math.abs(slippery.lateralSpeed)).toBeGreaterThan(Math.abs(dry.lateralSpeed) + 0.5);
  const strong = create(), gentle = create(); gentle.handbrakeStrength = 0.4;
  for (const car of [strong, gentle]) run(car, 0.8, { ...coast, steer: 0.8, handbrake: true });
  expect(Math.abs(strong.slipAngle)).toBeGreaterThan(Math.abs(gentle.slipAngle) + 0.02);
  const wet = () => ({ height: 0, grip: 0.5 });
  const a = create(), b = create(); b.gripScale = 0.5;
  run(a, 0.5, { ...coast, throttle: -1 }, 120, wet); run(b, 0.5, { ...coast, throttle: -1 }, 120, wet);
  expect(b.speed).toBeGreaterThan(a.speed + 0.5);
});

it('preserves momentum without tire contact and limits tire forces even with steering assistance disabled', () => {
  const car = create(); car.steeringAssist = false;
  const ice = () => ({ height: 0, grip: 0 });
  run(car, 1, { ...coast, steer: 1, handbrake: true }, 120, ice);
  expect(car.heading).toBe(0); expect(car.lateralSpeed).toBe(0);
  const airborne = create(); airborne.y += 50;
  run(airborne, 0.1, coast); const heading = airborne.heading, speed = airborne.motionSpeed;
  run(airborne, 0.3, { ...coast, steer: 1, handbrake: true });
  expect(airborne.heading).toBe(heading); expect(airborne.motionSpeed).toBeCloseTo(speed, 2);
});

it('uses rear contact for the handbrake and stops rear wheel rotation when locked', () => {
  const car = create(), rearIce = (_x: number, z: number) => ({ height: 0, grip: z > 0 ? 0 : 1 });
  car.update(1 / 120, { ...coast, handbrake: true }, rearIce);
  expect(car.speed).toBe(20);
  run(car, 0.3, { ...coast, handbrake: true }); const wheel = car.rearWheelAngle, front = car.wheelAngle;
  run(car, 0.1, { ...coast, handbrake: true });
  expect(car.rearWheelAngle).toBe(wheel); expect(car.wheelAngle).not.toBe(front);
  run(car, 0.5, coast); expect(car.rearWheelAngle).not.toBe(wheel);
});

it('never creates propulsion from increased grip and supports slides with countersteering assistance disabled', () => {
  const car = create(); car.gripScale = 1.5; car.speed = 0.2;
  run(car, 3, coast); expect(car.motionSpeed).toBe(0);
  const manual = create(); manual.countersteerAssist = 0;
  run(manual, 0.6, { ...coast, steer: 0.8, handbrake: true });
  expect(Math.abs(manual.slipAngle)).toBeGreaterThan(0.08);
  manual.park(); expect(manual.yawRate).toBe(0); expect(manual.tireSlip).toBe(0);
});

it('keeps drift, reversal and recovery deterministic across rendering rates and clears motion on reset', () => {
  const a = create('semi20'), b = create('semi20');
  for (const input of [{ ...coast, steer: 0.8, handbrake: true }, { ...coast, steer: -0.5 }, coast]) {
    run(a, 1, input, 30); run(b, 1, input, 144);
  }
  for (const key of ['x', 'z', 'heading', 'speed', 'lateralSpeed', 'yawRate'] as const) expect(a[key]).toBeCloseTo(b[key], 8);
  a.reset(0, 0, 0, flat); expect(a.lateralSpeed).toBe(0); expect(a.yawRate).toBe(0); expect(a.tireSlip).toBe(0);
});
