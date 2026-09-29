import { Mesh, PerspectiveCamera, Points, Scene, SpotLight } from 'three';
import { expect, it } from 'vitest';
import { vehicleProfiles, type VehicleProfile } from '../src/vehicle/VehicleConfig';
import { sideLampPositions, vehicleReflectors } from '../src/vehicle/VehicleSafety';
import { WeatherSystem } from '../src/atmosphere/WeatherSystem';
import { CloudSystem } from '../src/atmosphere/CloudSystem';
import { SunSystem } from '../src/atmosphere/SunSystem';
import { vehicleTemplate } from '../src/service/ParkedVehicles';
import { VehicleOperations } from '../src/vehicle/VehicleOperations';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';
import { CraneSystems } from '../src/vehicle/CraneSystems';

it.each(Object.keys(vehicleProfiles) as (keyof typeof vehicleProfiles)[])('retains %s reflectors in every batched body', kind => {
  const p: VehicleProfile = vehicleProfiles[kind];
  for (let i = 0; i <= (p.trailers?.length ?? 0); i++) {
    const marks = vehicleReflectors(p, i);
    expect(marks.some(m => m.color === 0xff3020)).toBe(true);
    expect(marks.some(m => m.x < 0)).toBe(true);
    expect(marks.some(m => m.x > 0)).toBe(true);
  }
  for (const geometry of vehicleTemplate(kind)) {
    const mask = geometry.getAttribute('retroMask');
    expect(mask.count).toBe(geometry.getAttribute('position').count);
    expect([...mask.array].some(value => value > 0)).toBe(true);
    const colors = geometry.getAttribute('color');
    expect([...mask.array].some((value, i) => value > 0 && colors.getX(i) > colors.getY(i) * 2)).toBe(true);
    geometry.dispose();
  }
});

it('keeps fog beams low and bounded, independent of high beams, and shows their dashboard state', () => {
  const model = new VehicleMesh(new Scene()), car = new VehiclePhysics(), systems = new VehicleSystems();
  systems.lights = 'off'; systems.fogLights = true; systems.update(0, 0, 0, 0);
  model.sync(car, { x: 0, z: 0 }, systems);
  const fog = model.root.getObjectByName('foglight-beam') as SpotLight;
  const head = model.root.getObjectByName('headlight-beam') as SpotLight;
  expect(fog.intensity).toBeGreaterThan(0); expect(head.intensity).toBe(0);
  expect(fog.distance).toBeLessThan(50); expect(fog.angle).toBeGreaterThan(head.angle);
  expect(fog.target.position.y).toBeLessThan(fog.position.y);
  expect(model.root.getObjectByName('vehicle-display')!.userData.display).toContain('FOG');
  systems.fogLights = false; model.sync(car, { x: 0, z: 0 }, systems); expect(fog.intensity).toBe(0);
  model.dispose();
});

it('links work beacons to crane deployment and keeps spray frozen on pause and off with the engine', () => {
  const car = new VehiclePhysics('crane'), crane = new CraneSystems(), model = new VehicleMesh(new Scene(), car.profile);
  const operations = new VehicleOperations(car.profile), systems = new VehicleSystems();
  crane.enabled = true; model.sync(car, { x: 0, z: 0 }, systems, 0.1, crane, operations);
  let beacon = 0;
  model.root.traverse(object => { if (object instanceof Mesh && !Array.isArray(object.material) && object.material.emissive?.getHex() === 0xffa310) beacon = object.material.emissiveIntensity; });
  expect(beacon).toBeGreaterThan(1); model.dispose();
  const truck = new VehiclePhysics('sprinkler'), water = new VehicleMesh(new Scene(), truck.profile), controls = new VehicleOperations(truck.profile);
  controls.toggle('aux', 0, true); truck.ignition = 'running';
  water.sync(truck, { x: 0, z: 0 }, systems, 0.1, undefined, controls);
  const spray = water.root.getObjectByName('sprinkler-spray') as Points;
  expect(spray.visible).toBe(true); const positions = spray.geometry.getAttribute('position').array.slice();
  water.sync(truck, { x: 0, z: 0 }, systems, 0, undefined, controls);
  expect(spray.geometry.getAttribute('position').array).toEqual(positions);
  truck.ignition = 'off'; water.sync(truck, { x: 0, z: 0 }, systems, 0.1, undefined, controls);
  expect(spray.visible).toBe(false); water.dispose();
});

it('spaces long chassis and all trailer lamps 3–4 metres apart without leaving unmarked ends', () => {
  for (const p of Object.values(vehicleProfiles) as VehicleProfile[]) {
    for (let i = 0; i <= (p.trailers?.length ?? 0); i++) {
      const t = i ? p.trailers![i - 1] : undefined, length = t?.length ?? p.chassisLength;
      if (length < 6) continue;
      const marks = sideLampPositions(p, i);
      expect(marks.length).toBeGreaterThanOrEqual(2);
      for (let j = 1; j < marks.length; j++) {
        expect(marks[j] - marks[j - 1]).toBeGreaterThanOrEqual(3 - 1e-9);
        expect(marks[j] - marks[j - 1]).toBeLessThanOrEqual(4 + 1e-9);
      }
      const front = t ? -t.front : -length / 2;
      expect(marks[0] - front).toBeLessThanOrEqual(1.5);
      expect(front + length - marks.at(-1)!).toBeLessThanOrEqual(1.5);
    }
  }
});

it('keeps dense fog visibility in metres independent of density and render distance, and clears shelter', () => {
  const weather = new WeatherSystem(new Scene()), clouds = new CloudSystem('fog', new SunSystem());
  const camera = new PerspectiveCamera(); camera.position.y = 500;
  weather.setKind('denseFog', true);
  for (const visibility of [2, 50, 1000]) {
    weather.setVisibility(visibility, true); weather.setFogDensity(2, true);
    expect(weather.profile.far).toBe(visibility);
    for (const distance of [512, 4096]) {
      clouds.update(0, camera, { x: 0, z: 0 }, weather.profile, 0, distance);
      expect(clouds.fog.far).toBe(visibility);
      expect(clouds.fog.near).toBeLessThan(clouds.fog.far);
    }
  }
  weather.setVisibility(NaN, true); expect(weather.profile.far).toBe(1000);
  weather.setVisibility(1, true); expect(weather.profile.far).toBe(2);
  clouds.update(0, camera, { x: 0, z: 0 }, weather.profile, 1);
  expect(clouds.fog.far).toBe(1950);
  weather.dispose(); clouds.dispose();
});

it('allows a sprinkler to spray while driving without exposing a fictitious cargo door', () => {
  const operations = new VehicleOperations(vehicleProfiles.sprinkler);
  expect(operations.label('cargo')).toBe('');
  expect(operations.label('aux')).toContain('洒水');
  expect(operations.toggle('aux', 8, true)).toBe(true);
  expect(operations.driveReady).toBe(true);
});
