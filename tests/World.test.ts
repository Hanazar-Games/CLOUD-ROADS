import { PerspectiveCamera, Scene } from 'three';
import { expect, it, vi } from 'vitest';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { World } from '../src/world/World';

vi.mock('../src/terrain/TerrainWorkers', () => ({
  TerrainWorkers: class {
    capacity = 1;
    generate() { return new Promise(() => {}); }
    dispose() {}
  },
}));

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
  generating.mockRestore();
  const view = world.inspectBridge(camera)!;
  const corridor = RoadCorridor.fromSamples(world.road.samples, world.bridges);
  const { x, y, z } = camera.position;
  expect(y - corridor.height(x, z, world.height.sample(x, z))).toBeGreaterThanOrEqual(79.99);
  expect(Number.isFinite(view.heading) && Number.isFinite(view.pitch)).toBe(true);
  expect(view.pitch).toBeLessThan(0);
  world.dispose();
  expect(scene.children).toHaveLength(0);
});
