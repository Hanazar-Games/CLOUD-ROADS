import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { bodyPanelGeometry, mergeVehicleParts, rimGeometry, wheelArchPanelGeometry, wheelFenderGeometry } from '../src/vehicle/VehicleGeometry';

it.each([0.12, 0.8])('cuts wheel clearance from side panels including arches above a %s m panel', top => {
  const geometry = wheelArchPanelGeometry(-2, 2, -0.4, top, [-0.3, 0.65], -0.2, 0.6);
  const material = new MeshStandardMaterial(), mesh = new Mesh(geometry, material);
  const ray = new Raycaster(new Vector3(2, 0, -0.3), new Vector3(-1, 0, 0));
  expect(ray.intersectObject(mesh)).toHaveLength(0);
  ray.set(new Vector3(2, 0, 0.65), new Vector3(-1, 0, 0));
  expect(ray.intersectObject(mesh)).toHaveLength(0);
  ray.set(new Vector3(2, 0, -1.5), new Vector3(-1, 0, 0));
  expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
  const normal = new Vector3(), normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) expect(normal.fromBufferAttribute(normals, i).length()).toBeCloseTo(1, 5);
  geometry.dispose(); material.dispose();
});

it('leaves no body panel when a wheel opening consumes the full strip', () => {
  const geometry = wheelArchPanelGeometry(-0.2, 0.2, -0.4, 0.1, [0], -0.2, 0.6);
  expect(geometry.getAttribute('position').count).toBe(0); geometry.dispose();
});

it('bevels body panels within their unit envelope and batches them with existing box parts', () => {
  const geometry = bodyPanelGeometry(), box = new BoxGeometry(), material = new MeshStandardMaterial();
  geometry.computeBoundingBox();
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(geometry.boundingBox!.min[axis]).toBeCloseTo(-0.5, 5);
    expect(geometry.boundingBox!.max[axis]).toBeCloseTo(0.5, 5);
  }
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), normal = new Vector3();
  let bevels = 0;
  for (let i = 0; i < normals.count; i++) {
    normal.fromBufferAttribute(normals, i); expect(normal.length()).toBeCloseTo(1, 5);
    expect(normal.dot(new Vector3().fromBufferAttribute(positions, i))).toBeGreaterThan(0);
    if (Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)) < 0.99) bevels++;
  }
  expect(bevels).toBeGreaterThan(0);
  expect(positions.count / 3).toBeLessThan(50);
  const root = new Group(); root.add(new Mesh(geometry, material), new Mesh(box, material));
  const merged = mergeVehicleParts(root);
  expect(root.children).toHaveLength(1); expect(merged).toHaveLength(1);
  for (const part of [geometry, box, ...merged]) part.dispose(); material.dispose();
});

it.each([0, 0.8, 2.4])('keeps a %s m axle-span fender open below the wheel crown with outward unit normals', span => {
  const geometry = wheelFenderGeometry(0.58, 0.34, span), material = new MeshStandardMaterial(), mesh = new Mesh(geometry, material);
  geometry.computeBoundingBox();
  expect(geometry.boundingBox!.max.x).toBeCloseTo(0.17);
  expect(geometry.boundingBox!.min.x).toBeCloseTo(-0.17);
  expect(geometry.boundingBox!.max.z).toBeCloseTo(span / 2 + 0.625);
  expect(geometry.boundingBox!.min.y).toBeCloseTo(0);
  const ray = new Raycaster(new Vector3(2, 0.3, 0), new Vector3(-1, 0, 0));
  expect(ray.intersectObject(mesh)).toHaveLength(0);
  ray.set(new Vector3(2, 0.6, 0), new Vector3(-1, 0, 0));
  expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
  ray.set(new Vector3(0, 2, 0), new Vector3(0, -1, 0));
  expect(ray.intersectObject(mesh)[0].point.y).toBeCloseTo(0.625);
  const normals = geometry.getAttribute('normal'), normal = new Vector3();
  for (let i = 0; i < normals.count; i++) expect(normal.fromBufferAttribute(normals, i).length()).toBeCloseTo(1, 5);
  expect(geometry.getAttribute('position').count / 3).toBeLessThan(250);
  geometry.dispose(); material.dispose();
});

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
