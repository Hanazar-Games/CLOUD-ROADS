import { expect, it, vi } from 'vitest';
import { ServicePlanner } from '../src/service/ServicePlanner';
import { ServiceTerrain, crossoverShelter } from '../src/service/ServiceTerrain';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { RoadSpine } from '../src/road/RoadSpine';
import { ServiceMesh } from '../src/service/ServiceMesh';
import { Scene, Raycaster, Vector3 } from 'three';
import { roadProfile } from '../src/road/RoadProfile';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { serviceCrossover } from '../src/service/ServiceCrossover';

const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const };
const start = new RoadGenerator('crossover', { sample: () => 200 }).start;
start.position = { x: 0, y: 200, z: 0 }; start.heading = start.grade = 0;
const segment = new RoadSegment(start, 0, 0, 20000);
const samples = Array.from({ length: 10001 }, (_, i) => segment.sample(i / 10000));

it('restores adjacent access foundations after cutting a return ramp without burying the lower road', () => {
  const edge = (x: number, y: number) => ({ a: { x, y, z: 0, slopeX: 0, slopeZ: 0 }, b: { x, y, z: 40, slopeX: 0, slopeZ: 0 } });
  const terrain = new ServiceTerrain([{ pads: [], access: [edge(13, 20)], elevated: false, barriers: [],
    crossover: { kind: 'under', deck: 0, access: [edge(0, 0)], supports: [], barriers: [] } }]);
  expect(terrain.height(13, 20, 50, 100, 4)).toBeCloseTo(19.62);
  expect(terrain.height(0, 20, 50, 100, 4)).toBeCloseTo(-0.7);
  expect(terrain.height(13, 20, 0, 100, 4)).toBeLessThanOrEqual(5);
});

