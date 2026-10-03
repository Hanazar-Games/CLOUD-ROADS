import { Box3, Mesh, Raycaster, Scene, Vector3 } from 'three';
import { cabinSeats } from '../src/vehicle/CabinState';
import { VehicleOperations } from '../src/vehicle/VehicleOperations';
import { expect, it, vi } from 'vitest';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';
import { CraneSystems } from '../src/vehicle/CraneSystems';

it('opens physical cabin doors with their windows on every enclosed non-bus vehicle', () => {
  for (const kind of Object.keys(vehicleProfiles) as VehicleKind[]) {
    const car = new VehiclePhysics(kind);
    if (car.profile.bus || car.profile.shape === 'motorcycle') continue;
    const mesh = new VehicleMesh(new Scene(), car.profile), ops = new VehicleOperations(car.profile);
    const doors = mesh.root.getObjectsByProperty('name', 'operation-doors');
    expect(doors.length, kind).toBe(2);
    expect(doors.every(door => !!door.getObjectByName('driver-window')), kind).toBe(true);
    ops.toggle('doors', 0, true); for (let i = 0; i < 30; i++) ops.update(0.1);
    mesh.sync(car, { x: 0, z: 0 }, new VehicleSystems(), 0, undefined, ops);
    expect(doors.every(door => Math.abs(door.rotation.y) > 0.8), kind).toBe(true);
    mesh.dispose();
  }
});

it('closes the bus driver-side lower body beside the front step well', () => {
  for (const kind of ['minibus', 'coach', 'coach15', 'doubleDecker', 'citybus'] as const) {
    const p = vehicleProfiles[kind], mesh = new VehicleMesh(new Scene(), p);
    mesh.root.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(-p.width / 2 - 0.2, p.eye.y - 1.32, -p.length / 2 + 0.75), new Vector3(1, 0, 0), 0, 0.4);
    expect(ray.intersectObject(mesh.chassis, true).length, kind).toBeGreaterThan(0);
    mesh.dispose();
  }
});

it('keeps every bus eye below its own ceiling, including both double-decker floors', () => {
  for (const kind of ['minibus', 'coach', 'coach15', 'doubleDecker', 'citybus'] as const) {
    const p = vehicleProfiles[kind], mesh = new VehicleMesh(new Scene(), p);
    mesh.root.updateMatrixWorld(true);
    for (const seat of cabinSeats(p)) {
      const ray = new Raycaster(new Vector3(seat.x, seat.y, -seat.along), new Vector3(0, 1, 0), 0, 1);
      const roof = ray.intersectObject(mesh.chassis, true)[0];
      expect(roof, `${kind} ${seat.id}`).toBeDefined(); expect(roof.distance).toBeGreaterThan(0.14);
    }
    mesh.dispose();
  }
});

it('animates real bus doors, cargo gates and the supercar wing with operations state', () => {
  for (const kind of ['doubleDecker', 'stake18', 'truck5', 'supercar', 'pickup', 'dumptruck', 'van', 'camper', 'ambulance'] as const) {
    const car = new VehiclePhysics(kind), mesh = new VehicleMesh(new Scene(), car.profile), ops = new VehicleOperations(car.profile);
    const action = kind === 'doubleDecker' ? 'doors' : kind === 'supercar' ? 'aux' : 'cargo';
    const parts = mesh.root.getObjectsByProperty('name', `operation-${action}`); expect(parts.length).toBeGreaterThan(0);
    ops.toggle(action, 0, true); for (let i = 0; i < 30; i++) ops.update(0.1);
    mesh.sync(car, { x: 0, z: 0 }, new VehicleSystems(), 0, undefined, ops);
    expect(parts.every(p => Math.abs(p.rotation.x) + Math.abs(p.rotation.y) + Math.abs(p.rotation.z) > 0.2)).toBe(true);
    mesh.dispose();
  }
});

it('unfolds loading ramps behind the bed and lowers the motorcycle stand to the ground', () => {
  for (const kind of ['flatbed12', 'heavySemi', 'motorcycle'] as const) {
    const car = new VehiclePhysics(kind), mesh = new VehicleMesh(new Scene(), car.profile), ops = new VehicleOperations(car.profile);
    const ground = () => ({ height: 0, grip: 1 });
    car.reset(0, 0, 0, ground);
    for (let i = 0; i < 600; i++) car.update(1 / 120, { throttle: 0, steer: 0, handbrake: true }, ground);
    const action = kind === 'motorcycle' ? 'aux' : 'cargo';
    ops.toggle(action, 0, true); for (let i = 0; i < 30; i++) ops.update(0.1);
    mesh.sync(car, { x: 0, z: 0 }, new VehicleSystems(), 0, undefined, ops);
    mesh.root.updateMatrixWorld(true);
    for (const part of mesh.root.getObjectsByProperty('name', `operation-${action}`)) {
      const bounds = new Box3().setFromObject(part), hinge = part.getWorldPosition(new Vector3());
      expect(Math.abs(bounds.min.y), kind).toBeLessThan(0.08);
      if (action === 'cargo') expect(bounds.max.z - hinge.z, kind).toBeGreaterThan(1.5);
    }
    mesh.dispose();
  }
});

