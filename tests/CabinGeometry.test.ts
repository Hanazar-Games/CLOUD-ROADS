import { Scene } from 'three';
import { expect, it } from 'vitest';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';

it('renders a retractable roadster roof and separately moving side windows', () => {
  const mesh = new VehicleMesh(new Scene()), car = new VehiclePhysics(), systems = new VehicleSystems();
  mesh.sync(car, { x: 0, z: 0 }, systems);
  const roof = mesh.root.getObjectByName('convertible-roof'), windows = mesh.root.getObjectsByProperty('name', 'driver-window');
  expect(roof).toBeDefined(); expect(windows).toHaveLength(2);
  expect(roof!.visible).toBe(false);
  systems.roofOpen = 0; systems.windowOpen = 1; mesh.sync(car, { x: 0, z: 0 }, systems);
  expect(roof!.visible).toBe(true); expect(windows.every(window => !window.visible)).toBe(true);
  systems.windowOpen = 0; mesh.sync(car, { x: 0, z: 0 }, systems);
  expect(windows.every(window => window.visible)).toBe(true);
  mesh.dispose();
});