it('provides deterministic, gently graded return roads in both grade-separated directions', () => {
  const kinds = new Set<string>();
  for (let seed = 0; seed < 12; seed++) {
    const sites = new ServicePlanner(`return-${seed}`, { sample: () => 200 }, options).detect(samples);
    const site = sites[0], cross = site.ground.crossover!;
    expect(cross).toBeDefined(); kinds.add(cross.kind);
    expect(new ServicePlanner(`return-${seed}`, { sample: () => 200 }, options).detect(samples)).toEqual(sites);
    expect(cross.access[0].a.y).toBeCloseTo(200);
    expect(cross.access.at(-1)!.b.y).toBeCloseTo(200);
    expect(cross.access[0].a.x).toBeGreaterThan(0);
    expect(cross.access.at(-1)!.b.x).toBeLessThan(0);
    for (const { a, b } of cross.access) {
      expect(Math.abs(b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThanOrEqual(0.12);
      if (Math.abs(a.x) < 15) expect(Math.abs(a.y - 200)).toBeGreaterThanOrEqual(10);
    }
    const terrain = new ServiceTerrain([site.ground]);
    const point = cross.access[Math.floor(cross.access.length / 2)].a;
    const floor = terrain.height(point.x, point.z, 199.92, 0, 15);
    expect(crossoverShelter(cross, point.x, point.y + 1.7, point.z)).toBe(cross.kind === 'under' ? 1 : 0);
    expect(crossoverShelter(cross, point.x, 201.7, point.z)).toBe(0);
    if (cross.kind === 'under') expect(floor).toBeLessThan(point.y);
    else expect(floor).toBe(199.92);
  }
  expect([...kinds].sort()).toEqual(['over', 'under']);
});

it('does not connect a one-way highway to a nonexistent opposing carriageway', () => {
  const site = new ServicePlanner('return-0', { sample: () => 200 }, { ...options, oneWay: true }).detect(samples)[0];
  expect(site.ground.crossover).toBeUndefined();
});

it('rejects return ramps that intersect a service entrance at a different height', () => {
  const site = new ServicePlanner('return-0', { sample: () => 200 }, options).detect(samples)[0];
  const connections = site.ground.access.map(({ a, b }) => ({ a: { ...a, y: a.y + 3 }, b: { ...b, y: b.y + 3 } }));
  expect(serviceCrossover('return-0', site.id, site.ground.pads, samples, roadProfile(options).outerHalfWidth, connections)).toBeUndefined();
});

it.each(['return-0', 'return-1'])('keeps each deck independent and renders a continuous driveable crossing (%s)', seed => {
  const sites = new ServicePlanner(seed, { sample: () => 200 }, options).detect(samples), site = sites[0], cross = site.ground.crossover!;
  const road = new RoadSpine(seed, { sample: () => 200 }, options), terrain = new ServiceTerrain([site.ground]);
  road.segments.push(segment);
  vi.spyOn(road, 'nearest').mockImplementation((_x, z) => segment.sample(-z / 20000));
  const surface = new DrivingSurface({ seed, road, options, services: sites, bridges: [], tunnels: [], groundHeight: (x, z) => terrain.height(x, z, 199.92, Math.abs(x), 15) });
  const scene = new Scene(), mesh = new ServiceMesh(scene, options, { sample: () => 200 });
  mesh.update(sites, 1, 0, 0); scene.updateMatrixWorld(true);
  const ray = new Raycaster(), width = roadProfile(options).outerHalfWidth;
  for (const { a, b } of cross.access) {
    const p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    surface.level = p.y;
    expect(surface.sample(p.x, p.z).height).toBeCloseTo(p.y + 0.015, 1);
    expect(surface.sample(p.x, p.z, p.y + 0.3).height).toBeCloseTo(p.y + 0.015, 1);
    const body = { ...p };
    expect(surface.constrainWalker(body, a.x, a.z)).toBe(false);
    ray.set(new Vector3(p.x, p.y + 0.8, p.z), new Vector3(0, -1, 0));
    expect(ray.intersectObject(mesh.pavement)[0]?.point.y).toBeCloseTo(p.y + 0.015, 2);
    if (Math.abs(p.x) < width && Math.abs(p.x) > 3) {
      surface.level = 200; expect(surface.sample(p.x, p.z).height).toBeCloseTo(200);
      if (cross.kind === 'over') expect(surface.ceiling(p.x, p.z, 200)).toBeGreaterThan(209);
      else expect(surface.ceiling(p.x, p.z, p.y)).toBeCloseTo(cross.roof!);
    }
  }
  if (cross.kind === 'under') {
    const p = cross.access[Math.floor(cross.access.length / 2)].a;
    const corridor = RoadCorridor.fromSamples(samples, [], options, [], [site.ground]);
    expect(corridor.crossesBelow({ ...samples[0], position: { ...p, y: 200 } }, 10)).toBe(true);
  }
  const path = [cross.access[0].a, ...cross.access.map(e => e.b)], car = new VehiclePhysics('sedan');
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1], p = path[i], b = path[i + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
    surface.level = p.y;
    for (const side of [-1, 1]) expect(surface.sample(p.x + (a.z - b.z) / length * 3 * side,
      p.z + (b.x - a.x) / length * 3 * side).height).toBeCloseTo(p.y + 0.015, 1);
  }
  surface.level = path[0].y; car.reset(path[0].x + 1.6, path[0].z, 0, surface.sample); car.ignition = 'running';
  let progress = 0, collisions = 0;
  for (let frame = 0; frame < 7500 && progress < path.length - 4; frame++) {
    for (let i = progress + 1; i < Math.min(progress + 7, path.length); i++)
      if (Math.hypot(path[i].x - car.x, path[i].z - car.z) < Math.hypot(path[progress].x - car.x, path[progress].z - car.z)) progress = i;
    const target = path[Math.min(path.length - 1, progress + 3)], next = path[Math.min(path.length - 1, progress + 4)];
    const heading = Math.atan2(next.x - target.x, target.z - next.z);
    const dx = target.x + Math.cos(heading) * 1.6 - car.x, dz = target.z + Math.sin(heading) * 1.6 - car.z;
    const error = Math.atan2(Math.sin(Math.atan2(dx, -dz) - car.heading), Math.cos(Math.atan2(dx, -dz) - car.heading));
    const steer = Math.atan(2 * car.wheelbase * Math.sin(error) / Math.max(1, Math.hypot(dx, dz))) / car.steeringLock;
    surface.level = car.y - car.profile.radius - car.profile.rest;
    if (car.update(1 / 30, { throttle: Math.max(-1, Math.min(1, (5 - car.speed) * 0.9)), steer, handbrake: false }, surface.sample, surface.constrain)) collisions++;
  }
  expect(progress).toBeGreaterThanOrEqual(path.length - 4);
  expect(collisions).toBe(0);
  expect(Math.cos(car.heading)).toBeLessThan(-0.98);
  mesh.dispose(); expect(scene.children).toHaveLength(0);
}, 10000);
