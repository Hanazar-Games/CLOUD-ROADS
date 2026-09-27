import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { mergeVehicleParts, rimGeometry } from '../src/vehicle/VehicleGeometry';

it('keeps wheel barrels open with recessed walls and lips inside the tire envelope', () => {
  const geometry = rimGeometry(0.5, 0.3), material = new MeshStandardMaterial(), mesh = new Mesh(geometry, material);
  geometry.computeBoundingBox();
  expect(geometry.boundingBox!.max.y).toBeCloseTo(0.147);
  expect(geometry.boundingBox!.min.y).toBeCloseTo(-0.147);
  expect(geometry.boundingBox!.max.x).toBeLessThan(0.5);
  const ray = new Raycaster(new Vector3(0.15, 1, 0), new Vector3(0, -1, 0));
  expect(ray.intersectObject(mesh)).toHaveLength(0);
  ray.set(new Vector3(0.31, 1, 0), new Vector3(0, -1, 0));
  expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
  const normal = new Vector3(), normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) expect(normal.fromBufferAttribute(normals, i).length()).toBeCloseTo(1, 5);
  geometry.dispose(); material.dispose();
});

it('merges rigid parts without changing their surface bounds, normals, material or shadow flags', () => {
  const root = new Group(), paint = new MeshStandardMaterial(), geometries = [];
  const box = new BoxGeometry(), a = new Mesh(box, paint), b = new Mesh(box, paint);
  a.position.set(3, 1, -2); a.scale.set(0.1, 2, 5); a.rotation.set(0.2, 0.4, 0.1);
  b.position.set(-3, -2, 4); a.castShadow = b.castShadow = true;
  root.add(a, b); const before = new Box3().setFromObject(root);
  geometries.push(...mergeVehicleParts(root));
  expect(root.children).toHaveLength(1);
  const merged = root.children[0] as Mesh, after = new Box3().setFromObject(root);
  expect(after.min.distanceTo(before.min)).toBeLessThan(0.00001);
  expect(after.max.distanceTo(before.max)).toBeLessThan(0.00001);
  expect(merged.material).toBe(paint); expect(merged.castShadow).toBe(true);
  const normals = merged.geometry.getAttribute('normal'), normal = new Vector3();
  for (let i = 0; i < normals.count; i++) expect(normal.fromBufferAttribute(normals, i).length()).toBeCloseTo(1, 5);
  geometries.forEach(geometry => geometry.dispose()); box.dispose(); paint.dispose();
});

it('keeps transparency, moving subgroups and different shadow behavior separate', () => {
  const root = new Group(), steering = new Group(), paint = new MeshStandardMaterial(), glass = new MeshStandardMaterial({ transparent: true });
  const box = new BoxGeometry(), a = new Mesh(box, paint), b = new Mesh(box, paint), window = new Mesh(box, glass), wheel = new Mesh(box, paint);
  a.castShadow = true; root.add(a, b, window, steering); steering.add(wheel);
  const geometries = mergeVehicleParts(root);
  expect(root.children).toEqual([a, b, window, steering]); expect(wheel.parent).toBe(steering);
  steering.rotation.z = 0.4; expect(wheel.getWorldQuaternion(wheel.quaternion.clone()).z).not.toBe(0);
  geometries.forEach(geometry => geometry.dispose()); box.dispose(); paint.dispose(); glass.dispose();
});
