import { expect, it } from 'vitest';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

const flat = () => ({ height: 0, grip: 1 });
it('applies a forward speed ceiling and restores the vehicle default without changing reverse limits', () => {
  const car = new VehiclePhysics(); car.reset(0, 0, 0, flat); car.setSpeedLimit(40);
  for (let i = 0; i < 1200; i++) car.update(1 / 60, { throttle: 1, steer: 0, handbrake: false }, flat);
  expect(car.speed * 3.6).toBeCloseTo(40, 5);
  car.setSpeedLimit(300); expect(car.transmission.maxSpeed).toBeCloseTo(300 / 3.6);
  car.setSpeedLimit(NaN); expect(car.maxSpeed * 3.6).toBeCloseTo(300);
  car.speed = 70; car.update(1 / 60, { throttle: 0, steer: 0, handbrake: false }, flat);
  expect(car.speed).toBeGreaterThan(car.profile.maxSpeed);
  car.parked = false; car.speed = -50; car.update(1 / 60, { throttle: 0, steer: 0, handbrake: false }, flat);
  expect(car.speed).toBeGreaterThanOrEqual(-car.profile.reverseSpeed);
  car.setSpeedLimit(); expect(car.maxSpeed).toBe(car.profile.maxSpeed);
});

it('keeps direct high-speed steering deterministic across frame rates', () => {
  const run = (fps: number) => {
    const car = new VehiclePhysics(); car.reset(0, 0, 0, flat); car.setSpeedLimit(400);
    car.steeringAssist = false; car.parked = false; car.speed = 70;
    for (const steer of [1, -1, 0]) for (let i = 0; i < fps; i++) car.update(1 / fps, { throttle: 0, steer, handbrake: false }, flat);
    return car;
  };
  const a = run(30), b = run(144);
  for (const key of ['x', 'y', 'z', 'heading', 'speed', 'roll'] as const) expect(a[key]).toBeCloseTo(b[key], 7);
});

it('enables speed-sensitive steering by default and changes the actual path when disabled', () => {
  const simulate = (assist: boolean, strength = 1) => {
    const car = new VehiclePhysics(); car.reset(0, 0, 0, flat); expect(car.steeringAssist).toBe(true);
    car.steeringAssist = assist; car.steeringAssistStrength = strength; car.speed = 36; car.parked = false;
    for (let i = 0; i < 60; i++) car.update(1 / 120, { throttle: 0, steer: 0.5, handbrake: false }, flat);
    return car;
  };
  const normal = simulate(true), direct = simulate(false), strong = simulate(true, 2);
  expect(direct.heading).toBeGreaterThan(normal.heading * 2);
  expect(direct.steering).toBeGreaterThan(normal.steering * 2);
  expect(strong.heading).toBeLessThan(normal.heading);
  expect([direct.x, direct.y, direct.z, direct.roll].every(Number.isFinite)).toBe(true);
});

it.each([50, 200, 2000])('bounds highway mainline curvature to a minimum radius of %i m through services and junctions', highwayRadius => {
  for (const routeStyle of [0, 1, 3, 5] as const) {
    const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, highwayRadius, routeStyle, maxGrade: 0 };
    const generator = new RoadGenerator('radius-controls', { sample: () => 400 }, options);
    let point = generator.start, peak = 0;
    while (point.distance < 43000) {
      const segment = generator.next(point);
      expect(segment.sample(0).position).toEqual(point.position);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const curvature = Math.abs(segment.sample(t).curvature); peak = Math.max(peak, curvature);
        expect(curvature).toBeLessThanOrEqual(1 / highwayRadius + 1e-10);
      }
      point = segment.end;
    }
    if (routeStyle === 0) expect(peak).toBe(0);
    if (routeStyle === 5) expect(peak).toBeCloseTo(1 / highwayRadius, 6);
  }
});
