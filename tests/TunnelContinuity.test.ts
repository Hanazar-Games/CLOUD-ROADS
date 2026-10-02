import { Matrix4, Raycaster, Scene, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { RoadFurniture } from '../src/road/RoadFurniture';
import { RoadSigns } from '../src/road/RoadSigns';
import { signLabels } from '../src/road/SignAtlas';
import { TunnelDetector } from '../src/tunnel/TunnelDetector';
import { TunnelMesh } from '../src/tunnel/TunnelMesh';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { roadFrame } from '../src/road/RoadFrame';
import { roadProfile } from '../src/road/RoadProfile';

function fixture(length = 14000) {
  const start = new RoadGenerator('continuous-tunnel', { sample: () => 200 }).start;
  start.position = { x: 0, y: 200, z: 0 };
  const segment = new RoadSegment(start, 0, 0, length);
  const samples = Array.from({ length: length / 2 + 1 }, (_, i) => segment.sample(i * 2 / length));
  const terrain = { sample: (_x: number, z: number) => z < -400 && z > -length + 400 ? 800 : 200 };
  return { samples, terrain };
}

it('remembers the true extent as an unlimited bore crosses multiple streaming windows', () => {
  const { samples, terrain } = fixture(), detector = new TunnelDetector(terrain);
  const first = detector.detect(samples.slice(0, 2500), [])[0];
  expect(first).toBeDefined(); expect(first.openEnd).toBe(true);
  expect(first.length).toBeGreaterThan(4500); expect(first.exit).toBeUndefined();
  const middle = detector.detect(samples.slice(2000, 5000), [])[0];
  expect(middle.openStart).toBe(true); expect(middle.openEnd).toBe(true);
  expect(middle.entrance).toBe(first.start.distance);
  expect(middle.length).toBeGreaterThan(9500);
  const last = detector.detect(samples.slice(4500), [])[0];
  expect(last.openStart).toBe(true); expect(last.openEnd).toBe(false);
  expect(last.entrance).toBe(first.start.distance);
  expect(last.exit).toBe(last.end.distance);
  expect(last.length).toBeCloseTo(last.exit! - last.entrance!);
  const revisit = detector.detect(samples.slice(0, 2500), [])[0];
  expect(revisit.length).toBe(last.length); expect(revisit.exit).toBe(last.exit);
});

it('does not discard a whole long bore when a bridge touches only one end', () => {
  const { samples, terrain } = fixture();
  const bridge = { start: samples[0], end: samples[230], samples: samples.slice(0, 231), depth: 30, openStart: false, openEnd: false };
  const spans = new TunnelDetector(terrain).detect(samples, [bridge]);
  expect(spans).toHaveLength(1);
  expect(spans[0].start.distance).toBeGreaterThan(bridge.end.distance);
  expect(spans[0].end.distance - spans[0].start.distance).toBeGreaterThan(12000);
});

it.each([false, true])('restores natural shoulders without digging pits or filling side valleys (valley: %s)', valley => {
  const { samples, terrain: hill } = fixture(2000);
  const terrain = { sample: (x: number, z: number) => valley && Math.abs(x) > 20 ? 80 : hill.sample(x, z) };
  const spans = new TunnelDetector(terrain).detect(samples, []);
  const corridor = RoadCorridor.fromSamples(samples, [], undefined, spans), generator = new TerrainGenerator('mountain-cover');
  vi.spyOn(generator.height, 'sample').mockImplementation(terrain.sample);
  const vertices = generator.generate(0, -4, 64, corridor.forChunk(0, -4)).positions;
  let checked = 0;
  for (let i = 0; i < vertices.length; i += 3) {
    const z = vertices[i + 2] - 1024, x = vertices[i];
    if (z < -700 && z > -1300 && Math.abs(x) >= 10 && Math.abs(x) <= 50) {
      expect(vertices[i + 1]).toBeCloseTo(terrain.sample(x, z), 1); checked++;
    }
  }
  expect(checked).toBeGreaterThan(0); vi.restoreAllMocks();
});

it('places denser entrance and exit fixtures, persistent side reflectors and approach lamps', () => {
  const { samples, terrain } = fixture(3000), spans = new TunnelDetector(terrain).detect(samples, []), span = spans[0];
  const scene = new Scene(), mesh = new TunnelMesh(scene, 'tunnel-lighting');
  mesh.update(spans, RoadCorridor.fromSamples(samples), terrain, 1, 0, 0, true);
  const count = (a: number, b: number) => mesh.lampPositions.filter(p => -p.z >= a && -p.z < b).length;
  expect(count(span.start.distance, span.start.distance + 144)).toBeGreaterThan(count(1400, 1544) * 2);
  expect(count(span.end.distance - 144, span.end.distance)).toBeGreaterThan(count(1400, 1544) * 2);
  expect(mesh.reflectors.count).toBeGreaterThan(100);
  const furniture = new RoadFurniture(scene, 'no-random-lamps');
  furniture.update(samples, spans, [], 1, 0, 0, true);
  for (const [a, b] of [[span.start.distance - 160, span.start.distance - 8], [span.end.distance + 8, span.end.distance + 160]])
    expect(furniture.lampPositions.filter(p => p.sample.distance >= a && p.sample.distance <= b).length).toBeGreaterThanOrEqual(3);
  mesh.dispose(); furniture.dispose(); expect(scene.children).toHaveLength(0);
});

it('adds kilometre length below TUNNEL and directional lane signals with adequate vehicle clearance', () => {
  const { samples, terrain } = fixture(3000), spans = new TunnelDetector(terrain).detect(samples, []);
  const scene = new Scene(), signs = new RoadSigns(scene);
  signs.update(samples, spans, [], 1, 0, 0);
  const tiles = signs.boards.geometry.getAttribute('signTile'), matrix = new Matrix4();
  const indices = Array.from({ length: signs.boards.count }, (_, i) => i);
  for (const label of ['TUNNEL', 'KM', '.', '↓', 'X'])
    expect(indices.some(i => tiles.getX(i) === signLabels.indexOf(label)), label).toBe(true);
  for (const i of indices.filter(i => ['↓', 'X'].includes(signLabels[tiles.getX(i)]))) {
    signs.boards.getMatrixAt(i, matrix);
    expect(matrix.elements[13] - Math.abs(matrix.elements[5]) / 2).toBeGreaterThan(205);
  }
  signs.dispose(); expect(scene.children).toHaveLength(0);
});

it.each(['mountain', 'highway'] as const)('keeps a tightly curved %s bore clear along both lane edges', roadType => {
  const options = { ...DEFAULT_OPTIONS, roadType, roadWidth: 12, roadLanes: 4 };
  const segment = new RoadSegment(fixture(200).samples[0], 2.5, 0, 180);
  const samples = Array.from({ length: 91 }, (_, i) => segment.sample(i / 90));
  const terrain = { sample: () => 600 }, spans = new TunnelDetector(terrain, options).detect(samples, []);
  expect(spans).toHaveLength(1);
  expect(Math.max(...samples.map(s => Math.abs(s.curvature)))).toBeGreaterThan(0.02);
  const scene = new Scene(), mesh = new TunnelMesh(scene, 'tight', options);
  mesh.update(spans, RoadCorridor.fromSamples(samples, [], options, spans), terrain, 1, 0, 0, true);
  scene.updateMatrixWorld(true);
  for (let i = 1; i < samples.length; i++) for (const center of roadProfile(options).centers) for (const side of [-1, 0, 1]) {
    const point = (sample: typeof samples[0]) => {
      const { right, normal } = roadFrame(sample), p = sample.position, offset = center + side * 6;
      return new Vector3(p.x + right.x * offset + normal.x * 4.8, p.y + right.y * offset + normal.y * 4.8, p.z + right.z * offset + normal.z * 4.8);
    };
    const a = point(samples[i - 1]), direction = point(samples[i]).sub(a);
    const ray = new Raycaster(a, direction.clone().normalize(), 0, direction.length());
    expect(ray.intersectObjects([mesh.lining, mesh.cover, mesh.ribs, mesh.equipment, mesh.fans, mesh.lights, mesh.reflectors])).toHaveLength(0);
  }
  mesh.dispose();
});

it('shows a lower bound for undiscovered exits and only green arrows on one-way lanes', () => {
  const { samples, terrain } = fixture(), options = { ...DEFAULT_OPTIONS, oneWay: true, roadLanes: 4 };
  const spans = new TunnelDetector(terrain, options).detect(samples.slice(0, 2500), []);
  const scene = new Scene(), signs = new RoadSigns(scene, options);
  signs.update(samples.slice(0, 2500), spans, [], 1, 0, 0);
  const tiles = signs.boards.geometry.getAttribute('signTile');
  const labels = Array.from({ length: signs.boards.count }, (_, i) => signLabels[tiles.getX(i)]);
  expect(labels).toContain('≥'); expect(labels).toContain('↓'); expect(labels).not.toContain('X');
  expect(labels.filter(label => label === 'TUNNEL')).toHaveLength(1);
  signs.dispose();
});

it('keeps both faces of lane indicators in front of their housings on a steep grade', () => {
  const start = { ...fixture(200).samples[0], grade: 0.4 }, segment = new RoadSegment(start, 0.3, 0.4, 300);
  const samples = Array.from({ length: 151 }, (_, i) => segment.sample(i / 150)), terrain = { sample: () => 1000 };
  const spans = new TunnelDetector(terrain).detect(samples, []), scene = new Scene();
  const signs = new RoadSigns(scene), mesh = new TunnelMesh(scene, 'signal-clearance');
  signs.update(samples, spans, [], 1, 0, 0);
  mesh.update(spans, RoadCorridor.fromSamples(samples, [], undefined, spans), terrain, 1, 0, 0, true);
  scene.updateMatrixWorld(true);
  const tiles = signs.boards.geometry.getAttribute('signTile'), matrix = new Matrix4();
  let checked = 0;
  for (let i = 0; i < signs.boards.count; i++) {
    if (!['↓', 'X'].includes(signLabels[tiles.getX(i)])) continue;
    signs.boards.getMatrixAt(i, matrix);
    const center = new Vector3().setFromMatrixPosition(matrix).add(signs.boards.position);
    const normal = new Vector3(matrix.elements[8], matrix.elements[9], matrix.elements[10]).normalize();
    const ray = new Raycaster(center.clone().addScaledVector(normal, 4), normal.negate(), 0, 5);
    const hit = ray.intersectObjects([signs.boards, mesh.equipment, signs.backs])[0];
    expect(hit?.object).toBe(signs.boards); expect(hit.instanceId).toBe(i); checked++;
  }
  expect(checked).toBeGreaterThan(0); signs.dispose(); mesh.dispose();
});
