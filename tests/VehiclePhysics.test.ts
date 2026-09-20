import { describe, expect, it } from 'vitest';
import { VehiclePhysics, type VehicleInput, type SurfaceSampler } from '../src/vehicle/VehiclePhysics';

const flat: SurfaceSampler = () => ({ height: 0, grip: 1 });
const idle: VehicleInput = { throttle: 0, steer: 0, handbrake: false };
const forward = { ...idle, throttle: 1 };
function run(car: VehiclePhysics, seconds: number, input = idle, surface = flat, fps = 60) {
  for (let i = 0; i < seconds * fps; i++) car.update(1 / fps, input, surface);
}
function create(surface = flat) { const car = new VehiclePhysics(); car.reset(0, 0, 0, surface); return car; }

describe('VehiclePhysics', () => {
  it('climbs and brakes on the maximum selectable 40% slope with all wheels supported', () => {
    const slope: SurfaceSampler = (_x, z) => ({ height: 400 - z * 0.4, grip: 1 });
    const car = create(slope);
    run(car, 8, forward, slope);
    expect(car.z).toBeLessThan(-30);
    expect(car.y).toBeGreaterThan(412);
    expect(car.pitch).toBeCloseTo(Math.atan(0.4), 1);
    for (const wheel of car.wheels) {
      expect(Number.isFinite(wheel.height)).toBe(true);
      expect(wheel.compression).toBeGreaterThan(0);
    }
    run(car, 4, { ...idle, handbrake: true }, slope);
    expect(car.speed).toBe(0);
    const stopped = car.z;
    run(car, 3, { ...idle, handbrake: true }, slope);
    expect(car.z).toBe(stopped);
  });

  it('accelerates, brakes without instantly reversing, then reverses at a limited speed', () => {
    const car = create();
    run(car, 4, forward);
    expect(car.speed).toBeGreaterThan(10);
    expect(car.z).toBeLessThan(-20);
    const speed = car.speed;
    run(car, 0.5, { ...idle, throttle: -1 });
    expect(car.speed).toBeGreaterThan(0);
    expect(car.speed).toBeLessThan(speed);
    run(car, 8, { ...idle, throttle: -1 });
    expect(car.speed).toBeLessThan(-1);
    expect(car.speed).toBeGreaterThanOrEqual(-8);
    run(car, 3, { ...idle, handbrake: true });
    expect(car.speed).toBe(0);
  });

  it('steers both directions and reverses steering when reversing', () => {
    const right = create(), left = create(), reverse = create();
    run(right, 3, { ...forward, steer: 1 });
    run(left, 3, { ...forward, steer: -1 });
    run(reverse, 3, { ...forward, throttle: -1, steer: 1 });
    expect(right.x).toBeGreaterThan(1);
    expect(left.x).toBeLessThan(-1);
    expect(right.heading).toBeCloseTo(-left.heading, 8);
    expect(reverse.heading).toBeLessThan(0);
  });

  it('uses fixed steps independent of rendering rate', () => {
    const a = create(), b = create();
    run(a, 5, { ...forward, steer: 0.2 }, flat, 30);
    run(b, 5, { ...forward, steer: 0.2 }, flat, 144);
    for (const field of ['x', 'y', 'z', 'speed', 'heading', 'pitch', 'roll'] as const) expect(a[field]).toBeCloseTo(b[field], 8);
  });

  it('rests on four independent contacts and damps a one-wheel bump', () => {
    const car = create(), height = car.y;
    const bump: SurfaceSampler = (x, z) => ({ height: x > 0 && z < 0 ? 0.15 : 0, grip: 1 });
    run(car, 0.3, idle, bump);
    expect(car.y).toBeGreaterThan(height);
    expect(car.pitch).toBeGreaterThan(0);
    expect(car.roll).toBeGreaterThan(0);
    expect(car.wheels[1].height).toBeCloseTo(0.49);
    expect(car.wheels[0].height).toBeCloseTo(0.34);
    run(car, 5);
    expect(car.y).toBeCloseTo(height, 3);
    expect(car.pitch).toBeCloseTo(0, 3);
    expect(car.roll).toBeCloseTo(0, 3);
  });

  it('responds to suspension tuning and holds safely after reset on a slope', () => {
    const slope: SurfaceSampler = (x, z) => ({ height: x * 0.04 - z * 0.12, grip: 1 });
    const soft = create(), firm = create();
    soft.suspension = 'soft'; firm.suspension = 'firm';
    const raised: SurfaceSampler = () => ({ height: 0.1, grip: 1 });
    run(soft, 0.15, idle, raised); run(firm, 0.15, idle, raised);
    expect(firm.y).toBeGreaterThan(soft.y);
    soft.reset(100, -200, 0, slope);
    const position = { x: soft.x, z: soft.z };
    run(soft, 5, idle, slope);
    expect(soft.x).toBe(position.x); expect(soft.z).toBe(position.z);
    expect(soft.pitch).toBeCloseTo(Math.atan(0.12), 2);
    expect(soft.roll).toBeCloseTo(Math.atan(0.04), 2);
    expect(soft.trip).toBe(0); expect(soft.speed).toBe(0);
  });

  it('limits traction on wet roads and stays finite over repeated rough contact changes', () => {
    const dry = create(), wet = create();
    run(dry, 4, forward); run(wet, 4, forward, () => ({ height: 0, grip: 0.5 }));
    expect(wet.speed).toBeLessThan(dry.speed);
    const rough: SurfaceSampler = (x, z) => ({ height: 0.2 * Math.sin(x * 2) + 0.25 * Math.sin(z * 0.7), grip: 0.5 });
    for (let i = 0; i < 60; i++) run(wet, 0.5, { throttle: i % 3 ? 1 : -1, steer: i % 2 ? 1 : -1, handbrake: i % 7 === 0 }, rough);
    for (const value of [wet.x, wet.y, wet.z, wet.pitch, wet.roll, wet.speed, ...wet.wheels.map(wheel => wheel.compression)]) expect(Number.isFinite(value)).toBe(true);
    expect(Math.abs(wet.pitch)).toBeLessThanOrEqual(0.55); expect(Math.abs(wet.roll)).toBeLessThanOrEqual(0.5);
  });
});
