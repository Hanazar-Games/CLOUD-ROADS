import { expect, it } from 'vitest';
import { roadFrame } from '../src/road/RoadFrame';
import { RoadSpine } from '../src/road/RoadSpine';
import { roadProfile } from '../src/road/RoadProfile';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it.each(['mountain', 'highway'] as const)('supports both banked bridge rims and every rendered seam on %s roads', roadType => {
  const options = { ...DEFAULT_OPTIONS, roadType, roadWidth: 12, routeStyle: 5 as const };
  const road = new RoadSpine('bridge-seams', { sample: () => 100 }, options);
  while (!road.update(0)) { /* generate */ }
  const samples = road.samples, span = { start: samples[0], end: samples.at(-1)!, samples, depth: 200, openStart: true, openEnd: true };
  const surface = new DrivingSurface({ seed: 'bridge-seams', road, options, services: [], bridges: [span], tunnels: [], groundHeight: () => -100 });
  const profile = roadProfile(options);
  for (let i = 1; i < samples.length; i += 3) for (const center of profile.centers) for (const side of [-1, 1]) {
    const at = (j: number) => {
      const p = samples[j], right = roadFrame(p).right, offset = center + side * (profile.halfWidth + 0.25);
      return { x: p.position.x + right.x * offset, y: p.position.y + right.y * offset, z: p.position.z + right.z * offset };
    };
    const a = at(i - 1), b = at(i);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
      expect(Math.abs(surface.sample(x, z, y + 0.5).height - y)).toBeLessThan(0.05);
    }
  }
});

it('stops a fast car at the loaded bridge endpoint until the next road section exists', () => {
  const options = { ...DEFAULT_OPTIONS, routeStyle: 0 as const, maxGrade: 0 };
  const road = new RoadSpine('bridge-end', { sample: () => 100 }, options);
  while (!road.update(0)) { /* generate */ }
  const samples = road.samples, last = road.segments.at(-1)!;
  const span = { start: samples[0], end: samples.at(-1)!, samples, depth: 200, openStart: true, openEnd: true };
  const surface = new DrivingSurface({ seed: 'bridge-end', road, options, services: [], bridges: [span], tunnels: [], groundHeight: () => -100 });
  const p = last.atDistance(last.end.distance - 10), car = new VehiclePhysics('supercar');
  car.reset(p.position.x + 2, p.position.z, p.heading, surface.sample); car.parked = false; car.setSpeedLimit(400); car.speed = 100;
  let hit = false;
  for (let i = 0; i < 60; i++) hit = car.update(1 / 60, { throttle: 0, steer: 0, handbrake: false }, surface.sample, surface.constrain) || hit;
  expect(hit).toBe(true); expect(car.y).toBeGreaterThan(99); expect(car.speed).toBeLessThan(0.1);
  expect(car.trip).toBeLessThan(10);
});
