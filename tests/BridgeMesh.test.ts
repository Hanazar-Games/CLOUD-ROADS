import { Matrix4, MeshStandardMaterial, Raycaster, Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BridgeMesh } from '../src/bridge/BridgeMesh';
import { BridgeDetector, type BridgeSpan } from '../src/bridge/BridgeDetector';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { RoadSpine } from '../src/road/RoadSpine';
import { RoadMesh } from '../src/road/RoadMesh';
import { roadFrame } from '../src/road/RoadFrame';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { TerrainChunk } from '../src/terrain/TerrainChunk';
import { DEFAULT_OPTIONS, type WorldOptions } from '../src/world/WorldOptions';
import { roadProfile } from '../src/road/RoadProfile';

const fixture = () => {
  const terrain = { sample: (_x: number, z: number) => 200 - 120 * Math.sin(Math.PI * Math.max(0, Math.min(1, (-z - 100) / 600))) ** 2 };
  const start = new RoadGenerator('bridge', { sample: () => 200 }).start;
  start.position = { x: 0, y: 200, z: 0 };
  const segment = new RoadSegment(start, 0, 0, 1200);
  const samples = Array.from({ length: 301 }, (_, i) => segment.sample(i / 300));
  const bridges = new BridgeDetector(terrain).detect(samples);
  return { terrain, bridges, corridor: RoadCorridor.fromSamples(samples, bridges) };
};

describe('BridgeMesh', () => {
  it('supports the road with a solid deck, ground-connected piers and structural details', () => {
    const { terrain, bridges, corridor } = fixture(), scene = new Scene();
    const mesh = new BridgeMesh(scene);
    mesh.update(bridges, corridor, terrain, 1, 0, 0, true);
    expect(scene.children).toHaveLength(3);
    expect(mesh.details.count).toBeGreaterThan(mesh.deck.count);
    expect(mesh.deck.count).toBe((bridges[0].samples.length - 1) * 3);
    expect(mesh.pierCount).toBeGreaterThan(10);
    const matrix = new Matrix4();
    for (let i = 0; i < mesh.piers.count; i++) {
      mesh.piers.getMatrixAt(i, matrix);
      expect(matrix.elements.every(Number.isFinite)).toBe(true);
      expect(matrix.determinant()).toBeGreaterThan(0);
      if (i % 3 === 0) {
        const center = new Vector3().setFromMatrixPosition(matrix);
        expect(center.y - matrix.elements[5] / 2 + mesh.piers.position.y).toBeLessThan(terrain.sample(center.x + mesh.piers.position.x, center.z + mesh.piers.position.z));
      }
    }
    scene.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0, 201, -400), new Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh.deck)[0];
    expect(hit).toBeDefined();
    expect(hit.point.y).toBeCloseTo(199.96, 3);
    expect(hit.point.y - terrain.sample(0, -400)).toBeGreaterThan(100);
    mesh.dispose();
  });

  it('reuses buffers, rebases all structures, clears old spans and disposes shared resources', () => {
    const { terrain, bridges, corridor } = fixture(), scene = new Scene();
    const mesh = new BridgeMesh(scene);
    mesh.update(bridges, corridor, terrain, 1, 0, 0, true);
    const data = mesh.deck.instanceMatrix.array.slice(), buffer = mesh.deck.instanceMatrix;
    const x = mesh.deck.position.x, z = mesh.piers.position.z;
    mesh.update(bridges, corridor, terrain, 1, 5120, -5120, true);
    expect(mesh.deck.instanceMatrix).toBe(buffer);
    expect(mesh.deck.instanceMatrix.array).toEqual(data);
    expect(mesh.deck.position.x).toBe(x - 5120);
    expect(mesh.piers.position.z).toBe(z + 5120);
    mesh.update([], new RoadCorridor([]), terrain, 2, 5120, -5120, true);
    expect(mesh.deck.count).toBe(0);
    expect(mesh.piers.count).toBe(0);
    expect(mesh.deck.visible).toBe(false);
    const geometryDispose = vi.spyOn(mesh.deck.geometry, 'dispose');
    mesh.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(0);
  });

  it.each<[string, Readonly<WorldOptions>]>([
    ['CLOUD-ROAD-001', DEFAULT_OPTIONS], ['ROAD-TEST-002', DEFAULT_OPTIONS],
    ['CLOUD-ROAD-001', { terrain: 'desert', roadType: 'highway', roadWidth: 10 }],
    ['CLOUD-ROAD-001', { terrain: 'forest', roadType: 'highway', roadWidth: 6 }],
  ])('keeps real curved decks below asphalt and above the natural valley (%s, %j)', (seed, options) => {
    const terrain = new TerrainGenerator(seed, options), spine = new RoadSpine(seed, terrain.height, options);
    const detector = new BridgeDetector(terrain.height, options);
    let spans: BridgeSpan[] = [];
    for (let z = -1000; z >= -30_000 && !spans.length; z -= 2000) {
      while (!spine.update(z, 8)) { /* Explore until this seed reaches a complete crossing. */ }
      spans = detector.detect(spine.samples);
    }
    expect(spans.length).toBeGreaterThan(0);
    const scene = new Scene(), bridge = new BridgeMesh(scene, options), road = new RoadMesh(scene, options);
    const corridor = RoadCorridor.fromSamples(spine.samples, spans, options);
    bridge.update(spans, corridor, terrain.height, spine.version, 0, 0, true);
    road.update(spine, 0, 0, true);
    scene.updateMatrixWorld(true);
    const chunks = new Map<string, TerrainChunk>(), material = new MeshStandardMaterial();
    const ray = new Raycaster();
    for (const span of spans) for (let i = 12; i < span.samples.length - 12; i += 24) {
      const sample = span.samples[i], { right } = roadFrame(sample);
      if (sample.distance - span.start.distance < 40 || span.end.distance - sample.distance < 40) continue;
      const profile = roadProfile(options);
      for (const offset of profile.centers.flatMap(center => [center - profile.width / 2, center, center + profile.width / 2])) {
        const x = sample.position.x + right.x * offset, z = sample.position.z + right.z * offset;
        const cx = Math.floor(x / 256), cz = Math.floor(z / 256), key = `${cx},${cz}`;
        let chunk = chunks.get(key);
        if (!chunk) {
          chunk = new TerrainChunk(64, material);
          chunk.apply({ x: cx, z: cz, key, cells: 64 }, terrain.generate(cx, cz, 64, corridor.forChunk(cx, cz)), 0, 0);
          chunk.mesh.updateMatrixWorld(true);
          chunks.set(key, chunk);
        }
        ray.set(new Vector3(x, sample.position.y + 10, z), new Vector3(0, -1, 0));
        const asphalt = ray.intersectObject(road.mesh)[0], concrete = ray.intersectObject(bridge.deck)[0], ground = ray.intersectObject(chunk.mesh)[0];
        expect(asphalt).toBeDefined(); expect(concrete).toBeDefined(); expect(ground).toBeDefined();
        expect(asphalt.point.y - concrete.point.y).toBeGreaterThan(0.005);
        expect(asphalt.point.y - concrete.point.y).toBeLessThan(0.15);
        expect(concrete.point.y - ground.point.y).toBeGreaterThan(2);
        expect(Math.abs(ground.point.y - terrain.height.sample(x, z))).toBeLessThan(2);
      }
    }
    for (const chunk of chunks.values()) chunk.dispose();
    material.dispose(); road.dispose(); bridge.dispose();
  }, 30_000);
});
