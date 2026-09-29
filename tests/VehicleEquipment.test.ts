import { Mesh, MeshStandardMaterial, Raycaster, Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { VehicleOperations } from '../src/vehicle/VehicleOperations';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { ParkedFleet } from '../src/service/ParkedFleet';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';

const ground = () => ({ height: 0, grip: 1 });

it('keeps each vehicle lock and refrigerator attached when parked and exchanged', () => {
  const car = new VehiclePhysics('coach'), fleet = new ParkedFleet('equipment');
  car.equipment.toggleLock(); car.equipment.fridgeOn = true; car.equipment.setFridgeTarget(6);
  fleet.park(car, 'own');
  const next = fleet.vehicle(fleet.entries[0]);
  expect(next.equipment.locked).toBe(true);
  expect(next.equipment.fridgeTarget).toBe(6);
  expect(next.equipment.fridgeOn).toBe(true);
  expect(new VehiclePhysics('coach').equipment.locked).toBe(false);
  next.equipment.toggleLock(); expect(fleet.take('own')).toBe(car);
});

it('refuses to lock open or moving doors and prevents locked cargo and door operation', () => {
  const car = new VehiclePhysics('truck8'), ops = new VehicleOperations(car.profile, car.equipment);
  expect(car.equipment.toggleLock(0.5)).toBe(false);
  expect(car.equipment.toggleLock(0, 1)).toBe(false);
  expect(car.equipment.toggleLock(0, 0, true)).toBe(false);
  expect(car.equipment.toggleLock()).toBe(true);
  expect(ops.toggle('doors', 0, true)).toBe(false);
  expect(ops.toggle('cargo', 0, true)).toBe(false);
  car.equipment.toggleLock(); expect(ops.toggle('doors', 0, true)).toBe(true);
});

it('cools only with power, respects its thermostat, warms without power and freezes on pause', () => {
  const e = new VehiclePhysics().equipment;
  e.fridgeOn = true; e.setFridgeTarget(4);
  e.update(0.1, false); expect(e.fridgeCooling).toBe(false);
  const warm = e.fridgeTemperature;
  for (let i = 0; i < 1000; i++) e.update(0.1, true);
  expect(e.fridgeTemperature).toBeLessThan(warm - 5); expect(e.fridgeCooling).toBe(true);
  const cold = e.fridgeTemperature;
  e.update(0, true); e.update(NaN, true); expect(e.fridgeTemperature).toBe(cold);
  e.update(0.1, false); expect(e.fridgeTemperature).toBeGreaterThan(cold); expect(e.fridgeCooling).toBe(false);
  for (let i = 0; i < 9000; i++) e.update(0.1, true);
  expect(e.fridgeTemperature).toBeGreaterThanOrEqual(4); expect(e.fridgeTemperature).toBeLessThan(4.6);
  e.setFridgeTarget(NaN); expect(e.fridgeTarget).toBe(4);
  e.setFridgeTarget(-20); expect(e.fridgeTarget).toBe(0);
  e.setFridgeTarget(99); expect(e.fridgeTarget).toBe(12);
});

it('selects reversing at low speed, keeps it while coasting and clears it when parked or powered off', () => {
  for (const power of ['combustion', 'ev'] as const) {
    const car = new VehiclePhysics(); car.setPowertrain(power); car.reset(0, 0, 0, ground); car.ignition = 'running';
    car.parked = false; car.speed = 12;
    car.update(0.1, { throttle: -1, steer: 0, handbrake: false }, ground);
    expect(car.reversing).toBe(false);
    car.speed = 0;
    car.update(0.1, { throttle: -1, steer: 0, handbrake: false }, ground); expect(car.reversing).toBe(true);
    car.update(0.1, { throttle: 0, steer: 0, handbrake: false }, ground); expect(car.reversing).toBe(true);
    car.park(); expect(car.reversing).toBe(false);
    car.parked = false; car.speed = -1;
    car.update(0.1, { throttle: 0, steer: 0, handbrake: false }, ground); expect(car.reversing).toBe(false);
    car.speed = 0; car.update(0.1, { throttle: -1, steer: 0, handbrake: false }, ground);
    car.toggleIgnition(); expect(car.reversing).toBe(false);
  }
});

it.each(Object.keys(vehicleProfiles) as VehicleKind[])('gives %s rear white reverse lenses, a refrigerator and sealed-cabin exposure', kind => {
  const car = new VehiclePhysics(kind), mesh = new VehicleMesh(new Scene(), car.profile), systems = new VehicleSystems();
  systems.configure(car.profile.shape); systems.roofOpen = 0; systems.doorOpen = 0.7;
  expect(systems.cabinExposure).toBe(car.profile.shape === 'motorcycle' ? 1 : 0.7);
  mesh.sync(car, { x: 0, z: 0 }, systems);
  const fridge = mesh.root.getObjectByName('vehicle-fridge'); expect(fridge).toBeDefined();
  const lenses: Mesh[] = [];
  mesh.root.traverse(object => {
    if (object instanceof Mesh && !Array.isArray(object.material) && object.material.name === 'reverse-lens') lenses.push(object);
  });
  expect(lenses.length).toBeGreaterThanOrEqual(1 + car.trailers.length);
  for (const lens of lenses) {
    expect((lens.material as MeshStandardMaterial).emissive.getHex()).toBe(0xffffff);
    expect((lens.material as MeshStandardMaterial).emissiveIntensity).toBe(0);
    lens.geometry.computeBoundingBox(); expect(lens.geometry.boundingBox!.max.z).toBeGreaterThan(0);
  }
  car.ignition = 'running'; car.reset(0, 0, 0, ground);
  car.update(0.1, { throttle: -1, steer: 0, handbrake: false }, ground);
  mesh.sync(car, { x: 0, z: 0 }, systems);
  expect((lenses[0].material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(1);
  expect(mesh.root.getObjectByName('vehicle-display')!.userData.display).toContain('R');
  mesh.root.updateMatrixWorld(true);
  const probe = fridge!.getWorldPosition(new Vector3()); probe.z -= 0.08;
  expect(new Raycaster(probe, new Vector3(0, 0, 1), 0, 0.2).intersectObject(mesh.chassis, true).length).toBeGreaterThan(0);
  mesh.dispose();
});

it('closes the roadster rear bulkhead and joins side glass to its folded-up roof', () => {
  const car = new VehiclePhysics(), model = new VehicleMesh(new Scene()), systems = new VehicleSystems(); systems.roofOpen = 0;
  model.sync(car, { x: 0, z: 0 }, systems); model.root.updateMatrixWorld(true);
  for (const [y, z] of [[0.9, 1.18], [1.025, 0.1], [0.3, -0.79]]) {
    const ray = new Raycaster(new Vector3(1, y, z), new Vector3(-1, 0, 0), 0, 0.3);
    expect(ray.intersectObject(model.chassis, true).length, `side ${y}/${z}`).toBeGreaterThan(0);
  }
  const rear = new Raycaster(new Vector3(0.45, 0.4, 1.4), new Vector3(0, 0, -1), 0, 0.25);
  expect(rear.intersectObject(model.chassis, true).length).toBeGreaterThan(0);
  model.dispose();
});
