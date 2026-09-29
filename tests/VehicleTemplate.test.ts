import { expect, it } from 'vitest';
import { vehicleTemplate } from '../src/service/ParkedVehicles';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';

it.each(Object.keys(vehicleProfiles) as VehicleKind[])('retains indexed %s surfaces, colors and glass with a compact vertex buffer', kind => {
  const parts = vehicleTemplate(kind);
  for (const geometry of parts) {
    const positions = geometry.getAttribute('position'), index = geometry.getIndex();
    const bytes = Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0) + (index?.array.byteLength ?? 0);
    const triangles = (index?.count ?? positions.count) / 3;
    const expandedBytes = triangles * 3 * 48;
    expect(bytes / expandedBytes).toBeLessThan(0.65);
    expect(index).not.toBeNull();
    expect([...index!.array].every(i => i >= 0 && i < positions.count)).toBe(true);
    for (const name of ['normal', 'color', 'glassMask', 'paintMask', 'retroMask']) {
      expect(geometry.getAttribute(name).count).toBe(positions.count);
      expect([...geometry.getAttribute(name).array].every(Number.isFinite)).toBe(true);
    }
    expect([...geometry.getAttribute('paintMask').array]).toContain(1);
    expect([...geometry.getAttribute('retroMask').array]).toContain(1);
    geometry.dispose();
  }
});
