import { expect, it } from 'vitest';
import { ServicePlanner, serviceTarget } from '../src/service/ServicePlanner';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { Raycaster, Scene, Vector3 } from 'three';
import { ServiceMesh } from '../src/service/ServiceMesh';
import { RoadSpine } from '../src/road/RoadSpine';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { padPoint } from '../src/service/ServiceTerrain';
import { RoadSigns } from '../src/road/RoadSigns';

const route = () => {
  const start = new RoadGenerator('services', { sample: () => 200 }).start;
  start.position.y = 200;
  const segment = new RoadSegment(start, 0, 0, 50000);
  return Array.from({ length: 25001 }, (_, i) => segment.sample(i / 25000));
};

it('spaces service areas 10–20 km apart and reproduces placement in overlapping windows', () => {
  const samples = route(), planner = new ServicePlanner('services', { sample: () => 200 });
  const sites = planner.detect(samples);
  expect(sites).toHaveLength(3);
  for (let i = 1; i < sites.length; i++) {
    expect(sites[i].sample.distance - sites[i - 1].sample.distance).toBeGreaterThanOrEqual(10000);
    expect(sites[i].sample.distance - sites[i - 1].sample.distance).toBeLessThanOrEqual(20000);
  }
  const target = serviceTarget('services', 2);
  const replay = new ServicePlanner('services', { sample: () => 200 }).detect(samples.filter(p => Math.abs(p.distance - target) < 4000));
  expect(replay).toEqual([sites[1]]);
  expect(new ServicePlanner('services', { sample: () => 200 }).detect(samples.slice(0, 1000))).toEqual([]);
});

it.each(['mountain', 'highway'] as const)('grounds %s parking and access roads without changing the main carriageway', roadType => {
  const options = { ...DEFAULT_OPTIONS, roadType }, samples = route();
  const site = new ServicePlanner('services', { sample: () => 220 }, options).detect(samples)[0];
  expect(site.ground.pads).toHaveLength(roadType === 'highway' ? 2 : 1);
  const corridor = RoadCorridor.fromSamples(samples, [], options, [], [site.ground]);
  for (const pad of site.ground.pads) {
    expect(corridor.height(pad.x, pad.z, 220)).toBeCloseTo(pad.y - 0.14, 4);
    expect(corridor.serviceCover(pad.x, pad.z)).toBe(true);
    for (const dx of [-25, 25]) for (const dz of [-60, 60]) expect(corridor.height(pad.x + dx, pad.z + dz, 220)).toBeLessThan(pad.y);
  }
  expect(corridor.height(site.sample.position.x, site.sample.position.z, 220)).toBeCloseTo(199.92, 4);
  expect(site.ground.access.length).toBeGreaterThan(20);
});

it('builds parking, buildings and access pavement, then rebases and releases every batch', () => {
  const site = new ServicePlanner('services', { sample: () => 200 }).detect(route())[0];
  const scene = new Scene(), mesh = new ServiceMesh(scene);
  mesh.update([site], 1, 0, 0);
  scene.updateMatrixWorld(true);
  const pad = site.ground.pads[0], ray = new Raycaster(new Vector3(pad.x, pad.y + 10, pad.z), new Vector3(0, -1, 0));
  const ground = ray.intersectObject(mesh.pavement)[0];
  expect(ground).toBeDefined();
  expect(ground.point.y).toBeCloseTo(pad.y, 3);
  expect(mesh.buildings.count).toBeGreaterThan(50);
  expect(mesh.lampPositions.length).toBeGreaterThan(0);
  const data = mesh.pavement.geometry.getAttribute('position').array.slice();
  mesh.update([site], 1, 5120, -5120);
  expect(mesh.pavement.geometry.getAttribute('position').array).toEqual(data);
  mesh.update([], 2, 5120, -5120);
  expect(mesh.pavement.visible).toBe(false);
  mesh.dispose();
  expect(scene.children).toHaveLength(0);
});

