import { expect, it, vi } from 'vitest';
import { DoubleSide, MeshStandardMaterial, Raycaster, Scene, Vector3, type Object3D } from 'three';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { RoadCorridor, type CorridorEdge } from '../src/road/RoadCorridor';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { roadFrame } from '../src/road/RoadFrame';
import { roadProfile } from '../src/road/RoadProfile';
import { TunnelDetector } from '../src/tunnel/TunnelDetector';
import { TunnelMesh } from '../src/tunnel/TunnelMesh';
import { TerrainChunk } from '../src/terrain/TerrainChunk';
import { RoadSpine } from '../src/road/RoadSpine';
import { BridgeDetector } from '../src/bridge/BridgeDetector';

const options = { ...DEFAULT_OPTIONS, terrain: 'forest' as const };
const point = { x: 128, y: 0, z: -512, nx: 0, ny: 1, nz: 0, ground: 1, tunnel: true };
const bore: CorridorEdge[] = [{ a: point, b: { ...point, z: 768 } }];

it.each([8, 16, 64] as const)('leaves terrain and vegetation above a buried tunnel identical to the natural LOD %i landscape', cells => {
  const generator = new TerrainGenerator('tunnel-landscape', options);
  const natural = generator.generate(0, 0, cells);
  const tunnel = generator.generate(0, 0, cells, bore);
  for (const attribute of ['positions', 'normals', 'colors', 'vegetation'] as const)
    expect(tunnel[attribute]).toEqual(natural[attribute]);
  expect(tunnel.vegetation.length).toBeGreaterThan(0);
});

it('does not change the visible landscape when the buried route bends or the streaming window advances', () => {
  const generator = new TerrainGenerator('tunnel-landscape', options);
  const natural = generator.generate(0, 0, 64);
  const curved = [point, { ...point, x: 210, z: 60 }, { ...point, x: 140, z: 180 }, { ...point, x: 40, z: 600 }];
  for (const road of [bore, curved.slice(1).map((b, i) => ({ a: curved[i], b }))]) {
    const data = generator.generate(0, 0, 64, road);
    expect(data.positions).toEqual(natural.positions);
    expect(data.normals).toEqual(natural.normals);
    expect(data.vegetation).toEqual(natural.vegetation);
  }
});

it('still forms an exposed road above a separate underground route', () => {
  const generator = new TerrainGenerator('tunnel-landscape', options);
  const exposed = [{ a: { ...point, x: -128, y: 600, z: 128, tunnel: false },
    b: { ...point, x: 384, y: 600, z: 128, tunnel: false } }];
  const road = generator.generate(0, 0, 64, exposed);
  const crossing = generator.generate(0, 0, 64, [...bore, ...exposed]);
  expect(crossing.positions).toEqual(road.positions);
  expect(crossing.vegetation).toEqual(road.vegetation);
});

