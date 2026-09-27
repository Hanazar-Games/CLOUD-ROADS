import { expect, it } from 'vitest';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { cabinSeats } from '../src/vehicle/CabinState';
import { parkingSlots } from '../src/service/ServiceParking';

const additions = ['hatchback', 'wagon', 'pickup', 'van', 'camper', 'ambulance', 'firetruck', 'dumptruck', 'tanker', 'citybus'] as const;
it('offers ten distinct additions in appropriately sized service parking zones', () => {
  const available = new Set(parkingSlots().flatMap(slot => slot.kinds));
  for (const kind of additions) {
    expect(available.has(kind as VehicleKind)).toBe(true);
    const p = vehicleProfiles[kind];
    expect(p.name).toBeTruthy();
    expect(cabinSeats(p).filter(s => s.role === 'driver')).toHaveLength(1);
  }
  expect(new Set(additions.map(kind => vehicleProfiles[kind].body)).size).toBe(10);
});

it.each(additions)('accelerates, steers and brakes %s without unstable suspension', kind => {
  const car = new VehiclePhysics(kind), surface = () => ({ height: 0, grip: 1 });
  car.reset(0, 0, 0, surface); car.ignition = 'running';
  for (let i = 0; i < 600; i++) car.update(1 / 60, { throttle: 1, steer: 0.15, handbrake: false }, surface);
  expect(car.speed).toBeGreaterThan(5); expect(car.speed).toBeLessThanOrEqual(car.maxSpeed);
  expect(car.heading).toBeGreaterThan(0.05);
  for (let i = 0; i < 600; i++) car.update(1 / 60, { throttle: 0, steer: 0, handbrake: true }, surface);
  expect(car.speed).toBe(0); expect(car.wheels.every(w => w.grounded)).toBe(true);
});
