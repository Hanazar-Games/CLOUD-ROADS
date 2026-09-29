import { Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { InteriorVolume } from '../src/render/InteriorVolume';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';
import { cabinSeats } from '../src/vehicle/CabinState';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';

it('keeps weather outside all enclosed seating positions, including crane and upper bus deck', () => {
  const volume = new InteriorVolume();
  for (const kind of Object.keys(vehicleProfiles) as VehicleKind[]) {
    const car = new VehiclePhysics(kind); if (car.profile.shape === 'motorcycle') continue;
    const mesh = new VehicleMesh(new Scene(), car.profile);
    for (const seat of cabinSeats(car.profile)) {
      const interior = mesh.cabinVolume(seat.role === 'operator');
      const eye = new Vector3(seat.x, seat.y, -seat.along - (seat.role === 'operator' ? 2.25 : 0)).applyMatrix4(interior.matrixWorld);
      volume.update(interior, eye);
      expect(volume.uniforms.interiorActive.value, `${kind}/${seat.id}`).toBe(true);
    }
    volume.update(mesh.cabinVolume(), new Vector3(100, 100, 100)); expect(volume.uniforms.interiorActive.value).toBe(false);
    mesh.dispose();
  }
});

it('keeps cabin clipping aligned during pitch, roll and origin shifts, and clears it on exit', () => {
  const car = new VehiclePhysics('sedan'), mesh = new VehicleMesh(new Scene(), car.profile), volume = new InteriorVolume();
  car.x = 12300; car.y = 740; car.z = -34000; car.heading = 1.5; car.pitch = 0.2; car.roll = -0.04;
  for (const origin of [{ x: 0, z: 0 }, { x: 12032, z: -33792 }]) {
    mesh.sync(car, origin, new VehicleSystems());
    const interior = mesh.cabinVolume(), p = car.profile.eye;
    const eye = new Vector3(p.x, p.y, -p.along).applyMatrix4(interior.matrixWorld);
    volume.update(interior, eye);
    expect(volume.uniforms.interiorActive.value).toBe(true);
    const local = eye.applyMatrix4(volume.uniforms.interiorInverse.value);
    expect(local.x).toBeCloseTo(p.x); expect(local.y).toBeCloseTo(p.y); expect(local.z).toBeCloseTo(-p.along);
  }
  volume.update(undefined, new Vector3()); expect(volume.uniforms.interiorActive.value).toBe(false);
  mesh.dispose();
});
