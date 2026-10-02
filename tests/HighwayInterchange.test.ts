import { expect, it } from 'vitest';
import { highwayInterchange } from '../src/road/HighwayInterchange';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { RoadSpine } from '../src/road/RoadSpine';
import { RoadNetwork } from '../src/road/RoadNetwork';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { Raycaster, Scene, Vector3 } from 'three';
import { InterchangeMesh } from '../src/road/InterchangeMesh';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { roadProfile } from '../src/road/RoadProfile';

it('keeps the full ramp width level with the carriageway until it clears the merge', () => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const };
  const center = new RoadSegment(new RoadGenerator('merge-level', { sample: () => 100 }, options).start, 0, 0).sample(0);
  const plan = highwayInterchange('merge-level', center, options), width = roadProfile(options).outerHalfWidth;
  for (const ramp of plan.ramps) for (const p of ramp.points) {
    const u = (p.x - center.position.x) * Math.cos(center.heading) + (p.z - center.position.z) * Math.sin(center.heading);
    const v = (p.x - center.position.x) * Math.sin(center.heading) - (p.z - center.position.z) * Math.cos(center.heading);
    if (Math.abs(u) < width + 4) expect(p.y).toBeCloseTo(center.position.y, 5);
    if (Math.abs(v) < width + 4) expect(p.y).toBeCloseTo(plan.upperHeight, 5);
  }
});

it.each(Array.from({ length: 8 }, (_, i) => i))('drives a long semi continuously through ramp %s', index => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, routeStyle: 0 as const, maxGrade: 0 };
  const terrain = { sample: () => 100 }, road = new RoadSpine('drive-stack', terrain, options), network = new RoadNetwork('drive-stack', terrain, options, road);
  while (!road.advanceToDistance(24000)) { /* Load the approach. */ }
  const center = road.segments.find(s => s.start.distance <= 20000 && s.end.distance >= 20000)!.atDistance(20000);
  for (let i = 0; i < 30; i++) network.update(center.position.x, center.position.z, center.position.y + 1, 4000);
  const plan = network.junctions[0].interchange!, ramp = plan.ramps[index], points = ramp.points;
  const connections = [{ id: -1, sample: center, start: 19000, end: 21000, ground: plan.ground }];
  const surface = new DrivingSurface({ seed: 'drive-stack', options, road, network, bridges: [], tunnels: [], services: [], connections, groundHeight: terrain.sample });
  const car = new VehiclePhysics('semi20'), start = points[0]; surface.level = start.y;
  car.reset(start.x, start.z, center.heading + ramp.from * Math.PI / 2, surface.sample);
  car.ignition = 'running'; car.parked = false; car.speed = 8;
  let nearest = 0, hits = 0;
  for (let frame = 0; frame < 18000 && nearest < points.length - 4; frame++) {
    while (nearest < points.length - 1 && Math.hypot(car.x - points[nearest + 1].x, car.z - points[nearest + 1].z)
      < Math.hypot(car.x - points[nearest].x, car.z - points[nearest].z)) nearest++;
    const target = points[Math.min(points.length - 1, nearest + 4)], dx = target.x - car.x, dz = target.z - car.z;
    const error = Math.atan2(Math.sin(Math.atan2(dx, -dz) - car.heading), Math.cos(Math.atan2(dx, -dz) - car.heading));
    const steer = Math.atan(2 * car.wheelbase * Math.sin(error) / Math.hypot(dx, dz)) * (1 + Math.abs(car.speed) / 28) / car.profile.steer;
    const x = car.x, z = car.z; surface.level = car.y - car.profile.radius - car.profile.rest;
    car.update(1 / 30, { throttle: car.speed < 10 ? 0.5 : 0, steer, handbrake: false }, surface.sample);
    if (surface.constrain(car, x, z)) hits++;
    expect(car.y).toBeGreaterThan(points[nearest].y - 1);
  }
  expect(nearest).toBeGreaterThanOrEqual(points.length - 4); expect(hits).toBe(0);
}, 15000);

