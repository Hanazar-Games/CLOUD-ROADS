import { expect, it } from 'vitest';
import { RoadSpine } from '../src/road/RoadSpine';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { RoadNetwork } from '../src/road/RoadNetwork';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { roadProfile } from '../src/road/RoadProfile';
import { roadFrame } from '../src/road/RoadFrame';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';

const flat = { sample: () => 100 };
const options = { ...DEFAULT_OPTIONS, terrain: 'meadow' as const, routeStyle: 1 as const };

it('extends an oriented road east or south and replays its geometry after returning', () => {
  const base = new RoadSpine('axis', flat, options);
  for (const heading of [Math.PI / 2, Math.PI]) {
    const road = new RoadSpine('axis', flat, options, { ...base.generator.start, heading });
    const x = 128 + Math.sin(heading) * 18000, z = 128 - Math.cos(heading) * 18000;
    for (let i = 0; i < 1000 && !road.update(road.coordinate(x, z)); i++) { /* Stream in bounded steps. */ }
    expect(road.segments.at(-1)!.end.distance).toBeGreaterThan(18000);
    const sample = road.nearest(x, z)!;
    expect(Math.abs(sample.heading - heading)).toBeLessThan(1.1);
    for (let i = 0; i < 1000 && !road.update(road.coordinate(128, 128)); i++) { /* Return to the origin. */ }
    expect(road.segments[0].start.position).toEqual(base.generator.start.position);
  }
});

it('separates interchange crossings vertically and samples the selected deck', () => {
  const highway = { ...options, roadType: 'highway' as const, routeStyle: 0 as const, maxGrade: 0.06 };
  const root = new RoadSpine('stack', flat, highway), network = new RoadNetwork('stack', flat, highway, root);
  for (let i = 0; i < 250; i++) network.update(128, 128, 101, 4000);
  const junction = network.junctions[0]; expect(junction.kind).toBe('stack');
  const branch = network.routes.find(route => route.id === junction.exits[0])!;
  const crossings = branch.road.samples.filter(sample => sample.distance > 800 && Math.hypot(sample.position.x - 128, 0) < roadProfile(highway).outerHalfWidth * 2);
  expect(crossings.length).toBeGreaterThan(4);
  for (const point of crossings) {
    const below = root.nearest(point.position.x, point.position.z)!;
    expect(point.position.y - below.position.y).toBeGreaterThan(12);
  }
  const point = crossings.reduce((a, b) => Math.abs(a.position.x - 128) < Math.abs(b.position.x - 128) ? a : b);
  const surface = new DrivingSurface({ seed: 'stack', options: highway, road: root, network, bridges: network.active.bridges, tunnels: [], services: [], sampleGround: () => ({ height: 100 }) });
  const x = 128 + roadProfile(highway).centers[1];
  surface.level = 100;
  expect(surface.sample(x, point.position.z).height).toBeCloseTo(100.12, 0);
  expect(surface.ceiling(x, point.position.z + roadProfile(highway).centers[1], 100)).toBeLessThan(point.position.y);
  surface.level = point.position.y;
  expect(surface.sample(point.position.x, point.position.z + roadProfile(highway).centers[1]).height).toBeGreaterThan(120);
});

it('returns through the start and bounds cached branches across repeated choices', () => {
  const root = new RoadSpine('journey', flat, options), network = new RoadNetwork('journey', flat, options, root);
  const settle = (p: {x:number; y:number; z:number}) => { for (let i = 0; i < 200; i++) network.update(p.x, p.z, p.y + 1, 4000); };
  settle({ x:128, y:100, z:128 });
  const back = network.routes.find(route => route.id === 'back')!;
  settle(back.road.samples[200].position);
  expect(network.active.id).toBe('back');
  settle(root.samples[200].position);
  expect(network.active.id).toBe('root');
  for (let choice = 0; choice < 8; choice++) {
    const junction = network.junctions.find(j => j.route === network.active.id)!;
    expect(junction).toBeDefined();
    const branch = network.routes.find(route => route.id === junction.exits[0])!;
    const samplePosition = { ...branch.road.samples.at(-5)!.position };
    settle(samplePosition);
    expect(network.active.id).toBe(branch.id);
    expect(network.routes.length).toBeLessThanOrEqual(7);
    const version = network.version;
    for (let i = 0; i < 20; i++) network.update(samplePosition.x, samplePosition.z, samplePosition.y + 1, 4000);
    expect(network.version).toBe(version);
  }
});

