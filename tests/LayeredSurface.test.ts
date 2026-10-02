import { expect, it } from 'vitest';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { RoadSpine } from '../src/road/RoadSpine';
import { Garage } from '../src/garage/Garage';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { type ServiceAccessPoint } from '../src/service/ServiceTerrain';
import { accessQuads, ribbonHeight } from '../src/road/SurfaceRibbon';
import { RoadCorridor } from '../src/road/RoadCorridor';

const point = (x: number, y: number, z: number): ServiceAccessPoint => ({ x, y, z, slopeX: 0, slopeZ: 0, halfWidth: 8 });

it('supports walking above a tunnel while keeping the underground road and ceiling separate', () => {
  const road = new RoadSpine('tunnel-layers', { sample: () => 100 });
  while (!road.update(0)) { /* build */ }
  const tunnels = [{ start: road.samples[0], end: road.samples.at(-1)!, samples: road.samples, openStart: true, openEnd: true }];
  const corridor = RoadCorridor.fromSamples(road.samples, [], DEFAULT_OPTIONS, tunnels);
  const surface = new DrivingSurface({ seed: 'tunnel-layers', options: DEFAULT_OPTIONS, road, tunnels, bridges: [], services: [],
    groundHeight: (x, z, ceiling = Infinity) => ceiling >= 200 ? 200 : corridor.height(x, z, 200) });
  const sample = road.samples[100], { x, y, z } = sample.position;
  expect(surface.sample(x, z, y + 0.5).height).toBeCloseTo(y);
  expect(surface.sample(x, z, 200.5).height).toBe(200);
  expect(surface.ceiling(x, z, 200)).toBe(Infinity);
  expect(surface.ceiling(x, z, y)).toBeCloseTo(y + 4.5);
  surface.level = 200; expect(surface.inTunnel(x, z)).toBe(false);
  surface.level = y; expect(surface.inTunnel(x, z)).toBe(true);
});

it('selects the deck above a garage instead of snapping down onto its roof', () => {
  const garage = new Garage('layers', { x: 1000, y: 100, z: 0 });
  const road = new RoadSpine('layers', { sample: () => 100 });
  while (!road.update(0)) { /* build */ }
  const ground = { pads: [], barriers: [], elevated: true, access: [
    { a: point(900, 100, 0), b: point(1100, 100, 0) },
    { a: point(900, 114, 0), b: point(1100, 114, 0) },
  ] };
  const surface = new DrivingSurface({ seed: 'layers', options: DEFAULT_OPTIONS, road, garage, services: [], bridges: [], tunnels: [],
    connections: [{ id: -2, sample: road.samples[0], start: 0, end: 100, ground }], groundHeight: () => 0 });
  expect(surface.sample(1000, 0, 114.5).height).toBeCloseTo(114.015);
  expect(surface.sample(1000, 0, 100.5).height).toBeCloseTo(100, 1);
  expect(surface.ceiling(1000, 0, 100)).toBeCloseTo(112.55);
});

it('shares the entire miter joint between adjacent curved ramp segments', () => {
  const a = point(0, 100, 0), b = point(0, 101, -4), c = point(4, 102, -8);
  const [first, second] = accessQuads([{ a, b }, { a: b, b: c }]);
  expect(first.leftB).toEqual(second.leftA); expect(first.rightB).toEqual(second.rightA);
  for (let t = 0.05; t < 1; t += 0.05) {
    const x = first.leftB.x + (first.rightB.x - first.leftB.x) * t, z = first.leftB.z + (first.rightB.z - first.leftB.z) * t;
    expect(ribbonHeight(first, x, z)).toBeCloseTo(101); expect(ribbonHeight(second, x, z)).toBeCloseTo(101);
  }
});
