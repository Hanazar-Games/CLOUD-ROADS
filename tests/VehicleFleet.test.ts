import { Box3, Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { vehicleProfiles, suspensionLevels, suspensionTuning } from '../src/vehicle/VehicleConfig';
import { VehiclePhysics, type SurfaceSampler } from '../src/vehicle/VehiclePhysics';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';

const flat: SurfaceSampler = () => ({ height: 0, grip: 1 });
const drive = (car: VehiclePhysics, seconds: number, steer = 0, throttle = 1, surface = flat, fps = 60) => {
  for (let i = 0; i < seconds * fps; i++) car.update(1 / fps, { throttle, steer, handbrake: false }, surface);
};

it('trims damping independently of spring stiffness and ride height', () => {
  const soft = suspensionTuning(3, vehicleProfiles.sedan, 0.7), firm = suspensionTuning(3, vehicleProfiles.sedan, 1.3);
  expect(soft.spring).toBe(firm.spring); expect(firm.damping / soft.damping).toBeCloseTo(1.3 / 0.7);
  const a = new VehiclePhysics('sedan'), b = new VehiclePhysics('sedan');
  a.damping = 0.7; b.damping = 1.3;
  a.reset(0, 0, 0, flat); b.reset(0, 0, 0, flat);
  expect(a.y).toBe(b.y);
  const raised = () => ({ height: 0.1, grip: 1 });
  drive(a, 0.3, 0, 0, raised); drive(b, 0.3, 0, 0, raised);
  expect(Math.abs(a.y - b.y)).toBeGreaterThan(0.005);
});

it('shares wet-road grip between braking and turning and includes trailer tires', () => {
  const coast = new VehiclePhysics(), brake = new VehiclePhysics();
  const wet = () => ({ height: 0, grip: 0.55 });
  for (const car of [coast, brake]) { car.reset(0, 0, 0, wet); car.parked = false; car.speed = 20; car.steering = 0.3; }
  drive(coast, 0.1, 1, 0, wet, 120); drive(brake, 0.1, 1, -1, wet, 120);
  expect(brake.heading).toBeLessThan(coast.heading * 0.8);
  const dry = new VehiclePhysics('semi20'), mixed = new VehiclePhysics('semi20');
  const mixedSurface: SurfaceSampler = (_x, z) => ({ height: 0, grip: z > 5 ? 0.2 : 1 });
  for (const car of [dry, mixed]) { car.reset(0, 0, 0, flat); car.parked = false; car.speed = 10; }
  drive(dry, 0.2, 0, -1, flat); drive(mixed, 0.2, 0, -1, mixedSurface);
  expect(mixed.speed).toBeGreaterThan(dry.speed + 0.2);
});

it('provides five suspension levels and distinct cars, trucks, buses, articulated rigs and a motorcycle', () => {
  expect(suspensionLevels).toEqual([1, 2, 3, 4, 5]);
  expect(Object.keys(vehicleProfiles)).toHaveLength(10);
  for (const [kind, length] of [['truck5', 5], ['truck8', 8], ['semi15', 15], ['semi20', 20]] as const) expect(vehicleProfiles[kind].length).toBe(length);
  expect(vehicleProfiles.motorcycle.wheels).toHaveLength(2);
  expect(vehicleProfiles.semi20.trailer!.wheelbase).toBeGreaterThan(vehicleProfiles.semi15.trailer!.wheelbase);
});

it.each(Object.keys(vehicleProfiles) as (keyof typeof vehicleProfiles)[])('settles %s on slopes in all five suspension settings and releases its model', kind => {
  const slope: SurfaceSampler = (x, z) => ({ height: x * 0.04 - z * 0.12, grip: 1 });
  const car = new VehiclePhysics(kind);
  for (const level of suspensionLevels) {
    car.suspension = level; car.reset(0, 0, 0, slope);
    const y = car.y;
    drive(car, 3, 0, 0, slope);
    expect(Math.abs(car.y - y)).toBeLessThan(0.025);
    expect(car.speed).toBe(0);
    expect(car.wheels.every(w => w.grounded && Number.isFinite(w.height))).toBe(true);
    expect(car.pitch).toBeCloseTo(Math.atan(0.12), 2);
  }
  car.reset(0, 0, 0, flat);
  const scene = new Scene(), mesh = new VehicleMesh(scene, car.profile);
  mesh.sync(car, { x: 0, z: 0 }, new VehicleSystems()); scene.updateMatrixWorld(true);
  const size = new Box3().setFromObject(mesh.root).getSize(new Vector3());
  expect(size.z).toBeGreaterThan(car.profile.length - 0.3);
  expect(size.z).toBeLessThan(car.profile.length + 0.6);
  expect(size.y).toBeGreaterThan(0.8);
  mesh.dispose(); expect(scene.children).toHaveLength(0);
});

it('gives heavy rigs slower acceleration and longer wet braking distances', () => {
  const sedan = new VehiclePhysics('sedan'), rig = new VehiclePhysics('semi20');
  sedan.reset(0, 0, 0, flat); rig.reset(0, 0, 0, flat);
  drive(sedan, 8); drive(rig, 8);
  expect(sedan.speed).toBeGreaterThan(rig.speed * 1.3);
  const stopping = (grip: number) => {
    const car = new VehiclePhysics('truck8'), road = () => ({ height: 0, grip });
    car.reset(0, 0, 0, road); car.parked = false; car.speed = 20;
    for (let i = 0; i < 2400 && car.speed > 0; i++) car.update(1 / 120, { throttle: -1, steer: 0, handbrake: false }, road);
    expect(car.speed).toBe(0); return -car.z;
  };
  expect(stopping(0.55)).toBeGreaterThan(stopping(1) * 1.25);
});

it.each(['semi15', 'semi20'] as const)('keeps %s hitched through turns, reverse and variable frame rates', kind => {
  const a = new VehiclePhysics(kind), b = new VehiclePhysics(kind);
  for (const car of [a, b]) car.reset(30000, -40000, 0, flat);
  drive(a, 12, 0.4, 1, flat, 30); drive(b, 12, 0.4, 1, flat, 144);
  expect(a.trailer!.heading).not.toBeCloseTo(a.heading, 2);
  expect(a.trailer!.heading).toBeCloseTo(b.trailer!.heading, 8);
  for (const car of [a, b]) {
    const hitch = car.hitch();
    expect(Math.hypot(car.trailer!.x - hitch.x, car.trailer!.z - hitch.z)).toBeLessThan(0.001);
    drive(car, 25, -1, -1);
    expect(Math.abs(car.articulation)).toBeLessThanOrEqual(Math.PI * 0.44);
    expect([car.x, car.y, car.trailer!.pitch, car.trailer!.heading].every(Number.isFinite)).toBe(true);
  }
});

it('leans a motorcycle into a turn and balances at rest', () => {
  const car = new VehiclePhysics('motorcycle'); car.reset(0, 0, 0, flat);
  drive(car, 5, 0.35);
  expect(car.heading).toBeGreaterThan(0); expect(car.roll).toBeLessThan(-0.05);
  for (let i = 0; i < 1200; i++) car.update(1 / 120, { throttle: 0, steer: 0, handbrake: true }, flat);
  expect(car.speed).toBe(0); expect(Math.abs(car.roll)).toBeLessThan(0.01);
});

it.each(['semi15', 'semi20'] as const)('keeps every %s trailer tire on a steep road and allows recovery from a tight reverse', kind => {
  const slope: SurfaceSampler = (x, z) => ({ height: 100 + x * 0.05 - z * 0.4, grip: 1 });
  const car = new VehiclePhysics(kind); car.reset(0, 0, 0, slope);
  drive(car, 5, 0, 0, slope);
  expect(car.trailer!.wheels.every(w => w.grounded && w.compression > 0)).toBe(true);
  expect(car.pitch).toBeCloseTo(Math.atan(0.4), 2);
  expect(car.trailer!.pitch).toBeCloseTo(Math.atan(0.4), 2);
  car.reset(0, 0, 0, flat); drive(car, 25, 1, -1);
  const angle = Math.abs(car.articulation);
  drive(car, 8, 0, 1);
  expect(car.speed).toBeGreaterThan(1);
  expect(Math.abs(car.articulation)).toBeLessThan(angle);
});
