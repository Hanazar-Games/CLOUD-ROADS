import { Matrix4, Raycaster, Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { BridgeMesh } from '../src/bridge/BridgeMesh';
import { BridgeDetector } from '../src/bridge/BridgeDetector';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { roadProfile } from '../src/road/RoadProfile';
import { cableSpans } from '../src/bridge/CableBridgeMesh';

function fixture(height = 350, grade = 0, turn = 0, options = DEFAULT_OPTIONS, heading = 0) {
  const terrain = { sample: () => 500 - height }, start = new RoadGenerator('cable', { sample: () => 499 }).start;
  start.position = { x: 0, y: 500, z: 0 }; start.grade = grade; start.heading = heading;
  start.structure = { kind: 'bridge', start: 96, end: 1824, finish: 1920, grade, heading };
  const road = new RoadSegment(start, heading + turn, grade, 1920);
  const samples = Array.from({ length: 961 }, (_, i) => road.sample(i / 960));
  const scene = new Scene(), mesh = new BridgeMesh(scene, options), detector = new BridgeDetector(terrain, options);
  const update = (window = samples, version = 1, originX = 0) => {
    const spans = detector.detect(window), corridor = RoadCorridor.fromSamples(window, spans, options);
    mesh.update(spans, corridor, terrain, version, originX, 0, true); scene.updateMatrixWorld(true);
  };
  return { mesh, scene, samples, update };
}

it.each([[350, 0, 0, true], [350, 0.01, 0, true], [200, 0, 0, false], [350, 0.011, 0, false], [350, 0, 0.2, false]] as const)(
  'reserves cable spans only for deep, planned straight bridges (%s, %s, %s)', (height, grade, turn, eligible) => {
  const { mesh, scene, update } = fixture(height, grade, turn); update();
  expect(mesh.cableBridges.spanCount > 0).toBe(eligible);
  if (eligible) {
    expect(mesh.cableBridges.stays.count).toBeGreaterThan(20);
    expect(mesh.pierCount).toBeLessThan(40);
    for (const x of [-3, 0, 3]) {
      const ray = new Raycaster(new Vector3(x, 503, 0), new Vector3(0, 0, -1), 0, 1900);
      expect(ray.intersectObjects([mesh.cableBridges.towers, mesh.cableBridges.stays])).toHaveLength(0);
    }
    const matrix = new Matrix4(), widths: number[] = [];
    for (let i = 0; i < mesh.columns.count; i++) { mesh.columns.getMatrixAt(i, matrix); widths.push(new Vector3().setFromMatrixColumn(matrix, 0).length()); }
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) * 1.25);
  }
  mesh.dispose(); expect(scene.children).toHaveLength(0);
});

it.each([6, 10] as const)('keeps the full %i m highway envelope clear beneath shared cable pylons', roadWidth => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, roadWidth }, heading = 0.7;
  const { mesh, update } = fixture(350, 0, 0, options, heading); update();
  expect(mesh.cableBridges.spanCount).toBe(1);
  const extent = roadProfile(options).outerHalfWidth, direction = new Vector3(Math.sin(heading), 0, -Math.cos(heading));
  for (let offset = -extent; offset <= extent; offset += 0.25) {
    const ray = new Raycaster(new Vector3(Math.cos(heading) * offset, 506, Math.sin(heading) * offset), direction, 0, 1900);
    expect(ray.intersectObjects([mesh.cableBridges.towers, mesh.cableBridges.stays])).toHaveLength(0);
  }
  mesh.dispose();
});

it('reconstructs the same complete cable structure from a clipped planned span and rebases its buffers', () => {
  const { mesh, samples, update } = fixture(); update();
  const positions = () => {
    const matrix = new Matrix4(), result: number[][] = [];
    for (let i = 0; i < mesh.cableBridges.stays.count; i++) {
      mesh.cableBridges.stays.getMatrixAt(i, matrix); matrix.premultiply(mesh.cableBridges.stays.matrixWorld);
      result.push(matrix.elements.map(v => Math.round(v * 1000) / 1000));
    }
    return result;
  };
  const before = positions(); expect(before.length).toBeGreaterThan(20);
  update(samples.slice(340, 610), 2); expect(positions()).toEqual(before);
  const data = mesh.cableBridges.stays.instanceMatrix.array.slice(); update(samples.slice(340, 610), 2, 5120);
  expect(mesh.cableBridges.stays.instanceMatrix.array).toEqual(data);
  mesh.dispose();
});

it('finds the central crossing when an earlier loaded fragment belongs to the same plan', () => {
  const { mesh, samples } = fixture(), terrain = { sample: () => 150 }, detector = new BridgeDetector(terrain);
  const spans = [...detector.detect(samples.slice(50, 150)), ...detector.detect(samples.slice(340, 610))];
  expect(cableSpans(spans, terrain, RoadCorridor.fromSamples(samples, spans), DEFAULT_OPTIONS)).toHaveLength(1);
  mesh.dispose();
});

it('builds land-facing bridgehead wing walls only at physical bridge ends', () => {
  const terrain = { sample: (_x: number, z: number) => 200 - 120 * Math.sin(Math.PI * Math.max(0, Math.min(1, (-z - 100) / 600))) ** 2 };
  const start = new RoadGenerator('head', { sample: () => 200 }).start; start.position = { x: 0, y: 200, z: 0 };
  const road = new RoadSegment(start, 0, 0, 1000), samples = Array.from({ length: 501 }, (_, i) => road.sample(i / 500));
  const detector = new BridgeDetector(terrain), spans = detector.detect(samples), scene = new Scene(), mesh = new BridgeMesh(scene);
  mesh.update(spans, RoadCorridor.fromSamples(samples, spans, DEFAULT_OPTIONS), terrain, 1, 0, 0, true);
  expect(mesh.abutments.endCount).toBe(2);
  expect(mesh.abutments.mesh.geometry.drawRange.count).toBeGreaterThan(0);
  const points = mesh.abutments.mesh.geometry.getAttribute('position');
  const corridor = RoadCorridor.fromSamples(samples, spans, DEFAULT_OPTIONS);
  let exposed = 0;
  for (let i = 0; i < points.count; i++) {
    expect(points.getY(i)).toBeLessThan(200.31);
    const x = points.getX(i) + mesh.abutments.mesh.position.x, z = points.getZ(i) + mesh.abutments.mesh.position.z;
    expect(corridor.distance(x, z, 30)).toBeGreaterThan(roadProfile().outerHalfWidth);
    exposed = Math.max(exposed, points.getY(i) - corridor.height(x, z, terrain.sample(x, z)));
  }
  expect(exposed).toBeGreaterThan(0.1);
  let volume = 0;
  for (let i = 0; i < points.count; i += 3) volume += new Vector3().fromBufferAttribute(points, i).dot(
    new Vector3().fromBufferAttribute(points, i + 1).cross(new Vector3().fromBufferAttribute(points, i + 2))) / 6;
  expect(volume).toBeGreaterThan(1);
  const clipped = detector.detect(samples.slice(150, 250));
  mesh.update(clipped, RoadCorridor.fromSamples(samples, clipped), terrain, 2, 0, 0, true);
  expect(mesh.abutments.endCount).toBe(0); mesh.dispose();
});