it.each([['mountain', -1, 'roadster'], ['mountain', 1, 'roadster'], ['highway', -1, 'semi20']] as const)('drives through a %s exit (%i) with %s and continues streaming', (roadType, side, kind) => {
  const settings = { ...options, roadType, routeStyle: 0 as const };
  const root = new RoadSpine('drive-fork', flat, settings), network = new RoadNetwork('drive-fork', flat, settings, root);
  for (let i = 0; i < 200; i++) network.update(128, 128, 101, 4000);
  const junction = network.junctions[0], branch = network.routes.find(route => route.id === junction.exits[side < 0 ? 0 : 1])!;
  const surface = new DrivingSurface({ seed:'drive-fork', options:settings, network, road:root, bridges:[], tunnels:[], services:[], sampleGround:()=>({height:100}) });
  const car = new VehiclePhysics(kind), lane = roadProfile(settings).centers.at(-1)! + settings.roadWidth / 4;
  const start = branch.road.samples[0], r = roadFrame(start).right;
  car.reset(start.position.x + r.x * lane, start.position.z + r.z * lane, start.heading, surface.sample);
  car.parked = false; car.speed = 10;
  let reached = 0;
  const finish = roadType === 'highway' ? 1900 : 600;
  for (let frame = 0; frame < 15000 && reached < finish; frame++) {
    const near = branch.road.nearest(car.x, car.z)!, targetDistance = near.distance + 20;
    const target = branch.road.samples.find(p => p.distance >= targetDistance)!;
    const { right } = roadFrame(target);
    const dx = target.position.x + right.x * lane - car.x, dz = target.position.z + right.z * lane - car.z;
    const error = Math.atan2(Math.sin(Math.atan2(dx, -dz) - car.heading), Math.cos(Math.atan2(dx, -dz) - car.heading));
    const steering = Math.atan(2 * car.wheelbase * Math.sin(error) / Math.hypot(dx, dz)) * (1 + Math.abs(car.speed) / 28) / car.profile.steer;
    const x = car.x, z = car.z; surface.level = car.y - car.profile.radius - car.profile.rest;
    car.update(1 / 60, { throttle:car.speed < 12 ? 0.4 : 0, steer:steering, handbrake:false }, surface.sample);
    surface.constrain(car, x, z);
    if (frame % 20 === 0) network.update(car.x, car.z, car.y, 4000);
    reached = branch.road.nearest(car.x, car.z)!.distance;
    expect(Number.isFinite(car.y)).toBe(true);
    expect(car.y).toBeGreaterThan(99);
    expect(Math.abs(car.y - branch.road.nearest(car.x, car.z)!.position.y)).toBeLessThan(3);
  }
  expect(reached).toBeGreaterThan(finish);
  expect(network.active.id).toBe(branch.id);
  expect(branch.road.samples.at(-1)!.distance).toBeGreaterThan(4000);
}, 20000);

it('starts with connected roads in both directions and activates a driven branch', () => {
  const road = new RoadSpine('network', flat, options), network = new RoadNetwork('network', flat, options, road);
  for (let i = 0; i < 500 && !network.update(128, 128, 101, 4000); i++) { /* Initial streaming. */ }
  expect(network.nearest(128, 400)!.sample.position.z).toBeGreaterThan(300);
  const fork = network.junctions[0]; expect(fork).toBeDefined();
  const branch = network.routes.find(route => route.id === fork.exits[0])!;
  const sample = branch.road.samples.at(-20)!;
  for (let i = 0; i < 500 && !network.update(sample.position.x, sample.position.z, sample.position.y + 1, 4000); i++) { /* Choose by position. */ }
  expect(network.active.id).toBe(branch.id);
  expect(network.active.road.samples.at(-1)!.distance).toBeGreaterThan(sample.distance + 1500);
});
