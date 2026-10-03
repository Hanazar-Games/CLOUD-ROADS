import { Box3, InstancedMesh, Raycaster, Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';
import { cabinSeats } from '../src/vehicle/CabinState';

it('animates the cooler and bottle without losing their meshes to static batching', () => {
  const car = new VehiclePhysics(), model = new VehicleMesh(new Scene()), systems = new VehicleSystems();
  const stock = model.root.getObjectByName('fridge-water') as InstancedMesh;
  const held = model.root.getObjectByName('drinking-water')!, lid = model.root.getObjectByName('fridge-lid')!;
  expect(stock).toBeInstanceOf(InstancedMesh);
  model.sync(car, { x: 0, z: 0 }, systems);
  expect(held.visible).toBe(false); expect(stock.count).toBe(6);
  car.equipment.takeWater(0, true);
  for (let i = 0; i < 5; i++) car.equipment.update(0.1, true);
  model.sync(car, { x: 0, z: 0 }, systems);
  expect(lid.rotation.x).toBeGreaterThan(1); expect(stock.count).toBe(5); expect(held.visible).toBe(true);
  const pose = held.position.clone(); model.sync(car, { x: 0, z: 0 }, systems);
  expect(held.position).toEqual(pose);
  car.equipment.cancelDrink(); model.sync(car, { x: 0, z: 0 }, systems);
  expect(lid.rotation.x).toBe(0); expect(held.visible).toBe(false); expect(stock.count).toBe(6);
  model.dispose();
});

it('maps all six physical console buttons to existing device actions', () => {
  const model = new VehicleMesh(new Scene()), buttons = model.buttons!;
  model.root.updateMatrixWorld(true);
  const eye = new Vector3(-0.43, 0.76, 0.2);
  for (const [i, action] of ['Ignition', 'KeyH', 'Fridge', 'DrinkWater', 'KeyU', 'KeyN'].entries()) {
    const target = buttons.root.localToWorld(new Vector3(-0.16 + (i + 0.5) * 0.32 / 6, 0, 0));
    expect(buttons.pick(new Raycaster(eye, target.sub(eye).normalize())), action).toBe(action);
  }
  model.dispose();
});

it('disables cabin-only buttons on motorcycles', () => {
  const car = new VehiclePhysics('motorcycle'), model = new VehicleMesh(new Scene(), car.profile), systems = new VehicleSystems();
  systems.configure('motorcycle'); model.sync(car, { x: 0, z: 0 }, systems); model.root.updateMatrixWorld(true);
  const buttons = model.buttons!, eye = new Vector3(0, 0.91, -0.05);
  for (const i of [4, 5]) {
    const target = buttons.root.localToWorld(new Vector3(-0.16 + (i + 0.5) * 0.32 / 6, 0, 0));
    expect(buttons.pick(new Raycaster(eye, target.sub(eye).normalize()))).toBeUndefined();
  }
  model.dispose();
});

it.each(['coach', 'doubleDecker', 'camper'] as const)('keeps the %s cooler lid out of seat cushions', kind => {
  const car = new VehiclePhysics(kind), model = new VehicleMesh(new Scene(), car.profile);
  model.root.updateMatrixWorld(true);
  const lid = new Box3().setFromObject(model.root.getObjectByName('fridge-lid')!);
  for (const seat of cabinSeats(car.profile)) {
    const cushion = new Box3().setFromCenterAndSize(new Vector3(seat.x, seat.y - 0.69, -seat.along + 0.05), new Vector3(0.52, 0.15, 0.5));
    expect(lid.intersectsBox(cushion), seat.id).toBe(false);
  }
  model.dispose();
});
