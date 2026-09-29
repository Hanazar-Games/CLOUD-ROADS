import { expect, it } from 'vitest';
import { Autopilot } from '../src/vehicle/Autopilot';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { RoadSpine } from '../src/road/RoadSpine';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { RoadNetwork } from '../src/road/RoadNetwork';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';

const ground = () => ({ height: 100, grip: 1 });
function setup() {
  const options = { ...DEFAULT_OPTIONS, routeStyle: 0 as const, maxGrade: 0, elevationMode: 'fixed' as const, altitudeMin: 100, altitudeMax: 100 };
  const road = new RoadSpine('AUTO', { sample: () => 100 }, options);
  while (!road.advanceToDistance(1500)) { /* Prepare a continuous test road. */ }
  const p = road.segments[1].start, car = new VehiclePhysics();
  car.reset(p.position.x + Math.cos(p.heading) * 2, p.position.z + Math.sin(p.heading) * 2, p.heading, ground);
  car.ignition = 'running';
  const routes = [{ id: 'root', road }], auto = new Autopilot();
  expect(auto.engage(car, routes, options)).toBe(true);
  return { auto, car, routes, options };
}
const manual = { throttle: 0, steer: 0, handbrake: false };

it('plans a longer stop under lunar gravity and rejects an applied trailer brake', () => {
  const earth = setup(), moon = setup(); moon.car.gravity = 1.62;
  const targets: number[] = [];
  for (const { auto, car, routes, options } of [earth, moon]) {
    car.speed = 20; car.parked = false;
    const other = new VehiclePhysics(); other.reset(car.x + Math.sin(car.heading) * 160, car.z - Math.cos(car.heading) * 160, car.heading, ground);
    auto.update(1 / 60, car, routes, [other], manual, 1); targets.push(auto.targetKmh);
    car.trailerBrake = true; expect(auto.engage(car, routes, options)).toBe(false);
  }
  expect(targets[1]).toBeLessThan(targets[0]);
});

it('refuses engagement during a slide and yields without locking rear tires if traction is lost', () => {
  const { auto, car, routes, options } = setup();
  car.speed = 15; car.parked = false; car.lateralSpeed = 5; car.tireSlip = 0.8;
  expect(auto.update(1 / 60, car, routes, [], manual, 0.3)).toEqual(manual); expect(auto.active).toBe(false);
  expect(auto.engage(car, routes, options)).toBe(false);
  car.lateralSpeed = car.tireSlip = 0; car.handbrake = 0.5; expect(auto.engage(car, routes, options)).toBe(false);
  car.handbrake = 0; expect(auto.engage(car, routes, options)).toBe(true);
});

it('holds a lane using vehicle physics and respects the configured cruise limit', () => {
  const { auto, car, routes } = setup(); auto.configure({ mode: 'full', comfort: 4, minKmh: 20, maxKmh: 45 });
  for (let i = 0; i < 1200; i++) car.update(1 / 60, auto.update(1 / 60, car, routes, [], manual, 1), ground);
  expect(auto.active).toBe(true); expect(car.speed * 3.6).toBeGreaterThan(25); expect(car.speed * 3.6).toBeLessThan(48);
  const p = routes[0].road.nearest(car.x, car.z)!;
  expect(Math.abs((car.x - p.position.x) * Math.cos(p.heading) + (car.z - p.position.z) * Math.sin(p.heading) - 2)).toBeLessThan(0.8);
});

it('brakes behind a stopped vehicle without reversing, even with a minimum cruise speed', () => {
  const { auto, car, routes } = setup();
  car.speed = 12; car.parked = false;
  const other = new VehiclePhysics(); other.reset(car.x + Math.sin(car.heading) * 60, car.z - Math.cos(car.heading) * 60, car.heading, ground);
  for (let i = 0; i < 1500; i++) car.update(1 / 60, auto.update(1 / 60, car, routes, [other], manual, 1), ground);
  expect(car.speed).toBeGreaterThanOrEqual(0); expect(car.speed).toBeLessThan(0.2);
  expect(Math.hypot(car.x - other.x, car.z - other.z)).toBeGreaterThan(car.profile.length);
  expect(auto.targetKmh).toBeLessThan(1);
});