it.each((['alpine', 'forest', 'desert', 'dunes'] as const).flatMap(terrain =>
  (['mountain', 'highway'] as const).flatMap(roadType => [6, 8, 10].map(roadWidth => ({ terrain, roadType, roadWidth })))))(
  'keeps real $terrain $roadType $roadWidth m pavement above rendered terrain and access lanes clear', choice => {
  const seed = 'CLOUD-ROAD-001', options = { ...DEFAULT_OPTIONS, ...choice }, terrain = new HeightFunction(seed, choice.terrain);
  const spine = new RoadSpine(seed, terrain, options);
  while (!spine.advanceToDistance(serviceTarget(seed, 1) + 1000)) { /* Complete the service window. */ }
  const sites = new ServicePlanner(seed, terrain, options).detect(spine.samples), site = sites[0];
  expect(site).toBeDefined();
  const corridor = RoadCorridor.fromSamples(spine.samples, [], options, [], sites.map(site => site.ground));
  const generator = new TerrainGenerator(seed, options), chunks = new Map<string, Float32Array>();
  const ground = (x: number, z: number) => {
    const cx = Math.floor(x / 256), cz = Math.floor(z / 256), key = `${cx},${cz}`;
    if (!chunks.has(key)) chunks.set(key, generator.generate(cx, cz, 64, corridor.forChunk(cx, cz), corridor.services.forChunk(cx, cz)).positions);
    const positions = chunks.get(key)!, gx = (x - cx * 256) / 4, gz = (z - cz * 256) / 4;
    const col = Math.floor(gx), row = Math.floor(gz), tx = gx - col, tz = gz - row;
    const at = (dx: number, dz: number) => positions[((row + dz) * 65 + col + dx) * 3 + 1];
    const a = at(0, 0), b = at(1, 0), c = at(0, 1), d = at(1, 1);
    return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  };
  const scene = new Scene(), mesh = new ServiceMesh(scene, options), signs = new RoadSigns(scene, options);
  mesh.update(sites, 1, 0, 0); signs.update(spine.samples, [], sites, 1, 0, 0); scene.updateMatrixWorld(true);
  for (const pad of site.ground.pads) {
    for (const x of [-30, 0, 30]) for (const along of [-72, 0, 72]) {
      const p = padPoint(pad, x, along);
      expect(p.y - ground(p.x, p.z)).toBeGreaterThan(0.02);
    }
    for (const offset of [-2.8, 0, 2.8]) {
      const a = padPoint(pad, -pad.side * 27 + offset, -72, 1), b = padPoint(pad, -pad.side * 27 + offset, 72, 1);
      const start = new Vector3(a.x, a.y, a.z), direction = new Vector3(b.x, b.y, b.z).sub(start);
      const ray = new Raycaster(start, direction.clone().normalize(), 0, direction.length());
      expect(ray.intersectObjects([mesh.buildings, signs.posts])).toHaveLength(0);
    }
  }
  const clearances: { gap: number; distance: number; exactGap: number }[] = [];
  for (let i = 0; i < site.ground.access.length; i += 4) {
    const { a, b } = site.ground.access[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    for (const offset of [-3, 0, 3]) {
      const x = (a.x + b.x) / 2 + (a.z - b.z) / length * offset, z = (a.z + b.z) / 2 + (b.x - a.x) / length * offset;
      if (corridor.distance(x, z, 100) <= corridor.roadHalfWidth + 1) continue;
      const y = (a.y + b.y) / 2 + 0.015 + ((a.slopeX + b.slopeX) * (a.z - b.z) + (a.slopeZ + b.slopeZ) * (b.x - a.x)) / (2 * length) * offset;
      clearances.push({ gap: y - ground(x, z), distance: corridor.distance(x, z, 100), exactGap: y - corridor.height(x, z, terrain.sample(x, z)) });
    }
  }
  expect(Math.min(...clearances.map(p => p.gap)), JSON.stringify(clearances.filter(p => p.gap < 0.01))).toBeGreaterThan(0.01);
  expect(Math.max(...clearances.map(p => p.gap))).toBeLessThan(0.75);
  mesh.dispose(); signs.dispose(); expect(scene.children).toHaveLength(0);
});
