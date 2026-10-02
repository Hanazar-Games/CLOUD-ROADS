import { Mesh, Raycaster, Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { ServiceMesh } from '../src/service/ServiceMesh';
import { ServicePlanner, type ServiceArea } from '../src/service/ServicePlanner';
import { ServiceTerrain, padPoint, type ServiceAccessPoint } from '../src/service/ServiceTerrain';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { accessQuads, ribbonHeight } from '../src/road/SurfaceRibbon';
import { InterchangeMesh } from '../src/road/InterchangeMesh';
import { highwayInterchange } from '../src/road/HighwayInterchange';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

const terrain = { sample: () => 20 };
const sample = new RoadSegment(new RoadGenerator('clearance', terrain).start, 0, 0, 32).sample(0);
const points: ServiceAccessPoint[] = [
  { x: 0, y: 100, z: 0, slopeX: 0.28, slopeZ: 0, halfWidth: 3.5 },
  { x: 0, y: 100.4, z: -8, slopeX: -0.28, slopeZ: -0.05, halfWidth: 3.5 },
  { x: 4, y: 101, z: -16, slopeX: 0.18, slopeZ: -0.06, halfWidth: 3.5 },
];
const access = points.slice(1).map((b, i) => ({ a: points[i], b }));

it.each(['service', 'interchange'] as const)('keeps %s concrete below the entire pavement through bank transitions and bends', kind => {
  const scene = new Scene(), ground = { pads: [], access, barriers: [], elevated: false };
  const model = kind === 'service' ? new ServiceMesh(scene, DEFAULT_OPTIONS, terrain) : new InterchangeMesh(scene);
  if (model instanceof ServiceMesh) model.update([{ id: 1, sample, start: 0, end: 32, ground }], 1, 0, 0);
  else {
    const plan = highwayInterchange('clearance', sample, { ...DEFAULT_OPTIONS, roadType: 'highway' });
    model.update([{ ...plan, ramps: [{ ...plan.ramps[0], points }], ground }], { x: 0, z: 0 }, new RoadCorridor([]), terrain);
  }
  scene.updateMatrixWorld(true);
  const material = model instanceof ServiceMesh ? model.structures.material : model.decks.material;
  const concrete = scene.children.filter(child => child instanceof Mesh && child.material === material);
  const ray = new Raycaster();
  for (const q of accessQuads(access)) for (const along of [0, 0.05, 0.5, 0.95, 1]) for (const across of [0.05, 0.5, 0.95]) {
    const x = (q.leftA.x * (1 - across) + q.rightA.x * across) * (1 - along) + (q.leftB.x * (1 - across) + q.rightB.x * across) * along;
    const z = (q.leftA.z * (1 - across) + q.rightA.z * across) * (1 - along) + (q.leftB.z * (1 - across) + q.rightB.z * across) * along;
    const y = ribbonHeight(q, x, z)!;
    ray.set(new Vector3(x, y + 3, z), new Vector3(0, -1, 0));
    const pavement = ray.intersectObject(model.pavement)[0], slab = ray.intersectObjects(concrete)[0];
    expect(pavement).toBeDefined(); expect(slab).toBeDefined();
    expect(pavement.point.y - slab.point.y).toBeGreaterThan(0.02);
    expect(pavement.point.y - slab.point.y).toBeLessThan(0.2);
  }
  model.dispose(); expect(scene.children).toHaveLength(0);
});

it('opens the service curb at the actual garage driveway on both mirrored parking pads', () => {
  const flat = { sample: () => 200 }, start = new RoadGenerator('facility-connection', flat).start;
  start.position.y = 200;
  const road = new RoadSegment(start, 0, 0, 70000);
  const samples = Array.from({ length: 35001 }, (_, i) => road.sample(i / 35000));
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const };
  const site = new ServicePlanner('facility-connection', flat, options).detect(samples).find(s => s.garages?.length)!;
  expect(site.garages).toHaveLength(2);
  const scene = new Scene(), mesh = new ServiceMesh(scene, options, flat);
  mesh.update([site], 1, 0, 0); scene.updateMatrixWorld(true);
  for (const garage of site.garages!) {
    const path = [garage.ground.access[0].a, ...garage.ground.access.map(e => e.b)];
    for (let i = 1; i < 8; i++) for (const side of [-1, 0, 1]) {
      const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      const from = new Vector3(a.x - (b.z - a.z) / length * side * 6, a.y + 0.15, a.z + (b.x - a.x) / length * side * 6);
      const direction = new Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
      expect(new Raycaster(from, direction.clone().normalize(), 0, direction.length()).intersectObject(mesh.buildings)).toHaveLength(0);
    }
    const pad = site.ground.pads.find(p => garage.id.endsWith(`:${p.side}`))!, p = padPoint(pad, pad.side * pad.halfWidth, 40, 2);
    expect(new Raycaster(new Vector3(p.x, p.y, p.z), new Vector3(0, -1, 0), 0, 2).intersectObject(mesh.buildings)[0]?.point.y)
      .toBeCloseTo(p.y - 2 + 0.28, 3);
  }
  mesh.dispose();
});

it('keeps service ramp and pad heights aligned across their full overlap', () => {
  const flat = { sample: () => 200 }, options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const };
  const start = new RoadGenerator('graded-service', flat, options).start;
  start.position.y = 200; start.grade = 0.08;
  const road = new RoadSegment(start, 0, 0.08, 22000), samples = Array.from({ length: 11001 }, (_, i) => road.sample(i / 11000));
  const site: ServiceArea = new ServicePlanner('graded-service', flat, options).detect(samples, [])[0];
  expect(site).toBeDefined();
  const ribbons = accessQuads(site.ground.access);
  let checked = 0;
  for (const pad of site.ground.pads) for (let along = -pad.halfLength + 1; along < pad.halfLength; along += 3) for (const lateral of [0.1, 2, 5]) {
    const p = padPoint(pad, -pad.side * (pad.halfWidth - lateral), along);
    for (const q of ribbons) {
      const height = ribbonHeight(q, p.x, p.z);
      if (height === undefined) continue;
      expect(Math.abs(height - p.y)).toBeLessThan(0.04); checked++;
    }
  }
  expect(checked).toBeGreaterThan(50);
  const surface = new ServiceTerrain([site.ground]);
  for (const pad of site.ground.pads) expect(surface.height(pad.x, pad.z, pad.y + 50, 100, 10)).toBeLessThan(pad.y);
});