it('opens the pickup bed to the rear and folds the tailgate outside the cargo floor', () => {
  const car = new VehiclePhysics('pickup'), mesh = new VehicleMesh(new Scene(), car.profile), ops = new VehicleOperations(car.profile);
  const end = car.profile.length / 2, ray = new Raycaster(new Vector3(0, 0.05, end + 1), new Vector3(0, 0, -1), 0, 1.3);
  mesh.root.updateMatrixWorld(true);
  expect(ray.intersectObject(mesh.chassis, true).length).toBeGreaterThan(0);
  ops.toggle('cargo', 0, true); for (let i = 0; i < 30; i++) ops.update(0.1);
  mesh.sync(car, { x: 0, z: 0 }, new VehicleSystems(), 0, undefined, ops); mesh.root.updateMatrixWorld(true);
  expect(ray.intersectObject(mesh.chassis, true).length).toBe(0);
  const gate = mesh.root.getObjectByName('operation-cargo')!;
  expect(new Box3().setFromObject(gate).max.z).toBeGreaterThan(end + 0.25);
  mesh.dispose();
});

it('shows trip, gear, turn signals and powered equipment on every vehicle display', () => {
  for (const kind of Object.keys(vehicleProfiles) as VehicleKind[]) {
    const car = new VehiclePhysics(kind), s = new VehicleSystems(), mesh = new VehicleMesh(new Scene(), car.profile);
    s.configure(car.profile.shape); s.signal = 'hazard'; s.fan = 6; s.radioChannel = 10; s.radioPlaying = true; car.trip = 12345;
    mesh.sync(car, { x: 0, z: 0 }, s, 0.2);
    const screen = mesh.root.getObjectByName('vehicle-display')!;
    expect(screen.userData.display).toContain('< 0 KM/H >'); expect(screen.userData.display).toContain('TRIP 12.35 KM');
    expect(screen.userData.display).toContain('CH 10 ON FAN 6'); mesh.dispose();
  }
});

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

it('releases both crane displays and keeps the operator screen attached to its turret', () => {
  const scene = new Scene(), mesh = new VehicleMesh(scene, vehicleProfiles.crane);
  const screens = ['vehicle-display', 'crane-display'].map(name => mesh.root.getObjectByName(name)!);
  expect(screens[1].parent!.name).toBe('crane-turret');
  const disposed = screens.flatMap(screen => {
    const surface = screen.children[0] as Mesh;
    const material = Array.isArray(surface.material) ? surface.material[0] : surface.material;
    return [vi.spyOn(surface.geometry, 'dispose'), vi.spyOn(material, 'dispose')];
  });
  mesh.dispose(); expect(disposed.every(spy => spy.mock.calls.length === 1)).toBe(true); expect(scene.children).toHaveLength(0);
});

it('extends crane pads down to the settled vehicle ground plane', () => {
  const car = new VehiclePhysics('crane'), mesh = new VehicleMesh(new Scene(), car.profile), crane = new CraneSystems();
  car.reset(0, 0, 0, () => ({ height: 0, grip: 1 }));
  for (let i = 0; i < 600; i++) car.update(1 / 120, { throttle: 0, steer: 0, handbrake: true }, () => ({ height: 0, grip: 1 }));
  crane.deployment = 1; crane.enabled = true; mesh.sync(car, { x: 0, z: 0 }, new VehicleSystems(), 0.2, crane);
  mesh.root.updateMatrixWorld(true);
  const legs = mesh.root.getObjectsByProperty('name', 'crane-support-leg'); expect(legs).toHaveLength(4);
  for (const leg of legs) expect(Math.abs(new Box3().setFromObject(leg).min.y)).toBeLessThan(0.05);
  expect(mesh.root.getObjectByName('crane-display')!.userData.display).toContain('CRANE ON'); mesh.dispose();
});

it('forwards door interlocks to the crane operator display as well as the driving display', () => {
  const car = new VehiclePhysics('crane'), mesh = new VehicleMesh(new Scene(), car.profile);
  const systems = new VehicleSystems(), crane = new CraneSystems(), operations = new VehicleOperations(car.profile);
  operations.toggle('doors', 0, true);
  mesh.sync(car, { x: 0, z: 0 }, systems, 0.2, crane, operations);
  for (const name of ['vehicle-display', 'crane-display'])
    expect(mesh.root.getObjectByName(name)!.userData.display, name).toContain('DOOR OPEN - PARK');
  mesh.dispose();
});
