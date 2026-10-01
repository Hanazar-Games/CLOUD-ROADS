import { Mesh, PerspectiveCamera, Points, Raycaster, Scene, SpotLight, Vector3 } from 'three';
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

it('automatically enables fog lamps on fog entry, respects a manual override and rearms for the next fog', () => {
  const systems = new VehicleSystems();
  systems.updateFog(true); expect(systems.fogLights).toBe(true);
  systems.fogLights = false; systems.updateFog(true); expect(systems.fogLights).toBe(false);
  systems.updateFog(false); expect(systems.fogLights).toBe(false);
  systems.updateFog(true); expect(systems.fogLights).toBe(true);
  systems.updateFog(false); expect(systems.fogLights).toBe(false);
  systems.fogLights = true; systems.updateFog(false); expect(systems.fogLights).toBe(true);
});

it.each(Object.entries(vehicleProfiles).filter(([, p]) => p.chassisLength < 6 && ['roadster', 'sedan', 'supercar', 'suv'].includes(p.shape)))(
  'keeps %s side markers on bodywork outside the wheel openings', (_kind, p) => {
  for (const z of sideLampPositions(p)) for (const wheel of p.wheels) {
    expect(Math.abs(z + wheel.along) - 0.125).toBeGreaterThan(p.radius + 0.05);
  }
  for (const m of vehicleReflectors(p).filter(m => m.w < 0.04)) for (const wheel of p.wheels) {
    expect(Math.abs(m.z + wheel.along) - m.l / 2).toBeGreaterThan(p.radius + 0.05);
  }
});

it.each(['expedition6', 'limousine'] as const)('mounts %s side reflectors against solid bodywork', kind => {
  const p = vehicleProfiles[kind], model = new VehicleMesh(new Scene(), p), solid: Mesh[] = [];
  model.chassis.updateMatrixWorld(true);
  model.chassis.traverse(object => {
    if (object instanceof Mesh && !Array.isArray(object.material) && object.material.name === 'vehicle-paint') solid.push(object);
  });
  try {
    for (const mark of vehicleReflectors(p).filter(mark => mark.w < 0.04)) for (const end of [-0.45, 0, 0.45]) for (const edge of [-0.45, 0.45]) {
      const side = Math.sign(mark.x), origin = new Vector3(side * (p.width / 2 + 0.08), mark.y + edge * mark.h, mark.z + end * mark.l);
      const hits = new Raycaster(origin, new Vector3(-side, 0, 0), 0, 0.16).intersectObjects(solid, false);
      expect(hits.length, `reflector at ${origin.toArray()} needs bodywork behind it`).toBeGreaterThan(0);
    }
  } finally { model.dispose(); }
});

it.each(['roadster', 'supercar'] as const)('mounts %s corner indicators against solid bodywork', kind => {
  const car = new VehiclePhysics(kind), model = new VehicleMesh(new Scene(), car.profile);
  model.chassis.updateMatrixWorld(true);
  const solid: Mesh[] = [], corners = new Map<string, Vector3[]>();
  model.chassis.traverse(object => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
    if (object.material.emissive?.getHex() !== 0xff9b19) {
      if (object.material.name === 'vehicle-paint') solid.push(object);
      return;
    }
    const positions = object.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const p = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      if (Math.abs(p.z) < car.profile.chassisLength / 2) continue;
      const key = `${Math.sign(p.x)}:${Math.sign(p.z)}`, points = corners.get(key) ?? [];
      points.push(p); corners.set(key, points);
    }
  });
  expect(corners.size).toBe(4);
  for (const points of corners.values()) {
    const center = points.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(points.length);
    const direction = new Vector3(0, 0, -Math.sign(center.z));
    const hits = new Raycaster(center, direction, 0, 0.1).intersectObjects(solid, false);
    expect(hits.length, 'indicator needs a backing surface').toBeGreaterThan(0);
  }
  model.dispose();
});

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
