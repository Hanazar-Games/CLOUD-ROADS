import { beforeAll, expect, it } from 'vitest';
import { RoadNetwork } from '../src/road/RoadNetwork';
import { RoadSpine } from '../src/road/RoadSpine';
import { roadFrame } from '../src/road/RoadFrame';
import { roadProfile } from '../src/road/RoadProfile';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { junctionProtection } from '../src/road/JunctionProtection';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { Raycaster, Scene, Vector3 } from 'three';
import { JunctionMesh } from '../src/road/JunctionMesh';

const options = { ...DEFAULT_OPTIONS, roadType: 'mountain' as const, routeStyle: 0 as const, maxGrade: 0 };
const terrain = { sample: () => 100 }, road = new RoadSpine('protected-fork', terrain, options);
const network = new RoadNetwork('protected-fork', terrain, options, road);
beforeAll(() => {
  while (!road.advanceToDistance(24000)) { /* Build the fork approach. */ }
  const center = road.segments.find(s => s.start.distance <= 20000 && s.end.distance >= 20000)!.atDistance(20000);
  for (let i = 0; i < 30; i++) network.update(center.position.x, center.position.z, center.position.y + 1, 4000);
});

it('protects exposed main and branch edges inside a broad fork opening, while keeping the actual merge open', () => {
  const junction = network.junctions[0], ground = junctionProtection(junction, network.routes, options);
  const surface = new DrivingSurface({ seed: 'protected-fork', options, road, network, bridges: [], tunnels: [], services: [],
    connections: [{ id: -1, sample: junction.sample, start: 19900, end: 20400, ground }], groundHeight: () => -100 });
  const branch = network.routes.find(r => r.id === junction.exits[0])!.road, width = roadProfile(options).outerHalfWidth;
  const cross = (source: RoadSpine, distance: number, side: number) => {
    const p = source.segments.find(s => s.start.distance <= distance && s.end.distance >= distance)!.atDistance(distance);
    const r = roadFrame(p).right, previous = { x: p.position.x + r.x * side * (width - 1), z: p.position.z + r.z * side * (width - 1) };
    const body = { x: p.position.x + r.x * side * (width + 0.65), y: p.position.y, z: p.position.z + r.z * side * (width + 0.65) };
    return surface.constrainWalker(body, previous.x, previous.z);
  };
  expect(cross(road, junction.distance + 220, 1)).toBe(true);
  expect(cross(branch, 240, -1)).toBe(true);
  expect(cross(road, junction.distance + 65, 1)).toBe(false);
});

it('renders the solid protection and keeps a glancing car on an elevated fork', () => {
  const junction = network.junctions[0], ground = junction.protection!;
  const surface = new DrivingSurface({ seed: 'protected-fork', options, road, network, bridges: [], tunnels: [], services: [],
    connections: [{ id: -1, sample: junction.sample, start: 19900, end: 20400, ground }], groundHeight: () => -100 });
  const scene = new Scene(), mesh = new JunctionMesh(scene, options), origin = junction.sample.position;
  mesh.update([junction], network.routes, 1, origin.x, origin.z); scene.updateMatrixWorld(true);
  const p = road.segments.find(s => s.start.distance <= junction.distance + 220 && s.end.distance >= junction.distance + 220)!.atDistance(junction.distance + 220);
  const r = roadFrame(p).right, width = roadProfile(options).outerHalfWidth;
  const ray = new Raycaster(new Vector3(p.position.x - origin.x, p.position.y + 0.6, p.position.z - origin.z), new Vector3(r.x, 0, r.z), 0, width + 1);
  expect(ray.intersectObject(mesh.parts).length).toBeGreaterThan(0);
  const car = new VehiclePhysics('sedan'); surface.level = p.position.y;
  car.reset(p.position.x + r.x * (width - 1.5), p.position.z + r.z * (width - 1.5), p.heading + 0.35, surface.sample);
  car.parked = false; car.speed = 22;
  let hit = false;
  for (let i = 0; i < 30; i++) hit = car.update(1 / 60, { throttle: 0, steer: 0, handbrake: false }, surface.sample, surface.constrain) || hit;
  expect(hit).toBe(true); expect(car.y).toBeGreaterThan(p.position.y - 0.3); expect(car.speed).toBeGreaterThan(5);
  mesh.dispose(); expect(scene.children).toHaveLength(0);
});