it('separates control modes and yields immediately to braking or steering takeover', () => {
  const { auto, car, routes, options } = setup();
  auto.configure({ mode: 'speed', comfort: 3, minKmh: 0, maxKmh: 60 });
  auto.engage(car, routes, options);
  expect(auto.update(0.1, car, routes, [], { ...manual, steer: 0.7 }, 1).steer).toBe(0.7);
  expect(auto.active).toBe(true);
  auto.configure({ mode: 'steering', comfort: 3, minKmh: 0, maxKmh: 60 });
  auto.engage(car, routes, options);
  expect(auto.update(0.1, car, routes, [], { ...manual, throttle: 0.8 }, 1).throttle).toBe(0.8);
  auto.update(0.1, car, routes, [], { ...manual, throttle: -1 }, 1);
  expect(auto.active).toBe(false);
  auto.engage(car, routes, options); auto.update(0.1, car, routes, [], { ...manual, steer: 1 }, 1);
  expect(auto.active).toBe(false);
  expect(() => auto.configure({ mode: 'full', comfort: 3, minKmh: 100, maxKmh: 60 })).toThrow();
});

it.each(Object.keys(vehicleProfiles) as VehicleKind[])('keeps %s on a curved road using its own steering and suspension', kind => {
  const options = { ...DEFAULT_OPTIONS, roadWidth: 12, maxGrade: 0, elevationMode: 'fixed' as const, altitudeMin: 100, altitudeMax: 100 };
  const road = new RoadSpine('PILOT-CURVE', { sample: () => 100 }, options);
  while (!road.advanceToDistance(1800)) { /* Load the test curve. */ }
  const p = road.segments[1].start, car = new VehiclePhysics(kind), auto = new Autopilot(), routes = [{ id: 'root', road }];
  car.reset(p.position.x + Math.cos(p.heading) * 3, p.position.z + Math.sin(p.heading) * 3, p.heading, ground); car.ignition = 'running';
  auto.configure({ mode: 'full', comfort: 4, minKmh: 20, maxKmh: 65 }); expect(auto.engage(car, routes, options)).toBe(true);
  for (let i = 0; i < 2400; i++) car.update(1 / 60, auto.update(1 / 60, car, routes, [], manual, 1), ground);
  expect(auto.active, auto.status).toBe(true); expect(car.trip).toBeGreaterThan(100);
  const near = road.nearest(car.x, car.z)!;
  expect(Math.abs((car.x - near.position.x) * Math.cos(near.heading) + (car.z - near.position.z) * Math.sin(near.heading) - 3)).toBeLessThan(1.2);
});

it('continues across the root/back seam in the permitted one-way direction', () => {
  const options = { ...DEFAULT_OPTIONS, roadWidth: 5, oneWay: true, roadLanes: 1, routeStyle: 0 as const, maxGrade: 0,
    elevationMode: 'fixed' as const, altitudeMin: 100, altitudeMax: 100 };
  const terrain = { sample: () => 100 }, root = new RoadSpine('PILOT-SEAM', terrain, options), network = new RoadNetwork('PILOT-SEAM', terrain, options, root);
  for (let i = 0; i < 40; i++) network.update(128, 128, 101, 2000);
  const back = network.routes.find(r => r.id === 'back')!, sample = back.road.segments[0].atDistance(65), car = new VehiclePhysics(), auto = new Autopilot();
  car.reset(sample.position.x, sample.position.z, sample.heading + Math.PI, ground); car.ignition = 'running';
  expect(auto.engage(car, network.routes, options)).toBe(true);
  for (let i = 0; i < 1800; i++) car.update(1 / 60, auto.update(1 / 60, car, network.routes, [], manual, 1), ground);
  expect(auto.active, auto.status).toBe(true); expect(car.trip).toBeGreaterThan(180);
  expect(root.nearest(car.x, car.z)!.distance).toBeGreaterThan(100);
});

it('uses more headway and lower corner speeds at high comfort or low grip', () => {
  const { auto, car, routes, options } = setup();
  const target = (comfort: number, minKmh: number) => {
    auto.configure({ mode: 'full', comfort, minKmh, maxKmh: 80 }); auto.engage(car, routes, options);
    auto.update(1 / 60, car, routes, [], manual, 1); return auto.targetKmh;
  };
  expect(target(5, 20)).toBeLessThan(target(1, 20)); expect(target(5, 0)).toBeLessThan(target(5, 60));
  car.ignition = 'off'; expect(auto.engage(car, routes, options)).toBe(false);
});
