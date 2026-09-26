import { expect, it } from 'vitest';
import { CabinState, cabinSeats } from '../src/vehicle/CabinState';
import { CraneSystems } from '../src/vehicle/CraneSystems';
import { vehicleProfiles } from '../src/vehicle/VehicleConfig';

it('gives every modeled cabin seat a unique position and exactly one driver', () => {
  for (const profile of Object.values(vehicleProfiles)) {
    const seats = cabinSeats(profile);
    expect(seats.filter(s => s.role === 'driver')).toHaveLength(1);
    expect(new Set(seats.map(s => s.id)).size).toBe(seats.length);
    expect(new Set(seats.map(s => `${s.x},${s.y},${s.along}`)).size).toBe(seats.length);
    expect(seats.every(s => Math.abs(s.x) < profile.width / 2)).toBe(true);
  }
  expect(cabinSeats(vehicleProfiles.coach).length).toBeGreaterThan(30);
  expect(cabinSeats(vehicleProfiles.motorcycle)).toHaveLength(1);
  expect(cabinSeats(vehicleProfiles.crane).at(-1)!.role).toBe('operator');
});

it('requires a stop to change seats and remembers bounded adjustments per seat', () => {
  const cabin = new CabinState(vehicleProfiles.coach), passenger = cabin.seats[2];
  expect(cabin.select(passenger.id, 5)).toBe(false);
  expect(cabin.select(passenger.id, 0)).toBe(true); expect(cabin.driver).toBe(false);
  cabin.adjust(100, -100, 100, 100);
  expect(cabin.adjustment).toEqual({ x: 0.12, along: -0.15, height: 0.08, recline: 0.35 });
  cabin.select('driver', 0); expect(cabin.adjustment.height).toBe(0);
  cabin.select(passenger.id, 0); expect(cabin.adjustment.height).toBe(0.08);
  expect(cabin.select('missing', 0)).toBe(false);
});

it('interlocks crane deployment, operation and stowing with the operator and stationary vehicle', () => {
  const crane = new CraneSystems();
  expect(crane.toggle(false, 0)).toBe(false); expect(crane.toggle(true, 1)).toBe(false);
  expect(crane.toggle(true, 0)).toBe(true); expect(crane.stowed).toBe(false);
  const controls = { slew: 1, lift: 1, extend: 1, hoist: 1 };
  crane.update(0.1, controls, true, 0); expect(crane.angle).toBe(0);
  for (let i = 0; i < 200; i++) crane.update(0.1, controls, true, 0);
  expect(crane.angle).toBeGreaterThan(0.5); expect(crane.extension).toBeGreaterThan(1);
  const yaw = crane.yaw; crane.update(0, controls, true, 0); expect(crane.yaw).toBe(yaw);
  crane.update(0.1, controls, false, 0); expect(crane.yaw).toBe(yaw);
  crane.toggle(true, 0);
  for (let i = 0; i < 400; i++) crane.update(0.1, controls, false, 0);
  expect(crane.stowed).toBe(true); expect(crane.yaw).toBe(0);
});
