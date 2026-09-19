import { PerspectiveCamera, Scene } from 'three';
import { expect, it, vi } from 'vitest';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { World } from '../src/world/World';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';

vi.mock('../src/terrain/TerrainWorkers', () => ({
  TerrainWorkers: class {
    capacity = 1;
    generate() { return new Promise(() => {}); }
    dispose() {}
  },
}));

it('reports the rendered ground biome through road coupling, bridges and origin rebases', () => {
  const world = new World(new Scene(), 'CLOUD-ROAD-001');
  const camera = new PerspectiveCamera();
  world.resetCamera(camera);
  while (!world.road.update(128, 8)) { /* Load terrain coupling. */ }
  world.update(camera);
  const sample = world.roadSample!;
  const x = Math.round(sample.position.x / 4) * 4, z = Math.round(sample.position.z / 4) * 4;
  const cx = Math.floor(x / 256), cz = Math.floor(z / 256);
  const corridor = RoadCorridor.fromSamples(world.road.samples, world.bridges);
  const data = new TerrainGenerator(world.seed).generate(cx, cz, 64, corridor.edges);
  const index = (((z - cz * 256) / 4) * 65 + (x - cx * 256) / 4) * 3;
  const ground = world.sampleGround(x, z);
  expect(Math.fround(ground.height)).toBe(data.positions[index + 1]);
  expect(new Float32Array(ground.biome.color)).toEqual(data.colors.slice(index, index + 3));
  camera.position.set(6000, 6000, 128);
  world.update(camera);
  expect(world.origin.count).toBe(1);
  expect(world.sampleGround(x, z)).toEqual(ground);
  const bridge = world.bridges[0];
  const middle = bridge.samples[Math.floor(bridge.samples.length / 2)].position;
  expect(world.sampleGround(middle.x, middle.z).height).toBe(world.height.sample(middle.x, middle.z));
  world.dispose();
});

it('recognizes tunnel shelter only inside the bore, including after rebasing', () => {
  const scene = new Scene(), world = new World(scene, 'CLOUD-ROAD-001'), camera = new PerspectiveCamera();
  while (!world.road.update(128, 8)) { /* Load the initial structures. */ }
  world.update(camera);
  expect(world.inspectTunnel(camera)).toBeDefined();
  world.update(camera);
  expect(world.shelter).toBe(0);
  const span = world.tunnels[0], sample = span.samples[Math.floor(span.samples.length / 2)];
  camera.position.set(sample.position.x, sample.position.y + 3, sample.position.z);
  world.update(camera);
  expect(world.shelter).toBe(1);
  const before = world.shelter;
  world.origin.x = 5120; world.origin.z = -5120;
  camera.position.x -= world.origin.x; camera.position.z -= world.origin.z;
  world.update(camera);
  expect(world.shelter).toBe(before);
  camera.position.y += 20;
  world.update(camera);
  expect(world.shelter).toBe(0);
  world.dispose();
  expect(scene.children).toHaveLength(0);
});

it('places the hairpin overview above terrain and aims at the turn', () => {
  const world = new World(new Scene(), 'CLOUD-ROAD-001');
  const camera = new PerspectiveCamera();
  world.resetCamera(camera);
  while (!world.road.update(128, 8)) { /* Load a complete corridor. */ }
  world.update(camera);
  const target = world.road.segments.find((segment) => segment.kind === 'hairpin')!.sample(0.5);
  const view = world.inspectHairpin(camera)!;
  const corridor = RoadCorridor.fromSamples(world.road.samples, world.bridges);
  const x = camera.position.x + world.origin.x, z = camera.position.z + world.origin.z;
  const ground = corridor.height(x, z, world.height.sample(x, z));
  expect(camera.position.y - ground).toBeGreaterThanOrEqual(79.99);
  expect(view.heading).toBeCloseTo(target.heading, 8);
  expect(view.pitch).toBeCloseTo(-Math.atan2(camera.position.y - target.position.y, Math.hypot(x - target.position.x, z - target.position.z)), 8);
  world.dispose();
});

it('frames a detected bridge above terrain and releases its meshes with the world', () => {
  const scene = new Scene(), world = new World(scene, 'CLOUD-ROAD-001');
  const camera = new PerspectiveCamera();
  world.resetCamera(camera);
  while (!world.road.update(128, 8)) { /* Load bridge anchors. */ }
  world.update(camera);
  expect(world.bridges.length).toBeGreaterThan(0);
  expect(world.bridgeMesh.deck.visible).toBe(true);
  const matrix = world.bridgeMesh.deck.instanceMatrix.array.slice();
  const generating = vi.spyOn(world.road, 'update').mockReturnValue(false);
  world.update(camera);
  expect(world.bridgeMesh.deck.visible).toBe(true);
  expect(world.bridgeMesh.deck.instanceMatrix.array).toEqual(matrix);
  const position = camera.position.clone();
  expect(world.inspectRoad(camera)).toBeUndefined();
  expect(world.inspectHairpin(camera)).toBeUndefined();
  expect(world.inspectBridge(camera)).toBeUndefined();
  expect(world.inspectValley(camera, 1720)).toBeUndefined();
  expect(camera.position).toEqual(position);
  generating.mockRestore();
  world.update(camera);
  const view = world.inspectBridge(camera)!;
  const corridor = RoadCorridor.fromSamples(world.road.samples, world.bridges);
  const { x, y, z } = camera.position;
  expect(y - corridor.height(x, z, world.height.sample(x, z))).toBeGreaterThanOrEqual(79.99);
  expect(Number.isFinite(view.heading) && Number.isFinite(view.pitch)).toBe(true);
  expect(view.pitch).toBeLessThan(0);
  world.dispose();
  expect(scene.children).toHaveLength(0);
});

it('finds a safe cloud approach above coupled valley terrain, including after a rebase', () => {
  const world = new World(new Scene(), 'CLOUD-ROAD-001'), camera = new PerspectiveCamera();
  world.resetCamera(camera);
  while (!world.road.update(128, 8)) { /* Load the valley corridor. */ }
  world.update(camera);
  const view = world.inspectValley(camera, 1720);
  expect(view).toBeDefined();
  expect(camera.position.y).toBe(1720);
  expect(camera.position.y - world.sampleGround(camera.position.x, camera.position.z).height).toBeGreaterThanOrEqual(80);
  const position = camera.position.clone();
  world.origin.x = 10240;
  world.origin.z = -10240;
  camera.position.x -= world.origin.x;
  camera.position.z -= world.origin.z;
  expect(world.inspectValley(camera, 1720)).toBeDefined();
  expect(camera.position.x + world.origin.x).toBe(position.x);
  expect(camera.position.z + world.origin.z).toBe(position.z);
  const local = camera.position.clone();
  vi.spyOn(world.height, 'sample').mockReturnValue(4000);
  expect(world.inspectValley(camera, 1720)).toBeUndefined();
  expect(camera.position).toEqual(local);
  world.dispose();
});
