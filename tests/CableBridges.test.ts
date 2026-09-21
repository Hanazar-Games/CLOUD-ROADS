import { Matrix4, Raycaster, Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { BridgeMesh } from '../src/bridge/BridgeMesh';
import { BridgeDetector } from '../src/bridge/BridgeDetector';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { roadFrame } from '../src/road/RoadFrame';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it('gives a short deep crossing a tower even between absolute tower stations', () => {
  const terrain = { sample: (_x: number, z: number) => 500 - Math.max(0, 300 * (1 - ((z + 192) / 110) ** 2)) };
  const start = new RoadGenerator('short-cable', { sample: () => 499 }).start;
  start.position = { x: 0, y: 500, z: 0 };
  const segment = new RoadSegment(start, 0, 0, 768);
  const samples = Array.from({ length: 385 }, (_, i) => segment.sample(i / 384));
  const detector = new BridgeDetector(terrain), mesh = new BridgeMesh(new Scene());
  const rebuild = (window: typeof samples, version: number) => {
    const spans = detector.detect(window);
    mesh.update(spans, RoadCorridor.fromSamples(window, spans), terrain, version, 0, 0, true);
    expect(mesh.cableBridges.towerCount).toBe(1);
    expect(mesh.cableBridges.cables.count).toBeGreaterThan(4);
    return mesh.cableBridges.towers.instanceMatrix.array.slice(0, mesh.cableBridges.towers.count * 16);
  };
  expect(rebuild(samples.slice(10, -10), 2)).toEqual(rebuild(samples, 1));
  mesh.dispose();
});

it('buries the entire wide tower footing and keeps interior foundations stable while streaming', () => {
  const terrain = { sample: (x: number) => -500 + x * 3 }, start = new RoadGenerator('foundations', { sample: () => 499 }).start;
  start.position = { x: 0, y: 500, z: 0 };
  const segment = new RoadSegment(start, 0, 0, 2304);
  const samples = Array.from({ length: 1153 }, (_, i) => segment.sample(i / 1152));
  const detector = new BridgeDetector(terrain), scene = new Scene(), mesh = new BridgeMesh(scene);
  const rebuild = (window: typeof samples, version: number) => {
    const spans = detector.detect(window);
    mesh.update(spans, RoadCorridor.fromSamples(window, spans), terrain, version, 0, 0, true);
    scene.updateMatrixWorld(true);
    const matrix = new Matrix4(), foundations: number[][] = [];
    for (let i = 0; i < mesh.cableBridges.towers.count; i++) {
      mesh.cableBridges.towers.getMatrixAt(i, matrix);
      if (Math.abs(new Vector3().setFromMatrixColumn(matrix, 1).length() - 4) > 0.001) continue;
      matrix.premultiply(mesh.cableBridges.towers.matrixWorld);
      for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
        const corner = new Vector3(x, -0.5, z).applyMatrix4(matrix);
        expect(corner.y).toBeLessThan(terrain.sample(corner.x));
      }
      if (matrix.elements[14] < -300 && matrix.elements[14] > -2000) foundations.push([...matrix.elements]);
    }
    expect(foundations.length).toBeGreaterThan(6);
    return foundations;
  };
  expect(rebuild(samples, 1)).toEqual(rebuild(samples.slice(30, -30), 2));
  mesh.dispose();
});

it('moves a cable tower away from a lower railway and keeps the lower clearance open', () => {
  const terrain = { sample: () => 0 }, start = new RoadGenerator('crossing-tower', terrain).start;
  start.position = { x: 0, y: 300, z: 0 };
  const segment = new RoadSegment(start, 0, 0, 768);
  const samples = Array.from({ length: 385 }, (_, i) => segment.sample(i / 384));
  const spans = new BridgeDetector(terrain).detect(samples), main = RoadCorridor.fromSamples(samples, spans);
  const point = { x: -100, y: 100, z: -384, nx: 0, ny: 1, nz: 0, ground: 0, routeId: 'rail' };
  const corridor = new RoadCorridor([...main.edges, { a: point, b: { ...point, x: 100 } }]);
  const scene = new Scene(), mesh = new BridgeMesh(scene);
  mesh.update(spans, corridor, terrain, 1, 0, 0, true); scene.updateMatrixWorld(true);
  expect(mesh.cableBridges.towerCount).toBeGreaterThan(0);
  for (const z of [-387, -384, -381]) {
    const ray = new Raycaster(new Vector3(-100, 103, z), new Vector3(1, 0, 0), 0, 200);
    expect(ray.intersectObject(mesh.cableBridges.towers)).toHaveLength(0);
  }
  mesh.dispose();
});

