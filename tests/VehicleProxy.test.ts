import { expect, it } from 'vitest';
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
