import { Box3, Mesh, Scene } from 'three';
import { expect, it, vi } from 'vitest';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';
import { CraneSystems } from '../src/vehicle/CraneSystems';

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
