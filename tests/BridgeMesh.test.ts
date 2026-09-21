import { Color, Matrix4, MeshStandardMaterial, Raycaster, Scene, Vector3 } from 'three';
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
  it('seats bearings against the girder and cap on both sides of a banked bridge', () => {
    const terrain = { sample: () => 20 }, start = new RoadGenerator('bearing', { sample: () => 200 }).start;
    const segment = new RoadSegment(start, 0, 0, 576);
    const samples = Array.from({ length: 145 }, (_, i) => ({ ...segment.sample(i / 144), bank: 0.12 }));
    const spans = new BridgeDetector(terrain).detect(samples), scene = new Scene(), mesh = new BridgeMesh(scene);
    mesh.update(spans, RoadCorridor.fromSamples(samples, spans), terrain, 1, 0, 0, true);
    scene.updateMatrixWorld(true);
    const matrix = new Matrix4(), ray = new Raycaster(), normal = new Vector3().copy(roadFrame(samples[0]).normal);
    let bearings = 0;
    for (let i = 0; i < mesh.details.count; i++) {
      mesh.details.getMatrixAt(i, matrix);
      if (Math.abs(new Vector3().setFromMatrixColumn(matrix, 1).length() - 0.5) > 0.001) continue;
      const center = new Vector3().setFromMatrixPosition(matrix).add(mesh.details.position);
      ray.set(center.clone().addScaledVector(normal, 0.249), normal);
      expect(ray.intersectObject(mesh.deck)[0]?.distance ?? Infinity).toBeLessThan(0.025);
      ray.set(center.clone().addScaledVector(normal, -0.249), normal.clone().negate());
      expect(ray.intersectObject(mesh.piers)[0]?.distance ?? Infinity).toBeLessThan(0.025);
      bearings++;
    }
    expect(bearings).toBeGreaterThan(4);
    mesh.dispose();
  });

  it('keeps the same pier spacing at every height and gives high bridges red steel railings', () => {
    const counts: number[] = [];
    for (const height of [50, 50.01, 100, 100.01, 350]) {
      const terrain = { sample: () => 200 - height };
      const start = new RoadGenerator('tiers', { sample: () => 200 }).start;
      start.position = { x: 0, y: 200, z: 0 };
      const segment = new RoadSegment(start, 0, 0, 2304);
      const samples = Array.from({ length: 1153 }, (_, i) => segment.sample(i / 1152));
      const spans = new BridgeDetector(terrain).detect(samples), mesh = new BridgeMesh(new Scene());
      mesh.update(spans, RoadCorridor.fromSamples(samples, spans), terrain, 1, 0, 0, true);
      counts.push(mesh.pierCount);
      expect(mesh.railings.count).toBeGreaterThan(1000);
      const color = new Color(); mesh.railings.getColorAt(0, color);
      if (height > 100) expect(color.r).toBeGreaterThan(color.g * 2);
      else expect(Math.abs(color.r - color.g)).toBeLessThan(0.15);
      mesh.dispose();
    }
    expect(counts).toEqual([48, 48, 48, 48, 48]);
  });

  it('anchors tall piers to absolute mileage when either bridge end is outside the loaded window', () => {
    const terrain = { sample: () => 50 }, start = new RoadGenerator('tall', { sample: () => 200 }).start;
    start.position = { x: 0, y: 200, z: 0 };
    const segment = new RoadSegment(start, 0, 0, 2400);
    const samples = Array.from({ length: 601 }, (_, i) => segment.sample(i / 600));
    const detector = new BridgeDetector(terrain), mesh = new BridgeMesh(new Scene());
    const foundations = (window: typeof samples, version: number) => {
      const spans = detector.detect(window);
      mesh.update(spans, RoadCorridor.fromSamples(window, spans), terrain, version, 0, 0, true);
      const result: number[] = [], matrix = new Matrix4();
      for (let i = 0; i < mesh.piers.count; i++) {
        mesh.piers.getMatrixAt(i, matrix);
        if (matrix.elements[13] < 55) {
          const z = matrix.elements[14] + mesh.piers.position.z;
          if (z < -200 && z > -2000) result.push(z);
        }
      }
      return result;
    };
    const before = foundations(samples, 1);
    expect(before.length).toBeGreaterThan(35);
    expect(before.length).toBeLessThan(40);
    expect(mesh.columns.count).toBe(mesh.pierCount);
    const shaft = new Matrix4();
    mesh.columns.getMatrixAt(0, shaft);
    expect(shaft.elements[5] / shaft.elements[0]).toBeLessThan(90);
    const vertices = mesh.columns.geometry.getAttribute('position');
    let base = 0, crown = 0;
    for (let i = 0; i < vertices.count; i++) {
      if (vertices.getY(i) < 0) base = Math.max(base, Math.abs(vertices.getX(i)));
      else crown = Math.max(crown, Math.abs(vertices.getX(i)));
    }
    expect(base).toBeGreaterThan(crown * 1.3);
    expect(foundations(samples.slice(17, -23), 2)).toEqual(before);
    mesh.dispose();
  });

  it('supports the road with a solid deck, ground-connected piers and structural details', () => {
    const { terrain, bridges, corridor } = fixture(), scene = new Scene();
    const mesh = new BridgeMesh(scene);
    mesh.update(bridges, corridor, terrain, 1, 0, 0, true);
    expect(scene.children).toHaveLength(12);
    expect(mesh.railings.count).toBeGreaterThan(mesh.parapets.count);
    expect(mesh.parapets.count).toBe((bridges[0].samples.length - 1) * 2);
    expect(mesh.pierCount).toBeGreaterThan(5);
    const matrix = new Matrix4();
    for (let i = 0; i < mesh.piers.count; i++) {
      mesh.piers.getMatrixAt(i, matrix);
      expect(matrix.elements.every(Number.isFinite)).toBe(true);
      expect(matrix.determinant()).toBeGreaterThan(0);
      if (matrix.elements[5] === 3) {
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
    const buffer = mesh.deck.geometry.getAttribute('position'), data = buffer.array.slice();
    const x = mesh.deck.position.x, z = mesh.piers.position.z;
    mesh.update(bridges, corridor, terrain, 1, 5120, -5120, true);
    expect(mesh.deck.geometry.getAttribute('position')).toBe(buffer);
    expect(mesh.deck.geometry.getAttribute('position').array).toEqual(data);
    expect(mesh.deck.position.x).toBe(x - 5120);
    expect(mesh.piers.position.z).toBe(z + 5120);
    mesh.update([], new RoadCorridor([]), terrain, 2, 5120, -5120, true);
    expect(mesh.deck.geometry.drawRange.count).toBe(0);
    expect(mesh.piers.count).toBe(0);
    expect(mesh.deck.visible).toBe(false);
    const geometryDispose = vi.spyOn(mesh.deck.geometry, 'dispose');
    mesh.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(0);
  });

  it.each<[string, Readonly<WorldOptions>]>([
    ['CLOUD-ROAD-001', DEFAULT_OPTIONS], ['ROAD-TEST-002', DEFAULT_OPTIONS],
    ['CLOUD-ROAD-001', { ...DEFAULT_OPTIONS, terrain: 'desert', roadType: 'highway', roadWidth: 10 }],
    ['CLOUD-ROAD-001', { ...DEFAULT_OPTIONS, terrain: 'forest', roadType: 'highway', roadWidth: 6 }],
    ['CLOUD-ROAD-001', { ...DEFAULT_OPTIONS, terrain: 'desert', routeStyle: 5 }],
    ['CLIFF-REPLAY', { ...DEFAULT_OPTIONS, roadType: 'highway', roadWidth: 10, routeStyle: 5 }],
    ['CLOUD-ROAD-001', { ...DEFAULT_OPTIONS, roadWidth: 10, routeStyle: 5, maxGrade: 0.4 }],
    ['CLOUD-ROAD-001', { ...DEFAULT_OPTIONS, roadType: 'highway', roadWidth: 10, routeStyle: 5, maxGrade: 0.4 }],
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
        const gx = Math.floor(x / 4) * 4, gz = Math.floor(z / 4) * 4, tx = (x - gx) / 4, tz = (z - gz) / 4;
        const a = terrain.height.sample(gx, gz), b = terrain.height.sample(gx + 4, gz);
        const c = terrain.height.sample(gx, gz + 4), d = terrain.height.sample(gx + 4, gz + 4);
        const naturalTriangle = tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
        expect(ground.point.y - naturalTriangle).toBeLessThan(0.1);
      }
    }
    for (const chunk of chunks.values()) chunk.dispose();
    material.dispose(); road.dispose(); bridge.dispose();
  }, 30_000);
});
