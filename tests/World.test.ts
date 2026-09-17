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
  const corridor = RoadCorridor.fromSamples(world.road.samples);
  const x = camera.position.x + world.origin.x, z = camera.position.z + world.origin.z;
  const ground = corridor.height(x, z, world.height.sample(x, z));
  expect(camera.position.y - ground).toBeGreaterThanOrEqual(79.99);
  expect(view.heading).toBeCloseTo(target.heading, 8);
  expect(view.pitch).toBeCloseTo(-Math.atan2(camera.position.y - target.position.y, Math.hypot(x - target.position.x, z - target.position.z)), 8);
  world.dispose();
});
