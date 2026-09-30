import { expect, it } from 'vitest';
import { vehicleTemplate } from '../src/service/ParkedVehicles';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';

it.each(['sedan', 'semi20', 'crane', 'motorcycle'] as const)('separates rolling and steering surfaces from the %s body in animated templates', kind => {
  const profile = vehicleProfiles[kind], parts = vehicleTemplate(kind, false, true);
  for (const [part, geometry] of parts.entries()) {
    const position = geometry.getAttribute('position'), wheel = geometry.getAttribute('wheelPivot'), steer = geometry.getAttribute('wheelSteer');
    expect(wheel?.count).toBe(position.count); expect(steer?.count).toBe(position.count);
    const centers = new Set<string>(); let fixed = 0, steered = 0;
    for (let i = 0; i < position.count; i++) {
      if (wheel.getW(i)) centers.add(`${wheel.getX(i).toFixed(2)}:${wheel.getZ(i).toFixed(2)}`);
      else fixed++;
      if (steer.getX(i)) steered++;
    }
    const wheels = part && 'trailers' in profile ? profile.trailers[part - 1].wheels : profile.wheels;
    expect(centers.size).toBe(wheels.length); expect(fixed).toBeGreaterThan(100);
    expect(steered > 0).toBe(wheels.some(w => w.steer));
    geometry.dispose();
  }
});

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