it('builds both cross-highway directions and supports every ramp without guardrails across its mouth', () => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, routeStyle: 0 as const, maxGrade: 0 };
  const terrain = { sample: () => 100 }, road = new RoadSpine('full-interchange', terrain, options), network = new RoadNetwork('full-interchange', terrain, options, road);
  while (!road.advanceToDistance(24000)) { /* Load the full interchange window. */ }
  const center = road.segments.find(s => s.start.distance <= 20000 && s.end.distance >= 20000)!.atDistance(20000);
  for (let i = 0; i < 30; i++) network.update(center.position.x, center.position.z, center.position.y + 1, 4000);
  const junction = network.junctions[0], plan = junction.interchange!;
  const openings = road.openings.length;
  expect(plan).toBeDefined(); expect(junction.exits).toHaveLength(2);
  const connections = [{ id: -1, sample: center, start: 19400, end: 20600, ground: plan.ground }];
  const surface = new DrivingSurface({ seed: 'full-interchange', options, road, network, bridges: [], tunnels: [], services: [], connections, groundHeight: terrain.sample });
  for (const ramp of plan.ramps) {
    const car = new VehiclePhysics('semi20');
    for (let i = 1; i < ramp.points.length - 1; i += 3) {
      const a = ramp.points[i], b = ramp.points[i + 1]; surface.level = a.y;
      expect(surface.sample(a.x, a.z).height).toBeCloseTo(a.y, 1);
      car.reset(a.x, a.z, Math.atan2(b.x - a.x, a.z - b.z), surface.sample);
      expect(surface.constrain(car, car.x, car.z), `${ramp.from} ${ramp.turn} at ${i}`).toBe(false);
    }
  }
  const upper = network.routes.find(r => r.id === junction.exits[0])!;
  const point = upper.road.samples.find(p => p.distance > 900)!;
  for (let i = 0; i < 50; i++) network.update(point.position.x, point.position.z, point.position.y + 1, 4000);
  expect(network.active.id).toBe(upper.id);
  expect(upper.road.samples.at(-1)!.distance).toBeGreaterThan(4000);
  const replay = upper.road.fork();
  while (!replay.advanceToDistance(16000)) { /* Stream beyond the interchange cache. */ }
  const distant = replay.segments.find(s => s.start.distance <= 12000 && s.end.distance >= 12000)!.atDistance(12000);
  for (let i = 0; i < 200; i++) network.update(distant.position.x, distant.position.z, distant.position.y + 1, 4000);
  expect(network.junctions.some(j => j.id === junction.id)).toBe(false);
  for (let i = 0; i < 200; i++) network.update(point.position.x, point.position.z, point.position.y + 1, 4000);
  expect(network.active.id).toBe(upper.id);
  expect(network.junctions.find(j => j.id === junction.id)?.interchange).toEqual(plan);
  expect(road.openings).toHaveLength(openings);
});

it('connects all four approaches to both crossing directions with continuous one-way ramps', () => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const };
  const start = new RoadGenerator('interchange', { sample: () => 100 }, options).start;
  const center = new RoadSegment(start, 0, 0, 96).sample(0.5);
  const plan = highwayInterchange('test', center, options);
  expect(plan.ramps).toHaveLength(8); expect(plan.upperHeight - center.position.y).toBeGreaterThanOrEqual(12);
  for (let from = 0; from < 4; from++) {
    const turns = plan.ramps.filter(r => r.from === from);
    expect(turns.map(r => r.to).sort()).toEqual([(from + 1) % 4, (from + 3) % 4].sort());
    for (const ramp of turns) {
      const a = ramp.points[0], b = ramp.points.at(-1)!;
      expect(a.y).toBeCloseTo(from % 2 ? plan.upperHeight : center.position.y);
      expect(b.y).toBeCloseTo(ramp.to % 2 ? plan.upperHeight : center.position.y);
      for (let i = 1; i < ramp.points.length; i++) {
        const p = ramp.points[i - 1], q = ramp.points[i], length = Math.hypot(q.x - p.x, q.z - p.z);
        expect(length).toBeGreaterThan(0); expect(length).toBeLessThan(8);
        expect(Math.abs(q.y - p.y) / length).toBeLessThan(0.06);
      }
    }
  }
  expect(plan.ground.access.length).toBeGreaterThan(300);
  expect(plan.ground.barriers.length).toBeGreaterThan(300);
  const scene = new Scene(), model = new InterchangeMesh(scene), corridor = new RoadCorridor([], options, [plan.ground]);
  const origin = { x: 32000, z: -32000 };
  model.update([plan], origin, corridor, { sample: () => 60 }); scene.updateMatrixWorld(true);
  for (const ramp of plan.ramps) {
    const a = ramp.points[40], b = ramp.points[41];
    const ray = new Raycaster(new Vector3((a.x + b.x) / 2 - origin.x, 200, (a.z + b.z) / 2 - origin.z), new Vector3(0, -1, 0));
    const hit = ray.intersectObject(model.pavement)[0];
    expect(hit?.point.y).toBeCloseTo((a.y + b.y) / 2 + 0.015, 2);
  }
  expect(scene.children).toHaveLength(5);
  model.update([], origin, corridor, { sample: () => 60 }); expect(scene.children.every(o => !o.visible)).toBe(true);
  model.dispose(); expect(scene.children).toHaveLength(0);
});
