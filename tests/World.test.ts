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

it('pauses and cancels service searches, visits consecutive sites and replays the first location', () => {
  const scene = new Scene(), world = new World(scene, 'CLOUD-ROAD-001'), camera = new PerspectiveCamera();
  world.resetCamera(camera);
  while (!world.road.update(128, 8)) { /* Complete the initial window. */ }
  world.update(camera);
  const initial = camera.position.clone();
  world.requestServiceView();
  for (let i = 0; i < 5; i++) world.update(camera, false);
  expect(world.serviceSearchProgress).toBe(0);
  expect(camera.position).toEqual(initial);
  world.resetCamera(camera);
  expect(world.serviceSearchProgress).toBeNull();
  const visit = () => {
    world.requestServiceView();
    let frames = 0;
    while (world.serviceSearchProgress !== null && frames++ < 2000) world.update(camera);
    expect(world.serviceSearchProgress).toBeNull();
    expect(world.serviceView).toBeDefined();
    do { world.update(camera); } while (!world.roadReady && frames++ < 4000);
    expect(world.services).toHaveLength(1);
    return world.services[0];
  };
  const first = visit(), firstPosition = camera.position.clone().add({ x: world.origin.x, y: 0, z: world.origin.z });
  const second = visit();
  expect(second.sample.distance - first.sample.distance).toBeGreaterThanOrEqual(10000);
  expect(second.sample.distance - first.sample.distance).toBeLessThanOrEqual(20000);
  world.resetCamera(camera); world.update(camera);
  expect(visit()).toEqual(first);
  expect(camera.position.clone().add({ x: world.origin.x, y: 0, z: world.origin.z })).toEqual(firstPosition);
  world.dispose(); expect(scene.children).toHaveLength(0);
});

it('reports the rendered ground biome through road coupling, bridges and origin rebases', () => {
  const world = new World(new Scene(), 'CLOUD-ROAD-001', { terrain: 'forest', roadType: 'mountain', roadWidth: 8 });
  const camera = new PerspectiveCamera();
  world.resetCamera(camera);
  while (!world.road.update(128, 8)) { /* Load terrain coupling. */ }
  world.update(camera);
  const sample = world.roadSample!;
  const x = Math.round(sample.position.x / 4) * 4, z = Math.round(sample.position.z / 4) * 4;
  const cx = Math.floor(x / 256), cz = Math.floor(z / 256);
  const corridor = RoadCorridor.fromSamples(world.road.samples, world.bridges);
  const data = new TerrainGenerator(world.seed, world.options).generate(cx, cz, 64, corridor.edges);
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
  const scene = new Scene(), world = new World(scene, 'CLOUD-ROAD-001', { terrain: 'forest', roadType: 'mountain', roadWidth: 8 });
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
  const highGround = vi.spyOn(RoadCorridor.prototype, 'height').mockReturnValue(4000);
  expect(world.inspectValley(camera, 1720)).toBeUndefined();
  expect(camera.position).toEqual(local);
  highGround.mockRestore();
  world.dispose();
});

it('pauses pass searches, visits consecutive saddles and deterministically returns after cancellation', () => {
  const scene = new Scene(), world = new World(scene, 'CLOUD-ROAD-001'), camera = new PerspectiveCamera();
  world.resetCamera(camera);
  world.requestPassView();
  const home = camera.position.clone();
  world.update(camera, false);
  expect(world.passSearchProgress).toBe(0);
  expect(camera.position).toEqual(home);
  world.resetCamera(camera);
  expect(world.searching).toBe(false);
  const visit = () => {
    world.requestPassView();
    let frames = 0;
    while (world.searching && frames++ < 3000) world.update(camera);
    expect(world.searching).toBe(false);
    expect(world.serviceView).toBeDefined();
    do { world.update(camera); } while (!world.roadReady && frames++ < 6000);
    expect(world.roadReady).toBe(true);
    expect(world.routeStage).toBe('垭口');
    expect(world.passes).toHaveLength(1);
    const pass = world.passes[0];
    expect(world.tunnels.some(span => span.start.distance <= pass.distance && span.end.distance >= pass.distance)).toBe(false);
    const position = camera.position.clone().add({ x: world.origin.x, y: 0, z: world.origin.z });
    expect(position.y - world.sampleGround(position.x, position.z).height).toBeGreaterThan(30);
    return position;
  };
  const first = visit(), second = visit();
  expect(first.z - second.z).toBeGreaterThan(25000);
  world.resetCamera(camera); world.update(camera);
  expect(visit()).toEqual(first);
  world.dispose(); expect(scene.children).toHaveLength(0);
}, 20000);
