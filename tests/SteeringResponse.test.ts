import { expect, it } from 'vitest';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';

const flat = () => ({ height: 0, grip: 1 });
function create(bike = false, speed = 0) {
  const car = new VehiclePhysics(bike ? 'motorcycle' : 'sedan');
  car.reset(0, 0, 0, flat); car.ignition = 'running'; car.parked = false; car.speed = speed;
  return car;
}
function run(car: VehiclePhysics, steer: number, seconds: number, fps = 120) {
  for (let i = 0; i < Math.round(seconds * fps); i++) car.update(1 / fps, { throttle: 0, steer, handbrake: false }, flat);
}

it('blends progressive and immediate wheel response without instantly rotating the car', () => {
  const cars = [0, 0.5, 1].map(directness => {
    const car = create(); car.configureSteering({ directness }); run(car, 1, 1 / 120); return car;
  });
  expect(cars[0].steering).toBeGreaterThan(0);
  expect(cars[1].steering).toBeGreaterThan(cars[0].steering);
  expect(cars[1].steering).toBeLessThan(cars[2].steering);
  expect(cars[2].steering).toBeCloseTo(cars[2].steeringLock);
  for (const car of cars) expect(car.heading).toBe(0);
  run(cars[2], 0, 1 / 120); expect(cars[2].steering).toBe(0);
});

it('independently adjusts key-release centering and opposite-key steering speed', () => {
  const slow = create(), fast = create();
  slow.configureSteering({ returnSpeed: 0.25, reversalSpeed: 0.5 });
  fast.configureSteering({ returnSpeed: 3, reversalSpeed: 2.5 });
  for (const car of [slow, fast]) run(car, 1, 1);
  expect(slow.steering).toBeCloseTo(fast.steering);
  for (const car of [slow, fast]) run(car, 0, 0.1);
  expect(fast.steering).toBeLessThan(slow.steering);
  for (const car of [slow, fast]) { run(car, 1, 1); run(car, -1, 0.2); }
  expect(fast.steering).toBeLessThan(0); expect(slow.steering).toBeGreaterThan(0);
});

it('uses direct low-speed motorcycle steering and brief countersteering to initiate a fast lean', () => {
  const slow = create(true, 2), fast = create(true, 20);
  for (const car of [slow, fast]) { car.configureSteering({ directness: 1 }); run(car, 1, 1 / 120); }
  expect(slow.steering).toBeGreaterThan(0); expect(fast.steering).toBeLessThan(0);
  run(fast, 1, 1);
  expect(fast.roll).toBeLessThan(-0.05); expect(fast.steering).toBeGreaterThan(0); expect(fast.heading).toBeGreaterThan(0);
  run(fast, 0, 3); expect(Math.abs(fast.roll)).toBeLessThan(0.02);
});

it('limits motorcycle lean and eases the response without changing low-speed maneuverability', () => {
  const gentle = create(true, 15), agile = create(true, 15);
  gentle.configureSteering({ leanResponse: 0.5, leanLimit: 20 });
  agile.configureSteering({ leanResponse: 2, leanLimit: 45 });
  for (const car of [gentle, agile]) run(car, 1, 0.4);
  expect(Math.abs(gentle.roll)).toBeLessThan(Math.abs(agile.roll));
  run(gentle, 1, 2); expect(Math.abs(gentle.roll)).toBeLessThanOrEqual(20 * Math.PI / 180 + 0.001);
  const reverse = create(true, -2); run(reverse, 1, 0.5);
  expect(reverse.steering).toBeGreaterThan(0); expect(reverse.heading).toBeLessThan(0);
});

it.each([false, true])('keeps tuned steering frame-rate independent and clears its history on reset (motorcycle: %s)', bike => {
  const simulate = (fps: number) => {
    const car = create(bike, 20); car.configureSteering({ directness: 0.4, returnSpeed: 2, reversalSpeed: 1.5 });
    for (const steer of [1, -1, 0]) run(car, steer, 1, fps);
    return car;
  };
  const a = simulate(30), b = simulate(144);
  for (const key of ['x', 'z', 'heading', 'roll', 'steering'] as const) expect(a[key]).toBeCloseTo(b[key], 7);
  a.reset(0, 0, 0, flat); run(a, 0, 0.1); expect(a.steering).toBe(0);
});

it('reduces motorcycle lean on slippery ground and keeps its steady lean consistent with the turn', () => {
  const dry = create(true, 20), wet = create(true, 20);
  wet.gripScale = 0.25;
  for (const car of [dry, wet]) run(car, 1, 2);
  expect(Math.abs(wet.roll)).toBeLessThan(Math.abs(dry.roll));
  expect(Math.abs(dry.roll + Math.atan(dry.speed * dry.yawRate / dry.gravity)), JSON.stringify({ roll: dry.roll, yaw: dry.yawRate, speed: dry.speed, steer: dry.steering, slip: dry.slipAngle })).toBeLessThan(0.15);
  const plain = create(true, 20); plain.configureSteering({ directness: 1, countersteer: 0 });
  run(plain, 1, 1 / 120); expect(plain.steering).toBe(0);
  run(plain, 1, 1); expect(plain.heading).toBeGreaterThan(0);
});

it('bounds malformed steering configuration without overwriting valid settings', () => {
  const car = create(); car.configureSteering({ directness: 8, returnSpeed: -1, leanLimit: 70, leanResponse: NaN });
  expect(car.steeringTuning.directness).toBe(1); expect(car.steeringTuning.returnSpeed).toBe(0.25);
  expect(car.steeringTuning.leanLimit).toBe(50); expect(car.steeringTuning.leanResponse).toBe(1);
});
