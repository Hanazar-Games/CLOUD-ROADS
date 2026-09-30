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
import { garageInterchange } from '../src/garage/GarageInterchange';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { roadFrame } from '../src/road/RoadFrame';
import { openTunnelAccess } from '../src/tunnel/TunnelDetector';

it.each([0, 0.8, 2.4])('connects both directions to an elevated parking interchange without holes or obstructed lanes (%s)', heading => {
  const start = new RoadGenerator('access', { sample: () => 100 }).start;
  start.position.y = 100; start.heading = heading;
  const segment = new RoadSegment(start, heading, 0, 3000);
  const samples = Array.from({ length: 1501 }, (_, i) => segment.sample(i / 1500));
  const garage = new Garage('access', { x: 0, y: 100, z: 0 });
  const site = placeRoadGarage(garage, samples, { sample: () => 100 }, 5, [])!;
  expect(site).toBeDefined(); expect(site.accessWindows).toHaveLength(4);
  const { paths } = garageInterchange(garage, site.sample, samples, 5);
  expect(paths).toHaveLength(5);
  const road = new RoadSpine('access', { sample: () => 100 });
  road.segments.push(segment); road.version++;
  const surface = new DrivingSurface({ seed: 'access', options: DEFAULT_OPTIONS, road, garage, connections: [site],
    services: [], bridges: [], tunnels: [], groundHeight: () => 99 });
  const terrain = new ServiceTerrain([garage.ground]);
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const a = path[i], b = path[i - 1];
    surface.level = a.y;
    expect(surface.sample(a.x, a.z).height).toBeCloseTo(a.y, 1);
    expect(terrain.height(a.x, a.z, 180, 500, 5)).toBeLessThan(a.y);
    expect(surface.constrainWalker({ ...a }, b.x, b.z), `path ${paths.indexOf(path)}, point ${i}`).toBe(false);
    expect(Math.abs(b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.12);
  }
  const end = paths[0].at(-1)!;
  expect(garage.surface(end.x, end.z, end.y + 0.5)).toBeCloseTo(end.y);
  expect(terrain.height(end.x, end.z, 180, 500, 5)).toBeLessThan(garage.position.y - 30);
  for (let z = -80; z <= -40; z += 0.5) {
    const p = garage.point(64, z); expect(Math.abs(surface.sample(p.x, p.z).height - p.y)).toBeLessThan(0.02);
    expect(surface.constrainWalker({ ...p }, p.x, p.z)).toBe(false);
  }
  const context = { seed: 'access', options: DEFAULT_OPTIONS, services: [site], bridges: [{ start: samples[0], end: samples.at(-1)! }], tunnels: [] };
  for (const opening of site.accessWindows!) {
    expect(hasRoadBarrier(context, { ...site.sample, distance: (opening.start + opening.end) / 2 }, opening.side)).toBe(false);
    expect(hasRoadBarrier(context, { ...site.sample, distance: opening.end + 4 }, opening.side)).toBe(true);
  }
  expect(hasRoadBarrier(context, site.sample, 1)).toBe(true);
  expect(surface.ceiling(site.sample.position.x, site.sample.position.z, 100)).toBeCloseTo(112.55);
});

it.each(['GARAGE-RAMP-55', 'GARAGE-49', 'GARAGE-PRESET'])('finds a safe interchange site in the generated world %s', seed => {
  const terrain = new HeightFunction(seed), road = new RoadSpine(seed, terrain);
  while (!road.update(128, 16, 4500)) { /* generate */ }
  const garage = new Garage(seed, { x: 0, y: 100, z: 0 });
  const site = placeRoadGarage(garage, road.samples, terrain, 5, []);
  expect(site).toBeDefined(); expect(site!.accessWindows).toHaveLength(4);
  const surface = new DrivingSurface({ seed, options: DEFAULT_OPTIONS, road, garage, connections: [site!], services: [], bridges: [], tunnels: [], groundHeight: () => 0 });
  for (const [i, { a, b }] of garage.ground.access.entries()) {
    surface.level = a.y;
    expect(surface.sample(a.x, a.z, a.y + 0.3).height).toBeCloseTo(a.y, 1);
    expect(Math.abs(b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.18);
    if (i > 0) expect(surface.constrainWalker({ ...b }, a.x, a.z), `edge ${i}, distance ${road.nearest(b.x, b.z)?.distance}, windows ${JSON.stringify(site!.accessWindows)}`).toBe(false);
    const near = road.nearest(a.x, a.z)!;
    const normal = roadFrame(near).normal, plane = near.position.y - (normal.x * (a.x - near.position.x) + normal.z * (a.z - near.position.z)) / normal.y;
    if (Math.hypot(a.x - near.position.x, a.z - near.position.z) < 8.5)
      expect(Math.abs(a.y - plane) < 0.2 || a.y - plane > 8, `clearance ${i}`).toBe(true);
  }
});

it('opens the tunnel envelope around ramps while preserving the tunnel before and after the interchange', () => {
  const start = new RoadGenerator('tunnel-access', { sample: () => 100 }).start;
  const segment = new RoadSegment(start, 0, 0, 3000);
  const samples = Array.from({ length: 1501 }, (_, i) => segment.sample(i / 1500));
  const spans = [{ start: samples[0], end: samples.at(-1)!, samples, entrance: 0, exit: 3000, length: 3000 }];
  const windows = [{ start: 600, end: 800 }, { start: 2000, end: 2200 }];
  const cut = openTunnelAccess(spans, windows);
  expect(cut).toHaveLength(3); expect(cut[0].start).toBe(samples[0]); expect(cut.at(-1)!.end).toBe(samples.at(-1));
  for (const span of cut) {
    expect(span.length).toBeCloseTo(span.end.distance - span.start.distance);
    for (const p of span.samples) expect(windows.some(w => p.distance >= w.start - 24 && p.distance <= w.end + 24)).toBe(false);
  }
  expect(openTunnelAccess(cut, windows)).toEqual(cut);
});
