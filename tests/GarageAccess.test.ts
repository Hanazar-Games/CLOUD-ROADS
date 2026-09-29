import { expect, it } from 'vitest';
import { Garage } from '../src/garage/Garage';
import { placeRoadGarage } from '../src/garage/GarageAccess';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadSpine } from '../src/road/RoadSpine';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { ServiceTerrain } from '../src/service/ServiceTerrain';
import { hasRoadBarrier } from '../src/road/RoadProtection';

it.each([0, 0.8, 2.4])('connects a rotated standalone garage to the road, excavates access and opens only its roadside (%s)', heading => {
  const start = new RoadGenerator('access', { sample: () => 100 }).start;
  start.position.y = 100; start.heading = heading;
  const segment = new RoadSegment(start, heading, 0, 3000);
  const samples = Array.from({ length: 1501 }, (_, i) => segment.sample(i / 1500));
  const garage = new Garage('access', { x: 0, y: 100, z: 0 });
  const site = placeRoadGarage(garage, samples, { sample: () => 100 }, 5, [])!;
  expect(site).toBeDefined(); expect(garage.ground.access).toHaveLength(80);
  const road = new RoadSpine('access', { sample: () => 100 });
  const surface = new DrivingSurface({ seed: 'access', options: DEFAULT_OPTIONS, road, garage, connections: [site],
    services: [], bridges: [], tunnels: [], groundHeight: () => 99 });
  const terrain = new ServiceTerrain([garage.ground]);
  let previous = garage.ground.access[0].a;
  for (const { a, b } of garage.ground.access) {
    surface.level = a.y;
    expect(surface.sample(a.x, a.z).height).toBeCloseTo(a.y, 1);
    expect(terrain.height(a.x, a.z, 180, 500, 5)).toBeLessThan(a.y);
    expect(surface.constrainWalker({ ...a }, previous.x, previous.z)).toBe(false);
    expect(Math.abs(b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.12);
    previous = a;
  }
  const end = garage.ground.access.at(-1)!.b;
  expect(garage.surface(end.x, end.z, end.y + 0.5)).toBeCloseTo(end.y);
  expect(terrain.height(end.x, end.z, 180, 500, 5)).toBeLessThan(garage.position.y - 30);
  for (let z = -80; z <= -40; z += 0.5) {
    const p = garage.point(64, z); expect(surface.sample(p.x, p.z).height).toBeCloseTo(p.y, 2);
    expect(surface.constrainWalker({ ...p }, p.x, p.z)).toBe(false);
  }
  expect(hasRoadBarrier({ seed: 'access', options: DEFAULT_OPTIONS, services: [site], bridges: [], tunnels: [] }, site.sample, 1)).toBe(false);
});
