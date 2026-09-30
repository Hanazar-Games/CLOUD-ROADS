import { expect, it } from 'vitest';
import { Matrix4, Scene, Vector3 } from 'three';
import { FogLampBatch } from '../src/vehicle/FogLampBatch';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';

it.each(Object.keys(vehicleProfiles) as VehicleKind[])('places %s fog markers at the front and final trailer, and clears them in fair weather', kind => {
  const scene = new Scene(), batch = new FogLampBatch(scene, 1, 'fog'), car = new VehiclePhysics(kind);
  car.reset(100, 120, 0.4, () => ({ height: 15, grip: 1 })); car.ignition = 'running';
  batch.update([car], { x: 100, z: 120 }, true); expect(batch.mesh.count).toBe(4);
  expect(batch.mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 64 }]);
  const last = car.trailers.at(-1) ?? car;
  const matrix = new Matrix4(), position = new Vector3();
  for (let i = 0; i < 4; i++) {
    batch.mesh.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
    const body = i < 2 ? car : last, dx = position.x + 100 - body.x, dz = position.z + 120 - body.z;
    const along = dx * Math.sin(body.heading) - dz * Math.cos(body.heading);
    expect(along * (i < 2 ? 1 : -1)).toBeGreaterThan(0.3);
  }
  batch.update([car], { x: 100, z: 120 }, false); expect(batch.mesh.visible).toBe(false);
  car.ignition = 'off'; batch.update([car], { x: 100, z: 120 }, true); expect(batch.mesh.count).toBe(0);
  batch.dispose(); expect(scene.children).toHaveLength(0);
});
