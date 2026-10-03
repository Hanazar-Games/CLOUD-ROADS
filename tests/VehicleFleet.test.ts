import { Box3, Mesh, Raycaster, Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { vehicleProfiles, suspensionLevels, suspensionTuning } from '../src/vehicle/VehicleConfig';
import { VehiclePhysics, type SurfaceSampler } from '../src/vehicle/VehiclePhysics';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';

const flat: SurfaceSampler = () => ({ height: 0, grip: 1 });

it('turns motorcycle handlebars and forks with its front wheel while keeping the chassis separate', () => {
  const scene = new Scene(), car = new VehiclePhysics('motorcycle'), mesh = new VehicleMesh(scene, car.profile), systems = new VehicleSystems();
  car.reset(0, 0, 0, flat);
  const handlebars = mesh.chassis.getObjectByName('motorcycle-steering')!;
  expect(handlebars).toBeDefined(); expect(handlebars.children.length).toBeGreaterThan(0);
  for (const steer of [-0.3, 0, 0.3]) {
    car.steering = steer; mesh.sync(car, { x: 0, z: 0 }, systems);
    expect(handlebars.rotation.y).toBeCloseTo(-car.wheelSteering(car.profile.wheels[0]));
    expect(mesh.chassis.rotation.y).toBe(0);
  }
  mesh.dispose(); expect(scene.children).toHaveLength(0);
});

it('supports the expedition rack on its roof and keeps equipment behind the windshield', () => {
  const p = vehicleProfiles.expedition6, scene = new Scene(), mesh = new VehicleMesh(scene, p);
  const roof = p.height - p.radius - p.rest + 9.81 / suspensionTuning(3, p).spring - 0.4;
  scene.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(0, roof + 0.5, -1.2), new Vector3(0, -1, 0), 0, 0.55);
  expect(ray.intersectObject(mesh.chassis)).toHaveLength(0);
  for (const x of [-p.width / 2 + 0.28, p.width / 2 - 0.28]) for (const z of [-0.15, p.length / 2 - 0.75]) {
    ray.set(new Vector3(x, roof + 0.13, z), new Vector3(0, -1, 0));
    const hits = ray.intersectObject(mesh.chassis);
    expect(hits.length).toBeGreaterThan(0); expect(hits[0].distance).toBeLessThan(0.08);
  }
  mesh.dispose(); expect(scene.children).toHaveLength(0);
});
const drive = (car: VehiclePhysics, seconds: number, steer = 0, throttle = 1, surface = flat, fps = 60) => {
  car.ignition = 'running';
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
  expect(Object.keys(vehicleProfiles)).toHaveLength(49);
  for (const [kind, length] of [['truck5', 5], ['truck8', 8], ['semi15', 15], ['semi20', 20]] as const) expect(vehicleProfiles[kind].length).toBe(length);
  expect(vehicleProfiles.motorcycle.wheels).toHaveLength(2);
  expect(vehicleProfiles.semi20.trailers[0]!.wheelbase).toBeGreaterThan(vehicleProfiles.semi15.trailers[0]!.wheelbase);
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
  const bounds = new Box3(); mesh.root.visible = true;
  mesh.root.traverseVisible(object => { if (object instanceof Mesh) bounds.union(new Box3().setFromObject(object)); });
  const size = bounds.getSize(new Vector3());
  expect(size.z).toBeGreaterThan(car.profile.length - 0.3);
  expect(size.z).toBeLessThan(car.profile.length + 0.6);
  expect(size.y).toBeGreaterThan(0.8);
  expect(size.y).toBeLessThan(car.profile.height + 0.2);
  let parts = 0;
  mesh.root.traverse(object => { if (object instanceof Mesh) parts++; });
  expect(parts).toBeLessThan(kind === 'roadTrain' ? 161 : 105);
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

it.each(['semi15', 'semi20', 'stake18', 'heavySemi'] as const)('keeps %s hitched through turns, reverse and variable frame rates', kind => {
  const a = new VehiclePhysics(kind), b = new VehiclePhysics(kind);
  for (const car of [a, b]) {
    car.powerScale = 1.25; car.brakeScale = 0.75; car.steeringScale = 1.2;
    car.reset(30000, -40000, 0, flat);
  }
  drive(a, 12, 0.4, 1, flat, 30); drive(b, 12, 0.4, 1, flat, 144);
  expect(a.trailers[0]!.heading).not.toBeCloseTo(a.heading, 2);
  expect(a.trailers[0]!.heading).toBeCloseTo(b.trailers[0]!.heading, 8);
  for (const car of [a, b]) {
    const hitch = car.hitch();
    expect(Math.hypot(car.trailers[0]!.x - hitch.x, car.trailers[0]!.z - hitch.z)).toBeLessThan(0.001);
    drive(car, 25, -1, -1);
    expect(Math.abs(car.articulation)).toBeLessThanOrEqual(Math.PI * 0.44);
    expect([car.x, car.y, car.trailers[0]!.pitch, car.trailers[0]!.heading].every(Number.isFinite)).toBe(true);
  }
});

it.each(['motorcycle', 'touringMotorcycle'] as const)('leans %s into a turn and balances at rest', kind => {
  const car = new VehiclePhysics(kind); car.reset(0, 0, 0, flat);
  drive(car, 5, 0.35);
  expect(car.heading).toBeGreaterThan(0); expect(car.roll).toBeLessThan(-0.05);
  for (let i = 0; i < 1200; i++) car.update(1 / 120, { throttle: 0, steer: 0, handbrake: true }, flat);
  expect(car.speed).toBe(0); expect(Math.abs(car.roll)).toBeLessThan(0.01);
});

it.each(['semi15', 'semi20', 'stake18', 'heavySemi'] as const)('keeps every %s trailer tire on a steep road and allows recovery from a tight reverse', kind => {
  const slope: SurfaceSampler = (x, z) => ({ height: 100 + x * 0.05 - z * 0.4, grip: 1 });
  const car = new VehiclePhysics(kind); car.reset(0, 0, 0, slope);
  drive(car, 5, 0, 0, slope);
  expect(car.trailers[0]!.wheels.every(w => w.grounded && w.compression > 0)).toBe(true);
  expect(car.pitch).toBeCloseTo(Math.atan(0.4), 2);
  expect(car.trailers[0]!.pitch).toBeCloseTo(Math.atan(0.4), 2);
  car.reset(0, 0, 0, flat); drive(car, 25, 1, -1);
  const angle = Math.abs(car.articulation);
  drive(car, 8, 0, 1);
  expect(car.speed).toBeGreaterThan(1);
  expect(Math.abs(car.articulation)).toBeLessThan(angle);
});

it('adds a four-axle flatbed, five-axle crane and a heavy-haul flatbed semi', () => {
  expect(vehicleProfiles.flatbed12.length).toBe(12);
  expect(vehicleProfiles.flatbed12.wheels).toHaveLength(8);
  expect(vehicleProfiles.crane.wheels).toHaveLength(10);
  expect(vehicleProfiles.crane.wheels.filter(w => w.steer)).toHaveLength(4);
  expect(vehicleProfiles.heavySemi.power).toBeGreaterThan(735500);
  expect(vehicleProfiles.heavySemi.trailers[0].body).toBe('flatbed');
});

it('tunes acceleration and service braking without bypassing traction or parking brakes', () => {
  const low = new VehiclePhysics('flatbed12'), high = new VehiclePhysics('flatbed12');
  low.powerScale = 0.5; high.powerScale = 1.5;
  for (const car of [low, high]) car.reset(0, 0, 0, flat);
  drive(low, 6); drive(high, 6);
  expect(high.speed).toBeGreaterThan(low.speed * 1.3);
  low.brakeScale = 0.5; high.brakeScale = 1.5;
  for (const car of [low, high]) { car.reset(0, 0, 0, flat); car.parked = false; car.speed = 15; }
  drive(low, 0.2, 0, -1); drive(high, 0.2, 0, -1);
  expect(high.speed).toBeLessThan(low.speed - 0.7);
  expect((15 - high.speed) / 0.2).toBeLessThanOrEqual(9.81 * 0.94 + 0.001);
  const slope: SurfaceSampler = (_x, z) => ({ height: -z * 0.4, grip: 1 });
  low.reset(0, 0, 0, slope); drive(low, 2, 0, 0, slope);
  expect(low.speed).toBe(0);
});

it('steers multiple axles around the same center and retains high-speed protection with tuning', () => {
  const car = new VehiclePhysics('crane'); car.steering = 0.4;
  const front = car.profile.wheels[1], second = car.profile.wheels[3];
  expect(car.wheelSteering(front)).toBeGreaterThan(car.wheelSteering(second));
  expect(car.wheelSteering(car.profile.wheels[0])).toBeLessThan(car.wheelSteering(front));
  expect(car.wheelSteering(car.profile.wheels.at(-1)!)).toBe(0);
  const sedan = new VehiclePhysics('sedan'); sedan.steeringScale = 1.4;
  sedan.reset(0, 0, 0, flat); sedan.speed = 40; sedan.parked = false;
  drive(sedan, 0.5, 1, 1);
  expect(sedan.steering).toBeLessThan(0.025);
});
