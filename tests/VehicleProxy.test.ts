import { expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { vehicleProxy } from '../src/vehicle/VehicleProxy';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';

it.each(Object.keys(vehicleProfiles) as VehicleKind[])('preserves %s dimensions and trailer parts in a bounded distant model', kind => {
  const profile = vehicleProfiles[kind], geometries = vehicleProxy(kind);
  expect(geometries).toHaveLength('trailers' in profile ? 1 + profile.trailers.length : 1);
  for (const geometry of geometries) {
    geometry.computeBoundingBox(); const bounds = geometry.boundingBox!;
    expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(profile.width + 0.1);
    expect(geometry.getAttribute('position').count).toBeLessThan(600);
    expect([...geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true);
    expect(geometry.getAttribute('paintMask').count).toBe(geometry.getAttribute('position').count);
    geometry.dispose();
  }
});

it.each(['flatbed12', 'stake18', 'motorcycle'] as const)('keeps the open %s silhouette instead of a solid cargo box', kind => {
  const p = vehicleProfiles[kind], parts = vehicleProxy(kind), part = kind === 'stake18' ? parts[1] : parts[0];
  const positions = part.getAttribute('position'), paint = part.getAttribute('paintMask');
  if (kind === 'motorcycle') {
    let width = 0;
    for (let i = 0; i < positions.count; i++) if (paint.getX(i)) width = Math.max(width, Math.abs(positions.getX(i)));
    expect(width).toBeLessThan(p.width * 0.4);
  } else {
    const material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(part, material);
    const hits = new Raycaster(new Vector3(0, 10, 2), new Vector3(0, -1, 0)).intersectObject(mesh);
    expect(hits.length).toBeGreaterThan(0); expect(hits[0].point.y).toBeLessThan(0.5); material.dispose();
  }
  parts.forEach(part => part.dispose());
});
