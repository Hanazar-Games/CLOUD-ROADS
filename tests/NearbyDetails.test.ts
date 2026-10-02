import { BoxGeometry, Matrix4, Mesh, MeshStandardMaterial, Raycaster, Scene, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import { NearbyDetails } from '../src/render/NearbyDetails';
import { expansionJointGeometry, drainGrateGeometry, emergencyCabinetGeometry, chargerDetailGeometry } from '../src/render/InfrastructureGeometry';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { roadFrame } from '../src/road/RoadFrame';

it('selects the closest details within a fixed budget and removes them in economy mode', () => {
  const scene = new Scene(), details = new NearbyDetails(scene, new BoxGeometry(), 'test-details', 2);
  details.clear(5000, -5000);
  for (const x of [60, 20, 180, 4]) details.add(new Matrix4().makeTranslation(x, 10, 0));
  details.update({ x: 5000, y: 10, z: -5000 }, 0, 0, 1);
  expect(details.mesh.count).toBe(2);
  const positions = [0, 1].map(i => { const m = new Matrix4(); details.mesh.getMatrixAt(i, m); return m.elements[12]; });
  expect(positions).toEqual([4, 20]);
  expect(details.mesh.position.toArray()).toEqual([5000, 0, -5000]);
  details.update({ x: 5000, y: 10, z: -5000 }, 0, 0, 0);
  expect(details.mesh.visible).toBe(false); expect(details.mesh.count).toBe(0);
  details.dispose(); expect(scene.children).toHaveLength(0);
});

it('rebases without uploading transforms, rebuilds after streaming and releases resources', () => {
  const scene = new Scene(), details = new NearbyDetails(scene, new BoxGeometry(), 'test-details', 8);
  details.clear(5000, 5000); details.add(new Matrix4().makeTranslation(10, 10, 0));
  const camera = { x: 5010, y: 10, z: 5000 };
  details.update(camera, 0, 0, 2);
  const version = details.mesh.instanceMatrix.version;
  details.update(camera, 5120, 5120, 2);
  expect(details.mesh.instanceMatrix.version).toBe(version);
  expect(new Vector3().copy(details.mesh.position).add(new Vector3(5120, 0, 5120)).toArray()).toEqual([5000, 0, 5000]);
  details.clear(5000, 5000); details.add(new Matrix4().makeTranslation(500, 10, 0));
  details.update(camera, 5120, 5120, 2); expect(details.mesh.visible).toBe(false);
  const geometry = vi.spyOn(details.mesh.geometry, 'dispose'), material = vi.spyOn(details.mesh.material, 'dispose');
  details.dispose(); expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce();
});

it('changes optional detail distance at rest without exceeding its instance budget', () => {
  const scene = new Scene(), details = new NearbyDetails(scene, new BoxGeometry(), 'range-details', 3), camera = { x: 0, y: 0, z: 0 };
  for (const x of [20, 60, 110, 150]) details.add(new Matrix4().makeTranslation(x, 0, 0));
  details.update(camera, 0, 0, 1, true, 0.5); expect(details.mesh.count).toBe(1);
  details.update(camera, 0, 0, 1, true, 2); expect(details.mesh.count).toBe(3);
  details.update(camera, 0, 0, 1, true, 0); expect(details.mesh.count).toBe(0); expect(details.mesh.visible).toBe(false);
  details.update(camera, 0, 0, 1, true, 1); expect(details.mesh.count).toBe(2);
  details.dispose();
});

it('keeps transforms on the GPU while camera movement leaves the same closest fixtures visible', () => {
  const details = new NearbyDetails(new Scene(), new BoxGeometry(), 'stationary-fixtures', 2);
  for (const x of [-20, 20, 400]) details.add(new Matrix4().makeTranslation(x, 0, 0));
  details.update({ x: -5, y: 0, z: 0 }, 0, 0, 1);
  const version = details.mesh.instanceMatrix.version;
  details.update({ x: 5, y: 0, z: 0 }, 0, 0, 1);
  expect(details.mesh.count).toBe(2); expect(details.mesh.instanceMatrix.version).toBe(version);
  details.update({ x: 400, y: 0, z: 0 }, 0, 0, 1);
  expect(details.mesh.count).toBe(1); expect(details.mesh.instanceMatrix.version).toBeGreaterThan(version);
  details.dispose();
});

it('finds the nearest fixtures across cells, negative coordinates, heights and streamed replacements', () => {
  const details = new NearbyDetails(new Scene(), new BoxGeometry(), 'indexed-fixtures', 5), matrix = new Matrix4();
  const points = Array.from({ length: 1500 }, (_, i) => ({ x: i * 13 - 5000, y: i % 7 * 23, z: i % 11 * 19 - 90 }));
  details.clear(8000, -12000);
  for (const p of points) details.add(new Matrix4().makeTranslation(p.x, p.y, p.z));
  for (const x of [-4800, -65, 0, 3300]) {
    const camera = { x: x + 8000, y: 50, z: -12001 };
    details.update(camera, 8192, -12288, 2, true, 2);
    const expected = points.map(p => ({ p, distance: (p.x - x) ** 2 + (p.y - 50) ** 2 + (p.z + 1) ** 2 }))
      .filter(p => p.distance < 320 ** 2).sort((a, b) => a.distance - b.distance).slice(0, 5).map(({ p }) => `${p.x},${p.y},${p.z}`);
    const actual = Array.from({ length: details.mesh.count }, (_, i) => {
      details.mesh.getMatrixAt(i, matrix); return `${matrix.elements[12]},${matrix.elements[13]},${matrix.elements[14]}`;
    });
    expect(new Set(actual)).toEqual(new Set(expected));
  }
  details.clear(0, 0); details.add(new Matrix4().makeTranslation(-1, 0, -1));
  details.update({ x: 0, y: 0, z: 0 }, 0, 0, 1);
  expect(details.mesh.count).toBe(1); details.mesh.getMatrixAt(0, matrix); expect(matrix.elements[12]).toBe(-1);
  details.dispose();
});

it('keeps road hardware flush and wall equipment inside the existing fixture footprints', () => {
  for (const geometry of [expansionJointGeometry(10.4), drainGrateGeometry()]) {
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.y).toBeLessThanOrEqual(0.016);
    expect(geometry.boundingBox!.min.y).toBeGreaterThanOrEqual(-0.031);
    expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    geometry.dispose();
  }
  for (const [geometry, height, length] of [[emergencyCabinetGeometry(), 1.3, 0.65]] as const) {
    geometry.computeBoundingBox(); const size = geometry.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeLessThan(0.12); expect(size.y).toBeLessThanOrEqual(height); expect(size.z).toBeLessThanOrEqual(length);
    expect(geometry.groups).toHaveLength(0); geometry.dispose();
  }
});

