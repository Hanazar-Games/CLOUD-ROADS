import { expect, it } from 'vitest';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { vehicleSupport } from '../src/vehicle/VehicleSolids';
import { vehicleTemplate } from '../src/service/ParkedVehicles';
import { vehicleProxy } from '../src/vehicle/VehicleProxy';

const flat = () => ({ height: 0, grip: 1 });
const drive = (car: VehiclePhysics, seconds: number, steer = 0, throttle = 1, fps = 60) => {
  car.ignition = 'running';
  for (let i = 0; i < seconds * fps; i++) car.update(1 / fps, { throttle, steer, handbrake: false }, flat);
};

it('couples three 10 m trailers independently through turns and reversing at different frame rates', () => {
  const a = new VehiclePhysics('roadTrain'), b = new VehiclePhysics('roadTrain');
  for (const car of [a, b]) {
    expect(car.profile.trailers?.map(t => t.length)).toEqual([10, 10, 10]);
    car.reset(200000, -300000, 0, flat);
  }
  drive(a, 14, 0.25, 1, 30); drive(b, 14, 0.25, 1, 144);
  for (let i = 0; i < 3; i++) {
    expect(a.trailers[i].heading).toBeCloseTo(b.trailers[i].heading, 8);
    expect(a.trailers[i].heading).not.toBeCloseTo(i ? a.trailers[i - 1].heading : a.heading, 3);
  }
  drive(a, 24, -0.6, -1);
  expect(a.bodies()).toHaveLength(4);
  for (let i = 0; i < 3; i++) {
    const t = a.trailers[i], hitch = a.hitch(i);
    expect(Math.hypot(t.x - hitch.x, t.y - hitch.y, t.z - hitch.z)).toBeLessThan(1e-6);
    expect([t.heading, t.pitch, t.roll].every(Number.isFinite)).toBe(true);
    expect(Math.abs(a.articulations[i])).toBeLessThanOrEqual(Math.PI * 0.43 + 1e-6);
  }
});

it('includes all trailers in support, full-detail templates and distant proxies', () => {
  const car = new VehiclePhysics('roadTrain'); car.reset(0, 0, 0, flat);
  for (const body of car.bodies()) {
    const along = (body.front + body.rear) / 2;
    expect(vehicleSupport(car, body.x + Math.sin(body.heading) * along, body.z - Math.cos(body.heading) * along, 10)).toBeGreaterThan(0.5);
  }
  for (const geometries of [vehicleTemplate('roadTrain'), vehicleProxy('roadTrain')]) {
    expect(geometries).toHaveLength(4);
    for (const geometry of geometries) { expect(geometry.getAttribute('position').count).toBeGreaterThan(0); geometry.dispose(); }
  }
});

it('switches EV / combustion without resetting motion and uses single-speed EV propulsion', () => {
  const car = new VehiclePhysics('sedan'); car.reset(0, 0, 0, flat); drive(car, 4);
  const pose = [car.x, car.y, car.z, car.speed, car.trip]; car.setPowertrain('ev');
  expect([car.x, car.y, car.z, car.speed, car.trip]).toEqual(pose);
  const shifts = car.transmission.shifts; drive(car, 10);
  expect(car.transmission.shifts).toBe(shifts); expect(car.transmission.gear).toBe(1);
  expect(car.transmission.shift(1, car.speed)).toBe(false);
  car.transmission.mode = 'manual'; car.setPowertrain('combustion'); expect(car.powertrain).toBe('combustion');
  expect(car.transmission.rpm).toBeLessThan(car.transmission.redline);
  expect(car.transmission.shifts).toBe(shifts);
  expect(car.speed).toBeGreaterThan(pose[3]);
});

it('keeps a returned road train solid at its rearmost trailer', async () => {
  const { ParkedFleet } = await import('../src/service/ParkedFleet');
  const car = new VehiclePhysics('roadTrain'); car.reset(0, 0, 0, flat);
  const fleet = new ParkedFleet('returned'); fleet.park(car);
  const last = car.trailers.at(-1)!, z = last.z + 6;
  expect(z).toBeGreaterThan(28); expect(fleet.support(last.x, z, 5)).toBeGreaterThan(2);
  const walker = { x: last.x, y: 0, z };
  expect(fleet.constrain(walker, last.x + 4, z, 0.4, 0)).toBe(true);
});

it('regeneration slows coasting EVs but does not propel or brake airborne wheels', () => {
  const coast = new VehiclePhysics(), regen = new VehiclePhysics();
  for (const car of [coast, regen]) { car.setPowertrain('ev'); car.reset(0, 0, 0, flat); car.parked = false; car.speed = 20; }
  coast.regeneration = 0; regen.regeneration = 3;
  drive(coast, 1, 0, 0); drive(regen, 1, 0, 0); expect(regen.speed).toBeLessThan(coast.speed - 0.5);
  for (const car of [coast, regen]) { car.reset(0, 0, 0, flat); car.y = 100; car.speed = 20; car.parked = false; car.wheels.forEach(w => w.grounded = false); }
  drive(coast, 0.1, 0, 0); drive(regen, 0.1, 0, 0); expect(regen.speed).toBeCloseTo(coast.speed, 8);
});

it('uses lower planetary gravity consistently for suspension, acceleration and braking', () => {
  const earth = new VehiclePhysics(), moon = new VehiclePhysics(); moon.gravity = 1.62;
  for (const car of [earth, moon]) { car.reset(0, 0, 0, flat); drive(car, 2); }
  expect(moon.speed).toBeLessThan(earth.speed * 0.6);
  expect(moon.y).toBeGreaterThan(earth.y);
  for (const car of [earth, moon]) { car.speed = 15; car.parked = false; drive(car, 0.2, 0, -1); }
  expect(moon.speed).toBeGreaterThan(earth.speed);
});
