import { expect, it } from 'vitest';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { vehicleSupport } from '../src/vehicle/VehicleSolids';
import { constrainVehicle } from '../src/service/ServiceCollision';
import { WalkingPhysics } from '../src/walking/WalkingPhysics';

const flat = () => ({ height: 0, grip: 1 });
const idle = { throttle: 0, steer: 0, handbrake: false };

it('supports the convertible roof only when the actual roof is closed', () => {
  const car = new VehiclePhysics(); car.reset(0, 0, 0, flat);
  const open = vehicleSupport(car, 0, 0, 10)!;
  car.roofOpen = 0;
  expect(vehicleSupport(car, 0, 0, 10)!).toBeGreaterThan(open + 0.6);
});

it('requires a completed ignition cycle for propulsion and preserves braking and coasting when off', () => {
  const car = new VehiclePhysics(); car.reset(0, 0, 0, flat);
  for (let i = 0; i < 120; i++) car.update(1 / 60, { ...idle, throttle: 1 }, flat);
  expect(car.speed).toBe(0); expect(car.engineRpm).toBe(0);
  car.toggleIgnition(); car.update(0, idle, flat); expect(car.ignition).toBe('starting');
  for (let i = 0; i < 240; i++) car.update(1 / 60, { ...idle, throttle: 1 }, flat);
  expect(car.ignition).toBe('running'); expect(car.speed).toBeGreaterThan(5);
  const speed = car.speed; car.toggleIgnition(); car.update(0.1, { ...idle, throttle: 1 }, flat);
  expect(car.speed).toBeLessThan(speed); expect(car.speed).toBeGreaterThan(speed - 1);
  expect(car.engineRpm).toBe(0);
  for (let i = 0; i < 180; i++) car.update(1 / 60, { ...idle, throttle: -1 }, flat);
  expect(car.speed).toBe(0);
});

it('supports a hood and roof, blocks the side and keeps bridge levels separate', () => {
  const car = new VehiclePhysics('sedan'); car.reset(0, 0, 0, flat);
  const roof = vehicleSupport(car, 0, 0, 10)!;
  expect(roof).toBeGreaterThan(1); expect(roof).toBeLessThan(2);
  const hood = vehicleSupport(car, 0, -car.profile.chassisLength / 2 + 0.4, 10)!;
  expect(hood).toBeLessThan(roof); expect(vehicleSupport(car, 0, 0, 0.45)).toBeUndefined();
  const person = { x: 0, z: 0 };
  expect(constrainVehicle(person, 4, 0, 0.32, 0, car)).toBe(true);
  expect(constrainVehicle({ x: 0, z: 0 }, 4, 0, 0.32, roof, car)).toBe(false);
  expect(constrainVehicle({ x: 0, z: 0 }, 4, 0, 0.32, -8, car)).toBe(false);
});

it('keeps a jumping player on the vehicle instead of falling through or being ejected', () => {
  const car = new VehiclePhysics('supercar'); car.reset(0, 0, 0, flat);
  const person = new WalkingPhysics(); person.reset(0, 2, 0, 0); person.grounded = false;
  const surface = { sample: (x: number, z: number, ceiling = Infinity) => ({ height: vehicleSupport(car, x, z, ceiling) ?? 0 }),
    constrainWalker: (body: { x: number; y: number; z: number }, x: number, z: number) => constrainVehicle(body, x, z, 0.32, body.y, car) };
  const walking = { forward: 0, lateral: 0, run: false, sprint: false, jump: false };
  for (let i = 0; i < 240; i++) person.update(1 / 60, walking, surface);
  expect(person.grounded).toBe(true); expect(person.y).toBeCloseTo(vehicleSupport(car, 0, 0, 10)!);
  expect(person.x).toBe(0);
});

it('uses the actual low flatbed and independently sloped trailer as solid supports', () => {
  const car = new VehiclePhysics('flatbed12'); car.reset(0, 0, 0, flat);
  expect(vehicleSupport(car, 0, 3, 10)).toBeLessThan(2);
  const semi = new VehiclePhysics('semi15'); semi.reset(0, 0, 0, flat);
  semi.trailers[0]!.y = 20;
  const body = semi.bodies()[1], z = body.z - body.rear - 1;
  expect(constrainVehicle({ x: 0, z }, 5, z, 0.3, 0, semi)).toBe(false);
  expect(vehicleSupport(semi, 0, z, 30)).toBeGreaterThan(20);
});

it('jumps from the ground onto a hood, then walks off without remaining stuck to the car', () => {
  const car = new VehiclePhysics('sedan'); car.reset(0, 0, 0, flat);
  const person = new WalkingPhysics(); person.reset(-1.7, 0, -1.8, 0);
  const surface = { sample: (x: number, z: number, ceiling = Infinity) => ({ height: vehicleSupport(car, x, z, ceiling) ?? 0 }),
    constrainWalker: (body: { x: number; y: number; z: number }, x: number, z: number) => constrainVehicle(body, x, z, 0.32, body.y, car) };
  const walking = { forward: 0, lateral: 0, run: false, sprint: false, jump: false };
  for (let i = 0; i < 50; i++) person.update(1 / 60, { ...walking, lateral: 1, jump: i === 0 }, surface);
  for (let i = 0; i < 120; i++) person.update(1 / 60, walking, surface);
  expect(person.grounded).toBe(true); expect(person.y).toBeGreaterThan(0.6);
  for (let i = 0; i < 150; i++) person.update(1 / 60, { ...walking, forward: 1 }, surface);
  expect(person.y).toBe(0); expect(person.grounded).toBe(true);
});