it.each([200, 200.01, 350])('uses long-span cable stays only above 200 m (%s)', height => {
  const terrain = { sample: () => 500 - height }, start = new RoadGenerator('cable', { sample: () => 499 }).start;
  start.position = { x: 0, y: 500, z: 0 };
  const segment = new RoadSegment(start, 0, 0, 2304);
  const samples = Array.from({ length: 1153 }, (_, i) => segment.sample(i / 1152));
  const spans = new BridgeDetector(terrain).detect(samples), scene = new Scene(), mesh = new BridgeMesh(scene);
  mesh.update(spans, RoadCorridor.fromSamples(samples, spans), terrain, 1, 0, 0, true);
  if (height > 200) {
    expect(mesh.cableBridges.towerCount).toBeGreaterThan(0);
    expect(mesh.cableBridges.cables.count).toBeGreaterThan(30);
    expect(mesh.pierCount).toBeLessThanOrEqual(7);
    scene.updateMatrixWorld(true);
    for (const x of [-3, 0, 3]) {
      const ray = new Raycaster(new Vector3(x, 503, -10), new Vector3(0, 0, -1), 0, 2250);
      expect(ray.intersectObjects([mesh.cableBridges.towers, mesh.cableBridges.cables])).toHaveLength(0);
    }
  } else expect(mesh.cableBridges.towerCount).toBe(0);
  const matrix = new Matrix4();
  for (const batch of [mesh.cableBridges.towers, mesh.cableBridges.cables]) for (let i = 0; i < batch.count; i++) {
    batch.getMatrixAt(i, matrix); expect(matrix.elements.every(Number.isFinite)).toBe(true); expect(matrix.determinant()).toBeGreaterThan(0);
  }
  const data = mesh.cableBridges.cables.instanceMatrix.array.slice();
  mesh.update(spans, RoadCorridor.fromSamples(samples, spans), terrain, 1, 5120, -5120, true);
  expect(mesh.cableBridges.cables.instanceMatrix.array).toEqual(data);
  mesh.dispose(); expect(scene.children).toHaveLength(0);
});

it('keeps cable fans out of steep hairpin carriageways', () => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, roadWidth: 10, routeStyle: 5 as const, maxGrade: 0.4 };
  const generator = new RoadGenerator('curved-cables', { sample: (_x, z) => 500 - z * 0.5 }, options);
  let point = generator.start; const samples = [];
  for (let i = 0; i < 18; i++) { const segment = generator.next(point);
    for (let j = 0; j < 48; j++) samples.push(segment.sample(j / 48)); point = segment.end; }
  const terrain = { sample: () => 0 }, spans = new BridgeDetector(terrain, options).detect(samples);
  const scene = new Scene(), mesh = new BridgeMesh(scene, options);
  mesh.update(spans, RoadCorridor.fromSamples(samples, spans, options), terrain, 1, 0, 0, true); scene.updateMatrixWorld(true);
  expect(mesh.cableBridges.towerCount).toBeGreaterThan(0); expect(mesh.cableBridges.cables.count).toBeGreaterThan(20);
  for (let i = 1; i < samples.length; i += 8) for (const offset of [-12, -6, 6, 12]) {
    const a = samples[i - 1], b = samples[i], start = (s: typeof a) => {
      const { right, normal } = roadFrame(s), p = s.position;
      return new Vector3(p.x + right.x * offset + normal.x * 3, p.y + right.y * offset + normal.y * 3, p.z + right.z * offset + normal.z * 3);
    };
    const from = start(a), delta = start(b).sub(from);
    const ray = new Raycaster(from, delta.clone().normalize(), 0, delta.length());
    expect(ray.intersectObjects([mesh.cableBridges.towers, mesh.cableBridges.cables])).toHaveLength(0);
  }
  mesh.dispose();
}, 20000);
