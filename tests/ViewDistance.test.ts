import { expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { planChunks } from '../src/world/ChunkPlanner';
import { ChunkManager } from '../src/world/ChunkManager';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { CloudSystem } from '../src/atmosphere/CloudSystem';
import { SunSystem } from '../src/atmosphere/SunSystem';
import { weatherProfiles } from '../src/atmosphere/WeatherSystem';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { VegetationMesh } from '../src/vegetation/VegetationMesh';

it.each([6, 8, 12, 16])('plans a bounded %i-chunk radius with consistent close detail', radius => {
  const plan = planChunks(128, 128, { x: 0, z: -1 }, radius);
  expect(plan).toHaveLength((radius * 2 + 1) ** 2);
  expect(new Set(plan.map(p => p.key)).size).toBe(plan.length);
  expect(plan.filter(p => p.cells === 64)).toHaveLength(25);
  expect(plan.filter(p => p.cells === 16)).toHaveLength(56);
});

it('replans distance at a stationary camera and retains the same world coordinates', () => {
  const manager = new ChunkManager(new Scene(), 'distance', { capacity: 0, generate: () => new Promise(() => {}), dispose() {} });
  const corridor = new RoadCorridor([]), forward = { x: 0, z: -1 };
  manager.update(128, 128, forward, corridor);
  expect(manager.stats.target).toBe(289);
  manager.setViewRadius(16); manager.update(128, 128, forward, corridor);
  expect(manager.stats.target).toBe(1089);
  manager.setViewRadius(6); manager.update(128, 128, forward, corridor);
  expect(manager.stats.target).toBe(169);
  expect(() => manager.setViewRadius(100)).toThrow();
  manager.dispose();
});

it('extends clear visibility with distance while keeping dense weather and cloud fog', () => {
  const clouds = new CloudSystem('distance', new SunSystem()), camera = new PerspectiveCamera();
  camera.position.y = 800;
  clouds.update(0, camera, { x: 0, z: 0 }, weatherProfiles.clear, 0, 4096);
  expect(clouds.fog.far).toBeGreaterThan(3800);
  clouds.update(0, camera, { x: 0, z: 0 }, weatherProfiles.fog, 0, 4096);
  expect(clouds.fog.far).toBe(420);
  camera.position.y = 2050;
  clouds.update(0, camera, { x: 0, z: 0 }, weatherProfiles.clear, 0, 4096);
  expect(clouds.fog.far).toBeLessThan(1000);
  clouds.dispose();
});

it('releases distant chunks after shrinking and keeps nearby vegetation within its fixed capacity', async () => {
  const generator = new TerrainGenerator('distance'), scene = new Scene();
  const data = { 8: generator.generate(0, 0, 8), 16: generator.generate(0, 0, 16), 64: generator.generate(0, 0, 64) };
  for (const value of Object.values(data)) value.vegetation = new Float32Array();
  const manager = new ChunkManager(scene, 'distance', { capacity: 4, generate: request => Promise.resolve(data[request.cells]), dispose() {} });
  const corridor = new RoadCorridor([]), forward = { x: 0, z: -1 };
  const settle = async () => {
    for (let i = 0; i < 1500; i++) {
      manager.update(128, 128, forward, corridor);
      await Promise.resolve();
      if (!manager.stats.pending && !manager.stats.queued) return;
    }
    throw new Error('View distance did not settle');
  };
  manager.setViewRadius(16); await settle();
  expect(manager.stats.active).toBe(1089);
  manager.setViewRadius(6); await settle();
  expect(manager.stats.active).toBe(169);
  expect(manager.stats.allocated).toBeLessThanOrEqual(169 + 289);
  manager.dispose(); expect(scene.children).toHaveLength(0);

  const vegetation = new VegetationMesh(scene), plants = new Float32Array(400 * 7);
  for (let i = 0; i < 400; i++) plants.set([(i % 20 + 0.5) * 12.8, 100, (Math.floor(i / 20) + 0.5) * 12.8, 1, 0, 0, 1], i * 7);
  for (let x = -16; x <= 16; x++) for (let z = -16; z <= 16; z++) vegetation.setChunk(`${x},${z}`, x, z, plants);
  vegetation.update(0, 0);
  expect(vegetation.trees.count).toBe(81 * 400);
  expect(vegetation.count).toBe(81 * 400 + (1089 - 81) * 100);
  for (const center of [12, -12, 0]) {
    vegetation.setViewCenter(center, center); vegetation.update(0, 0);
    expect(vegetation.trees.count).toBe(81 * 400);
    expect(vegetation.count).toBe(81 * 400 + ((33 - Math.abs(center)) ** 2 - 81) * 100);
  }
  vegetation.dispose(); expect(scene.children).toHaveLength(0);
});
