import { expect, it } from 'vitest';
import { cabinSeats, CabinState } from '../src/vehicle/CabinState';
import { vehicleProfiles } from '../src/vehicle/VehicleConfig';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { VehicleOperations } from '../src/vehicle/VehicleOperations';

it.each([['minibus', 9], ['coach', 13], ['coach15', 18]] as const)('gives %s exactly %i passenger rows with four selectable seats per row', (kind, rows) => {
  const seats = cabinSeats(vehicleProfiles[kind]), passengers = seats.filter(s => s.role === 'passenger');
  expect(passengers).toHaveLength(rows * 4);
  for (let row = 1; row <= rows; row++) expect(passengers.filter(s => s.row === row)).toHaveLength(4);
  expect(seats.filter(s => s.role === 'driver')).toHaveLength(1);
  expect(passengers.every(s => s.along < vehicleProfiles[kind].eye.along - 0.55)).toBe(true);
});

it('provides separate selectable decks at distinct heights with one driver', () => {
  const cabin = new CabinState(vehicleProfiles.doubleDecker);
  for (const floor of [1, 2]) {
    const seats = cabin.seats.filter(s => s.floor === floor);
    expect(seats.length).toBeGreaterThan(30);
    for (const seat of seats) { expect(cabin.select(seat.id, 0)).toBe(true); expect(cabin.selected.id).toBe(seat.id); }
  }
  const upper = cabin.seats.find(s => s.floor === 2)!;
  expect(upper.y - cabin.seats[0].y).toBeGreaterThan(1.6);
  expect(cabin.select(upper.id, 1)).toBe(false);
  expect(cabin.seats.filter(s => s.role === 'driver')).toHaveLength(1);
});

it('drives the 350 km/h supercar to its factory limit on level ground and retains a lower custom limit', () => {
  const car = new VehiclePhysics('supercar'), flat = () => ({ height: 0, grip: 1 });
  expect(car.maxSpeed * 3.6).toBeCloseTo(350);
  car.reset(0, 0, 0, flat); car.ignition = 'running';
  for (let i = 0; i < 120 * 120; i++) car.update(1 / 120, { throttle: 1, steer: 0, handbrake: false }, flat);
  expect(car.speed * 3.6).toBeGreaterThan(348); expect(car.speed).toBeLessThanOrEqual(car.maxSpeed);
  car.setSpeedLimit(120); car.update(1 / 60, { throttle: 1, steer: 0, handbrake: false }, flat);
  expect(car.speed).toBeLessThanOrEqual(120 / 3.6); expect(car.transmission.gears).toBe(8);
});

it('adds an 18 m open stake trailer with three non-steering axles', () => {
  const p = vehicleProfiles.stake18;
  expect(p.length).toBe(18); expect(p.trailer.body).toBe('stake');
  expect(p.trailer.wheels).toHaveLength(6); expect(p.trailer.wheels.every(w => !w.steer)).toBe(true);
});

it('interlocks passenger doors and cargo bays until fully shut, freezes animations and rejects passenger operation', () => {
  const ops = new VehicleOperations(vehicleProfiles.coach);
  expect(ops.toggle('doors', 2, true)).toBe(false); expect(ops.toggle('doors', 0, false)).toBe(false);
  expect(ops.toggle('doors', 0, true)).toBe(true); expect(ops.driveReady).toBe(false);
  ops.update(0); expect(ops.doors).toBe(0);
  for (let i = 0; i < 40; i++) ops.update(0.1);
  expect(ops.doors).toBe(1); expect(ops.toggle('doors', 0, true)).toBe(true);
  expect(ops.driveReady).toBe(false);
  for (let i = 0; i < 40; i++) ops.update(0.1);
  expect(ops.driveReady).toBe(true);
  expect(ops.toggle('cargo', 0, true)).toBe(true); expect(ops.driveReady).toBe(false);
  expect(ops.toggle('aux', 0, true)).toBe(false);
  const wing = new VehicleOperations(vehicleProfiles.supercar);
  expect(wing.toggle('aux', 40, true)).toBe(true); expect(wing.driveReady).toBe(true);
});