it.each(['mountain', 'highway'] as const)('cuts real openings in the mountain at both ends of a steep %s bore', roadType => {
  const options = { ...DEFAULT_OPTIONS, roadType, roadWidth: 12, maxGrade: 0.4 };
  const start = new RoadGenerator('mouths', { sample: () => 200 }, options).start;
  start.position = { x: 256, y: 200, z: 128 }; start.grade = 0.4;
  const segment = new RoadSegment(start, 0, 0.4, 1200);
  const samples = Array.from({ length: 601 }, (_, i) => segment.sample(i / 600));
  const terrain = { sample: (_x: number, z: number) => 200 + (128 - z) * 0.4
    + 90 * Math.sin(Math.PI * Math.max(0, Math.min(1, (128 - z - 150) / 700))) ** 2 };
  const spans = new TunnelDetector(terrain, options).detect(samples, []);
  expect(spans).toHaveLength(1);
  const corridor = RoadCorridor.fromSamples(samples, [], options, spans), generator = new TerrainGenerator('mouths', options);
  vi.spyOn(generator.height, 'sample').mockImplementation(terrain.sample);
  const material = new MeshStandardMaterial({ side: DoubleSide }), scene = new Scene(), tunnel = new TunnelMesh(scene, 'mouths', options);
  tunnel.update(spans, corridor, terrain, 1, 0, 0, true);
  const chunks = Array.from({ length: 10 }, (_, i) => {
    const x = i % 2, z = -Math.floor(i / 2), chunk = new TerrainChunk(64, material);
    chunk.apply({ x, z, cells: 64, key: `${x},${z}` }, generator.generate(x, z, 64, corridor.forChunk(x, z)), 0, 0);
    scene.add(chunk.mesh); return chunk;
  });
  scene.updateMatrixWorld(true);
  const objects: Object3D[] = [...chunks.map(c => c.mesh), tunnel.lining, tunnel.portals, tunnel.cover];
  const ray = new Raycaster(), profile = roadProfile(options), span = spans[0];
  const route = samples.filter(s => s.distance >= span.start.distance - 12 && s.distance <= span.end.distance + 12);
  for (let i = 1; i < route.length; i += 2) for (const center of profile.centers) for (const side of [-1, 0, 1]) for (const height of [1, 4.8]) {
    const position = (sample: typeof samples[0]) => {
      const { right, normal } = roadFrame(sample), p = sample.position, offset = center + side * (profile.halfWidth - 0.25);
      return new Vector3(p.x + right.x * offset + normal.x * height, p.y + right.y * offset + normal.y * height,
        p.z + right.z * offset + normal.z * height);
    };
    const a = position(route[i - 1]), direction = position(route[Math.min(i + 1, route.length - 1)]).sub(a);
    ray.set(a, direction.clone().normalize()); ray.far = direction.length();
    const hits = ray.intersectObjects(objects);
    expect(hits.map(hit => ({ part: objects.indexOf(hit.object), point: hit.point.toArray() }))).toEqual([]);
  }
  // Pooling an excavated chunk must restore the ordinary terrain topology.
  const chunk = chunks.find(c => c.mesh.geometry.index!.array instanceof Uint32Array);
  expect(chunk).toBeDefined();
  const natural = generator.generate(0, -1, 64);
  chunk!.apply({ x: 0, z: -1, cells: 64, key: '0,-1' }, natural, 0, 0);
  expect(chunk!.mesh.geometry.getAttribute('position').count).toBe(65 * 65);
  expect(chunk!.mesh.geometry.index!.count).toBe(64 * 64 * 6);
  for (const c of chunks) c.dispose();
  tunnel.dispose(); material.dispose(); vi.restoreAllMocks();
});

it.each(['mountain', 'highway'] as const)('keeps terrain out of the travel envelope along real curved %s tunnels', roadType => {
  const seed = 'CLOUD-ROAD-001', options = { ...DEFAULT_OPTIONS, roadType, roadWidth: 12 };
  const generator = new TerrainGenerator(seed, options), spine = new RoadSpine(seed, generator.height, options);
  while (!spine.update(128, 8)) { /* Complete the route window. */ }
  const bridges = new BridgeDetector(generator.height, options).detect(spine.samples);
  const spans = new TunnelDetector(generator.height, options).detect(spine.samples, bridges);
  expect(spans.length).toBeGreaterThan(0);
  const corridor = RoadCorridor.fromSamples(spine.samples, bridges, options, spans);
  const chunks = new Map<string, TerrainChunk>(), material = new MeshStandardMaterial({ side: DoubleSide });
  const profile = roadProfile(options), ray = new Raycaster();
  for (const span of spans) for (let i = 1; i < span.samples.length; i += 4) {
    const a = span.samples[i - 1], b = span.samples[Math.min(i + 3, span.samples.length - 1)];
    for (const center of profile.centers) for (const side of [-1, 0, 1]) {
      const position = (sample: typeof a) => {
        const { right, normal } = roadFrame(sample), p = sample.position, offset = center + side * (profile.halfWidth - 0.25);
        return new Vector3(p.x + right.x * offset + normal.x * 4.8, p.y + right.y * offset + normal.y * 4.8,
          p.z + right.z * offset + normal.z * 4.8);
      };
      const start = position(a), finish = position(b), direction = finish.clone().sub(start);
      for (const point of [start, finish]) {
        const x = Math.floor(point.x / 256), z = Math.floor(point.z / 256), key = `${x},${z}`;
        if (chunks.has(key)) continue;
        const chunk = new TerrainChunk(64, material);
        chunk.apply({ x, z, key, cells: 64 }, generator.generate(x, z, 64, corridor.forChunk(x, z)), 0, 0);
        chunk.mesh.updateMatrixWorld(true); chunks.set(key, chunk);
      }
      ray.set(start, direction.clone().normalize()); ray.far = direction.length();
      expect(ray.intersectObjects([...chunks.values()].map(c => c.mesh)).map(hit => hit.point.toArray())).toEqual([]);
    }
  }
  for (const chunk of chunks.values()) chunk.dispose(); material.dispose();
}, 20_000);
