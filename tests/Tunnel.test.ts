import { Raycaster, Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { TunnelDetector } from '../src/tunnel/TunnelDetector';
import { TunnelMesh } from '../src/tunnel/TunnelMesh';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { RoadSpine } from '../src/road/RoadSpine';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { BridgeDetector } from '../src/bridge/BridgeDetector';
import { roadProfile } from '../src/road/RoadProfile';
import { roadFrame } from '../src/road/RoadFrame';

const route = () => {
  const start = new RoadGenerator('tunnel', { sample: () => 200 }).start;
  start.position = { x: 0, y: 200, z: 0 };
  const segment = new RoadSegment(start, 0, 0, 3000);
  return Array.from({ length: 1501 }, (_, i) => segment.sample(i / 1500));
};
const hill = { sample: (_x: number, z: number) => 200 + 90 * Math.sin(Math.PI * Math.max(0, Math.min(1, (-z - 250) / 800))) ** 2 };

it('finds complete covered sections, avoids bridges and keeps decisions stable in overlapping windows', () => {
  const samples = route(), detector = new TunnelDetector(hill);
  const spans = detector.detect(samples, []);
  expect(spans.length).toBeGreaterThan(0);
  for (const span of spans) {
    expect(span.end.distance - span.start.distance).toBeGreaterThanOrEqual(120);
    expect(span.end.distance - span.start.distance).toBeLessThanOrEqual(900);
    expect(span.samples.every(sample => hill.sample(sample.position.x, sample.position.z) > sample.position.y + 10)).toBe(true);
  }
  expect(detector.detect(samples.slice(50, -50), []).map(span => [span.start.distance, span.end.distance]))
    .toEqual(spans.map(span => [span.start.distance, span.end.distance]));
  const span = spans[0];
  expect(detector.detect(samples, [{ ...span, depth: 90 }])).toHaveLength(0);
  expect(new TunnelDetector({ sample: () => 100 }).detect(samples, [])).toHaveLength(0);
  expect(detector.detect(span.samples, [])).toHaveLength(0);
});

it('retains every ventilation instance across a full highway window with repeated tunnels', () => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const };
  const start = route()[0], segment = new RoadSegment(start, 0, 0, 24000);
  const samples = Array.from({ length: 12001 }, (_, i) => segment.sample(i / 12000));
  const terrain = { sample: (_x: number, z: number) => z < -50 && z > -23900 ? 300 : 200 };
  const spans = new TunnelDetector(terrain, options).detect(samples, []), scene = new Scene(), mesh = new TunnelMesh(scene, 'capacity', options);
  mesh.update(spans, RoadCorridor.fromSamples(samples, [], options), terrain, 1, 0, 0, true);
  expect(mesh.fans.count).toBeGreaterThan(512);
  for (const batch of [mesh.fans, mesh.equipment, mesh.lights]) expect(batch.count).toBeLessThanOrEqual(batch.instanceMatrix.count);
  mesh.dispose(); expect(scene.children).toHaveLength(0);
}, 20_000);

it.each(['mountain', 'highway'] as const)('keeps both lane edges clear on real curved %s tunnels', roadType => {
  const seed = 'CLOUD-ROAD-001', options = { ...DEFAULT_OPTIONS, roadType, roadWidth: 10 };
  const terrain = new HeightFunction(seed), spine = new RoadSpine(seed, terrain, options);
  while (!spine.update(128, 8)) { /* Complete the initial route window. */ }
  const bridges = new BridgeDetector(terrain, options).detect(spine.samples);
  const spans = new TunnelDetector(terrain, options).detect(spine.samples, bridges);
  expect(spans.length).toBeGreaterThan(0);
  const scene = new Scene(), mesh = new TunnelMesh(scene, seed, options);
  mesh.update(spans, RoadCorridor.fromSamples(spine.samples, bridges, options), terrain, 1, 0, 0, true);
  scene.updateMatrixWorld(true);
  const ray = new Raycaster(), profile = roadProfile(options);
  for (const span of spans) for (let i = 0; i < span.samples.length - 1; i += 6) {
    const a = span.samples[i], b = span.samples[Math.min(i + 6, span.samples.length - 1)];
    const point = (sample: typeof a, offset: number) => {
      const { right, normal } = roadFrame(sample), p = sample.position;
      return new Vector3(p.x + right.x * offset + normal.x * 3, p.y + right.y * offset + normal.y * 3, p.z + right.z * offset + normal.z * 3);
    };
    for (const center of profile.centers) for (const offset of [-5, 0, 5]) {
      const start = point(a, center + offset), finish = point(b, center + offset), direction = finish.clone().sub(start);
      ray.far = direction.length(); ray.set(start, direction.normalize());
      expect(ray.intersectObjects([mesh.lining, mesh.cover, mesh.portals, mesh.equipment, mesh.fans])).toHaveLength(0);
    }
  }
  mesh.dispose();
});

it.each(['mountain', 'highway'] as const)('builds open %s portals, a real roof and buried cover without obstructing travel', roadType => {
  const options = { ...DEFAULT_OPTIONS, roadType, roadWidth: 10 }, samples = route();
  const spans = new TunnelDetector(hill, options).detect(samples, []);
  const corridor = RoadCorridor.fromSamples(samples, [], options), scene = new Scene();
  const mesh = new TunnelMesh(scene, 'tunnel', options);
  mesh.update(spans, corridor, hill, 1, 0, 0, true);
  scene.updateMatrixWorld(true);
  const span = spans[0], x = roadType === 'highway' ? 8.2 : 0;
  const startZ = span.start.position.z, endZ = span.end.position.z;
  const ray = new Raycaster(new Vector3(x, 203, startZ + 4), new Vector3(0, 0, -1), 0, startZ - endZ + 8);
  expect(ray.intersectObjects([mesh.lining, mesh.cover, mesh.portals, mesh.equipment, mesh.fans])).toHaveLength(0);
  ray.set(new Vector3(x, 203, (startZ + endZ) / 2), new Vector3(0, 1, 0));
  ray.far = 200;
  const roof = ray.intersectObject(mesh.lining)[0];
  expect(roof).toBeDefined();
  expect(roof.point.y).toBeGreaterThan(206);
  expect(ray.intersectObject(mesh.cover)[0]).toBeDefined();
  expect(mesh.lights.count).toBeGreaterThan(0);
  expect(mesh.equipment.count).toBeGreaterThan(mesh.lights.count);
  const before = mesh.lining.geometry.getAttribute('position').array.slice();
  mesh.update(spans, corridor, hill, 1, 5120, -5120, true);
  expect(mesh.lining.geometry.getAttribute('position').array).toEqual(before);
  expect(mesh.lining.position.x).toBe(-5120);
  mesh.update([], corridor, hill, 2, 5120, -5120, true);
  expect(mesh.lining.visible).toBe(false);
  mesh.dispose();
  expect(scene.children).toHaveLength(0);
});
