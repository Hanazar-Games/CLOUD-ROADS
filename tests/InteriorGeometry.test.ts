import { PointLight, Raycaster, Scene, SpotLight, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { cabinLayouts } from '../src/vehicle/CabinLayout';
import { CabinWalk } from '../src/vehicle/CabinWalk';
import { CabinState } from '../src/vehicle/CabinState';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';
import { VehicleOperations } from '../src/vehicle/VehicleOperations';
import { vehicleProfiles } from '../src/vehicle/VehicleConfig';

it('opens a real camper passage with a supported floor and transparent side windows', () => {
  const p = vehicleProfiles.camper, mesh = new VehicleMesh(new Scene(), p), layout = cabinLayouts(p)[0], b = layout.bounds;
  mesh.root.updateMatrixWorld(true);
  const bed = layout.furniture.find(f => f.kind === 'bed')!.bounds;
  const ray = new Raycaster(new Vector3(0, b.min.y + 1.15, b.min.z + 0.1), new Vector3(0, 0, 1), 0, bed.min.z - b.min.z - 0.2);
  expect(ray.intersectObject(mesh.chassis, true)).toHaveLength(0);
  for (let z = b.min.z + 0.1; z < bed.min.z; z += 0.25) {
    ray.set(new Vector3(0, b.min.y + 0.2, z), new Vector3(0, -1, 0)); ray.far = 0.3;
    expect(ray.intersectObject(mesh.chassis, true)[0]?.distance).toBeCloseTo(0.2, 2);
  }
  const start = -p.length / 2 + 2.65, middle = (start + p.length / 2) / 2;
  ray.set(new Vector3(0, b.max.y + 0.09 - 0.65, middle + 0.8), new Vector3(1, 0, 0)); ray.far = p.width;
  const windows = ray.intersectObject(mesh.chassis, true);
  expect(windows.length).toBeGreaterThan(0);
  expect(windows.every(hit => 'material' in hit.object && !Array.isArray(hit.object.material) && (hit.object.material as { transparent: boolean }).transparent)).toBe(true);
  mesh.dispose();
});

it('seals every cargo tailgate center and opens each separate road train compartment', () => {
  for (const kind of ['truck5', 'truck8', 'semi15', 'semi20', 'roadTrain'] as const) {
    const car = new VehiclePhysics(kind), mesh = new VehicleMesh(new Scene(), car.profile), ops = new VehicleOperations(car.profile), systems = new VehicleSystems();
    const layouts = cabinLayouts(car.profile);
    for (const l of layouts) {
      const parent = mesh.compartment(l.part); parent.updateWorldMatrix(true, true);
      const point = new Vector3(0, l.bounds.min.y + 0.7, l.bounds.max.z - 0.3);
      const ray = new Raycaster(point, new Vector3(0, 0, 1), 0, 1);
      expect(ray.intersectObject(parent, true).length, `${kind} ${l.id} sealed`).toBeGreaterThan(0);
    }
    ops.toggle('cargo', 0, true); for (let i = 0; i < 100; i++) ops.update(1 / 60);
    mesh.sync(car, { x: 0, z: 0 }, systems, 0, undefined, ops);
    for (const l of layouts) {
      const parent = mesh.compartment(l.part); parent.updateWorldMatrix(true, true);
      const point = new Vector3(0, l.bounds.min.y + 0.7, l.bounds.max.z - 0.3).applyMatrix4(parent.matrixWorld);
      const direction = new Vector3(0, 0, 1).transformDirection(parent.matrixWorld);
      expect(new Raycaster(point, direction, 0, 1).intersectObject(parent, true), `${kind} ${l.id} open`).toHaveLength(0);
    }
    mesh.dispose();
  }
});

it('keeps the double-decker aisle and stair collision heights on visible floor geometry', () => {
  const p = vehicleProfiles.doubleDecker, mesh = new VehicleMesh(new Scene(), p), walk = new CabinWalk(p);
  walk.leaveSeat(new CabinState(p), 0); mesh.root.updateMatrixWorld(true);
  const l = walk.layout!, s = l.stairs!;
  for (const floor of [l.bounds.min.y, l.bounds.min.y + s.rise]) for (let z = l.bounds.min.z + 0.3; z < l.bounds.max.z - 0.3; z += 0.3) {
    const sample = walk.sample(0, z, floor + 0.1);
    const hit = new Raycaster(new Vector3(0, sample.height + 0.08, z), new Vector3(0, -1, 0), 0, 0.2).intersectObject(mesh.chassis, true)[0];
    expect(hit, `floor ${floor} z ${z}`).toBeDefined(); expect(hit.distance).toBeCloseTo(0.08, 2);
  }
  for (let i = 0; i < s.steps; i++) {
    const z = s.start + (i + 0.5) * (s.end - s.start) / s.steps, floor = walk.sample(s.x, z).height;
    const hit = new Raycaster(new Vector3(s.x, floor + 0.08, z), new Vector3(0, -1, 0), 0, 0.2).intersectObject(mesh.chassis, true)[0];
    expect(hit, `stair ${i}`).toBeDefined(); expect(Math.abs(hit.point.y - floor)).toBeLessThan(0.03);
  }
  mesh.dispose();
});

it('uses one reusable interior fill and places the reversing beam on the last articulated body', () => {
  const car = new VehiclePhysics('roadTrain'), mesh = new VehicleMesh(new Scene(), car.profile), s = new VehicleSystems();
  car.reset(0, 0, 0, () => ({ height: 0, grip: 1 }));
  const layouts = cabinLayouts(car.profile), fill = mesh.root.getObjectByName('cabin-fill-light') as PointLight;
  for (const l of layouts) {
    mesh.illuminateInterior(l, { x: 0, y: l.bounds.min.y, z: l.bounds.max.z - 1 }, true);
    expect(fill.parent).toBe(mesh.compartment(l.part)); expect(fill.intensity).toBeGreaterThan(0);
    expect(mesh.root.getObjectsByProperty('name', 'cabin-fill-light')).toHaveLength(1);
  }
  mesh.illuminateInterior(undefined, car, false); expect(fill.intensity).toBe(0);
  const beam = mesh.root.getObjectByName('reverse-beam') as SpotLight;
  expect(beam.parent).toBe(mesh.compartment(3));
  mesh.sync(car, { x: 0, z: 0 }, s); expect(beam.intensity).toBe(0);
  car.toggleIgnition();
  for (let i = 0; i < 240; i++) car.update(1 / 120, { throttle: -0.2, steer: 0, handbrake: false }, () => ({ height: 0, grip: 1 }));
  mesh.sync(car, { x: 1000, z: -1000 }, s); expect(beam.intensity).toBeGreaterThan(0);
  car.park(); mesh.sync(car, { x: 0, z: 0 }, s); expect(beam.intensity).toBe(0);
  mesh.dispose();
});
