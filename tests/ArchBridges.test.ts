import { Matrix4, Raycaster, Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { BridgeMesh } from '../src/bridge/BridgeMesh';
import { BridgeDetector } from '../src/bridge/BridgeDetector';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadCorridor } from '../src/road/RoadCorridor';

function fixture(height: number, grade = 0, heading = 0) {
  const terrain = { sample: (x: number) => 500 - height + x * 0.4 };
  const start = new RoadGenerator('arch', { sample: () => 499 }).start;
  start.position = { x: 0, y: 500, z: 0 }; start.grade = grade;
  const segment = new RoadSegment(start, heading, grade, 2304);
  const samples = Array.from({ length: 1153 }, (_, i) => segment.sample(i / 1152));
  const scene = new Scene(), mesh = new BridgeMesh(scene), detector = new BridgeDetector(terrain);
  const update = (window = samples, version = 1, originX = 0, originZ = 0) => {
    const spans = detector.detect(window), corridor = RoadCorridor.fromSamples(window, spans);
    mesh.update(spans, corridor, terrain, version, originX, originZ, true); scene.updateMatrixWorld(true);
    return { spans, corridor };
  };
  return { terrain, samples, mesh, scene, update };
}

it.each([150, 150.01, 350])('adds arch bays only above 150 m and keeps solid piers on the same stations (%s)', height => {
  const { mesh, scene, update } = fixture(height); update();
  expect(mesh.pierCount).toBe(48); expect(mesh.columns.count).toBe(48);
  expect(mesh.archBridges.bayCount > 0).toBe(height > 150);
  for (const x of [-3, 0, 3]) {
    const ray = new Raycaster(new Vector3(x, 503, -10), new Vector3(0, 0, -1), 0, 2250);
    expect(ray.intersectObjects([mesh.archBridges.ribs, mesh.archBridges.posts])).toHaveLength(0);
  }
  const matrix = new Matrix4();
  for (const batch of [mesh.archBridges.ribs, mesh.archBridges.posts]) for (let i = 0; i < batch.count; i++) {
    batch.getMatrixAt(i, matrix); expect(matrix.elements.every(Number.isFinite)).toBe(true); expect(matrix.determinant()).toBeGreaterThan(0);
  }
  mesh.dispose(); expect(scene.children).toHaveLength(0);
});

it('widens taller solid piers continuously and buries their footing corners', () => {
  const widths: number[] = [];
  for (const height of [80, 149, 151, 300, 800]) {
    const { mesh, terrain, update } = fixture(height); update();
    const matrix = new Matrix4(); mesh.columns.getMatrixAt(0, matrix); widths.push(new Vector3().setFromMatrixColumn(matrix, 0).length());
    for (let i = 0; i < mesh.piers.count; i++) {
      mesh.piers.getMatrixAt(i, matrix);
      if (Math.abs(new Vector3().setFromMatrixColumn(matrix, 1).length() - 3) > 0.001) continue;
      matrix.premultiply(mesh.piers.matrixWorld);
      for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
        const corner = new Vector3(x, -0.5, z).applyMatrix4(matrix);
        expect(corner.y).toBeLessThan(terrain.sample(corner.x));
      }
    }
    mesh.dispose();
  }
  for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThan(widths[i - 1]);
});

it('keeps interior arches stable when streaming and rebases without rebuilding instance data', () => {
  const { mesh, samples, update } = fixture(350);
  const interior = () => {
    const matrix = new Matrix4(), result: number[][] = [];
    for (let i = 0; i < mesh.archBridges.ribs.count; i++) {
      mesh.archBridges.ribs.getMatrixAt(i, matrix); matrix.premultiply(mesh.archBridges.ribs.matrixWorld);
      if (matrix.elements[14] < -300 && matrix.elements[14] > -1800) result.push(matrix.elements.map(n => Math.round(n * 1e6) / 1e6));
    }
    return result;
  };
  update(); const before = interior(); expect(before.length).toBeGreaterThan(100);
  update(samples.slice(30, -30), 2); expect(interior()).toEqual(before);
  const data = mesh.archBridges.ribs.instanceMatrix.array.slice();
  update(samples.slice(30, -30), 2, 5120, -5120);
  expect(mesh.archBridges.ribs.instanceMatrix.array).toEqual(data);
  mesh.dispose();
});

it('leaves lower road clearance open without moving adjacent pier stations', () => {
  const { mesh, scene, terrain, update } = fixture(350), { spans, corridor: main } = update();
  const point = { x: -100, y: 470, z: -384, nx: 0, ny: 1, nz: 0, ground: 0, routeId: 'rail' };
  const corridor = new RoadCorridor([...main.edges, { a: point, b: { ...point, x: 100 } }]);
  mesh.update(spans, corridor, terrain, 2, 0, 0, true); scene.updateMatrixWorld(true);
  for (const z of [-387, -384, -381]) {
    const ray = new Raycaster(new Vector3(-100, 473, z), new Vector3(1, 0, 0), 0, 200);
    expect(ray.intersectObjects([mesh.columns, mesh.archBridges.ribs, mesh.archBridges.posts])).toHaveLength(0);
  }
  expect(mesh.pierCount).toBe(47); expect(mesh.archBridges.bayCount).toBeGreaterThan(0); mesh.dispose();
});

it.each([[0.01, 0, true], [0.03, 0, false], [0, 1.5, false]] as const)('uses safe local arch alignment at grade %s and turn %s', (grade, heading, eligible) => {
  const { mesh, samples, update } = fixture(350, grade, heading);
  update(heading ? samples.map(s => ({ ...s, curvature: 0.002 })) : samples);
  expect(mesh.archBridges.bayCount > 0).toBe(eligible);
  expect(mesh.pierCount).toBeGreaterThan(30); mesh.dispose();
});

it('keeps straight interior arches when an adjoining bend enters or leaves the streaming window', () => {
  const { mesh, samples, update } = fixture(350);
  const bend = new RoadSegment({ ...samples[768], bank: 0 }, 1, 0, 768);
  const mixed = [...samples.slice(0, 768), ...Array.from({ length: 385 }, (_, i) => bend.sample(i / 384))];
  const interior = () => {
    const matrix = new Matrix4(), result: number[][] = [];
    for (let i = 0; i < mesh.archBridges.ribs.count; i++) {
      mesh.archBridges.ribs.getMatrixAt(i, matrix);
      if (matrix.elements[14] < -300 && matrix.elements[14] > -900) result.push([...matrix.elements]);
    }
    return result;
  };
  update(mixed); const before = interior(); expect(before.length).toBeGreaterThan(100);
  update(mixed.slice(0, 601), 2); expect(interior()).toEqual(before); mesh.dispose();
});
