import { expect, it } from 'vitest';
import { suspensionTuning, vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { cabinSeats } from '../src/vehicle/CabinState';
import { parkingSlots } from '../src/service/ServiceParking';
import { vehicleSupport } from '../src/vehicle/VehicleSolids';
import { Raycaster, Scene, Vector3 } from 'three';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';

const additions = ['taxi', 'surfWagon', 'patrol', 'parcelVan', 'adventureCamper', 'panoramicBus', 'livestockTruck', 'loggingTruck', 'maintenanceTruck', 'touringMotorcycle'];
it('mounts the camper ladder on a single moving tailgate, clear of the other door', () => {
  const scene = new Scene(), p = vehicleProfiles.adventureCamper, model = new VehicleMesh(scene, p);
  const gate = model.chassis.children.find(child => child.name === 'operation-cargo' && child.position.x < 0)!;
  scene.updateMatrixWorld(true);
  const ride = p.radius + p.rest - 9.81 / suspensionTuning(3, p).spring;
  const ray = new Raycaster(new Vector3(-p.width / 4, p.height - ride - 0.5, p.length / 2 + 0.4), new Vector3(0, 0, -1), 0, 0.3);
  expect(ray.intersectObject(gate).length).toBeGreaterThan(0);
  gate.rotation.y = -Math.PI / 2; scene.updateMatrixWorld(true);
  expect(ray.intersectObject(gate)).toHaveLength(0);
  model.dispose(); expect(scene.children).toHaveLength(0);
});
it.each([['loggingTruck', 0, 1, 1.62], ['maintenanceTruck', 0, 0.2, 1.05], ['touringMotorcycle', 0.4, 0.5, 0.56]] as const)(
  'supports the player on the %s load or panniers', (kind, x, z, top) => {
    const car = new VehiclePhysics(kind); car.reset(0, 0, 0, () => ({ height: 0, grip: 1 }));
    expect(vehicleSupport(car, x, z, Infinity)).toBeCloseTo(car.y + top);
  });
it('adds ten distinct road-going vehicles to driving and suitable parking bays', () => {
  expect(Object.keys(vehicleProfiles)).toHaveLength(49);
  for (const kind of additions) {
    expect(vehicleProfiles).toHaveProperty(kind);
    const p = vehicleProfiles[kind as VehicleKind];
    expect(cabinSeats(p).filter(s => s.role === 'driver')).toHaveLength(1);
    const slots = parkingSlots().filter(s => s.kinds.includes(kind as VehicleKind));
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every(s => s.width >= p.width && s.length >= p.length)).toBe(true);
  }
});
it.each(additions)('accelerates and brakes %s without invalid suspension state', kind => {
  expect(vehicleProfiles).toHaveProperty(kind);
  const car = new VehiclePhysics(kind as VehicleKind), surface = () => ({ height: 0, grip: 1 });
  car.reset(0, 0, 0, surface); car.ignition = 'running';
  for (let i = 0; i < 600; i++) car.update(1 / 120, { throttle: 1, steer: 0.15, handbrake: false }, surface);
  expect(car.speed).toBeGreaterThan(2);
  for (let i = 0; i < 1800; i++) car.update(1 / 120, { throttle: 0, steer: 0, handbrake: true }, surface);
  expect(car.speed).toBeCloseTo(0);
  expect([car.x, car.y, car.z, car.pitch, car.roll].every(Number.isFinite)).toBe(true);
  expect(car.wheels.every(w => Number.isFinite(w.compression))).toBe(true);
});
