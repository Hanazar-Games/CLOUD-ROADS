import { expect, it } from 'vitest';
import { VehicleDisplay } from '../src/vehicle/VehicleDisplay';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';
import { VehicleOperations } from '../src/vehicle/VehicleOperations';
import { CraneSystems } from '../src/vehicle/CraneSystems';

it('switches between real dial and digital artwork immediately while retaining warnings', () => {
  const car = new VehiclePhysics(), systems = new VehicleSystems(), screen = new VehicleDisplay();
  screen.update(car, systems, 0);
  const digital = screen.texture.image.data!.slice(), version = screen.texture.version;
  screen.style = 'dial'; screen.update(car, systems, 0);
  expect(screen.root.userData.style).toBe('dial');
  expect(screen.texture.version).toBe(version + 1);
  expect(screen.texture.image.data).not.toEqual(digital);
  expect(screen.root.userData.display).toContain('ENGINE OFF');
  screen.style = 'digital'; screen.update(car, systems, 0);
  expect(screen.texture.image.data).toEqual(digital);
  screen.dispose();
});

it('keeps safety alerts visible alongside crane telemetry and equipment status', () => {
  const car = new VehiclePhysics('crane'), systems = new VehicleSystems(), screen = new VehicleDisplay();
  const operations = new VehicleOperations(car.profile), crane = new CraneSystems();
  operations.toggle('doors', 0, true); crane.enabled = true;
  screen.update(car, systems, 0.1, crane, operations);
  expect(screen.root.userData.display).toContain('DOOR OPEN - PARK');
  expect(screen.root.userData.display).toContain('CRANE ON');
  operations.target.doors = 0;
  screen.update(car, systems, 0.1, crane, operations);
  expect(screen.root.userData.display).toContain('ENGINE OFF');
  screen.dispose();
});

it('labels boarding separately from a motorcycle stand and refreshes alerts immediately', () => {
  const car = new VehiclePhysics(), systems = new VehicleSystems(), screen = new VehicleDisplay();
  const operations = new VehicleOperations(car.profile);
  screen.update(car, systems, 0.1, undefined, operations);
  const version = screen.texture.version;
  operations.accessing = true;
  screen.update(car, systems, 0.01, undefined, operations);
  expect(screen.root.userData.display).toContain('BOARDING - PARK');
  expect(screen.texture.version).toBe(version + 1);
  screen.dispose();
});

it('throttles ordinary telemetry uploads and leaves an unchanged screen on the GPU', () => {
  const car = new VehiclePhysics(), systems = new VehicleSystems(), screen = new VehicleDisplay();
  screen.update(car, systems, 0);
  const version = screen.texture.version;
  for (let i = 0; i < 100; i++) screen.update(car, systems, 0.1);
  expect(screen.texture.version).toBe(version);
  car.trip = 1000; screen.update(car, systems, 0.1);
  expect(screen.texture.version).toBe(version + 1);
  car.trip = 2000; screen.update(car, systems, 0.01);
  expect(screen.texture.version).toBe(version + 1);
  screen.update(car, systems, 0.1);
  expect(screen.root.userData.display).toContain('TRIP 2.00 KM');
  expect(screen.texture.version).toBe(version + 2);
  screen.dispose();
});