it('hangs charging cables above the ground, outside the screen and clear of vehicle bays', () => {
  const geometry = chargerDetailGeometry(), material = new MeshStandardMaterial(), mesh = new Mesh(geometry, material);
  geometry.computeBoundingBox(); const bounds = geometry.boundingBox!;
  expect(bounds.min.y).toBeGreaterThan(-1.3); expect(bounds.max.y).toBeLessThan(0.5);
  expect(bounds.min.x).toBeGreaterThan(-0.35); expect(bounds.max.x).toBeLessThan(0.1);
  expect(Math.max(-bounds.min.z, bounds.max.z)).toBeLessThan(0.6);
  expect(geometry.index!.count / 3).toBeLessThan(1500); expect(geometry.groups).toHaveLength(0);
  for (const side of [-1, 1]) {
    const ray = new Raycaster(new Vector3(0.5, -1.1, side * 0.49), new Vector3(-1, 0, 0), 0, 1);
    expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
    ray.set(new Vector3(0.5, -0.7, side * 0.49), new Vector3(-1, 0, 0));
    expect(ray.intersectObject(mesh)).toHaveLength(0);
  }
  geometry.dispose(); material.dispose();
});

it.each([-1, 1])('aligns details with bank and grade without reflecting the geometry (facing %s)', facing => {
  const sample = { ...new RoadSegment(new RoadGenerator('details').start, 0.7, 0.25).sample(0.5), bank: 0.12 };
  const { right, normal } = roadFrame(sample), details = new NearbyDetails(new Scene(), drainGrateGeometry(), 'slope');
  details.clear(1000, -1000); details.addRoad(sample, 5, 0.008, facing);
  details.update(sample.position, 5120, -5120, 2);
  const matrix = new Matrix4(); details.mesh.getMatrixAt(0, matrix);
  expect(matrix.determinant()).toBeCloseTo(1, 5);
  const actual = new Vector3().setFromMatrixPosition(matrix).add(details.mesh.position).add(new Vector3(5120, 0, -5120));
  const expected = new Vector3().copy(sample.position).addScaledVector(new Vector3().copy(right), 5).addScaledVector(new Vector3().copy(normal), 0.008);
  expect(actual.distanceTo(expected)).toBeLessThan(0.0002);
  expect(new Vector3().setFromMatrixColumn(matrix, 1).distanceTo(normal)).toBeLessThan(0.0001);
  details.dispose();
});
