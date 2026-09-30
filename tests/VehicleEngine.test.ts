import { expect, it } from 'vitest';
import { engineSound } from '../src/audio/VehicleEngine';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { ParkedFleet } from '../src/service/ParkedFleet';

const listener = { x: 0, y: 0, z: 0 }, right = { x: 1, y: 0, z: 0 };

it('spatializes a running car after parking, follows ignition and keeps silent parked EVs quiet', () => {
  const car = new VehiclePhysics('sedan'); car.x = 4; car.ignition = 'running'; car.park();
  const near = engineSound('parked', car, listener, right)!;
  expect(near.rpm).toBe(car.transmission.idle); expect(near.volume).toBeGreaterThan(0.5); expect(near.pan).toBe(1);
  const far = engineSound('parked', car, { ...listener, x: 50 }, right)!;
  expect(far.volume).toBeLessThan(near.volume); expect(far.pan).toBe(-1);
  expect(engineSound('parked', car, { ...listener, x: 300 }, right)).toBeUndefined();
  car.ignition = 'off'; expect(engineSound('parked', car, listener, right)).toBeUndefined();
  car.ignition = 'running'; car.setPowertrain('ev');
  expect(engineSound('parked', car, listener, right)).toBeUndefined();
  car.speed = 4; expect(engineSound('parked', car, listener, right)?.powertrain).toBe('ev');
});

it('retains running vehicles in the parked fleet after switching cars without starting dormant cars', () => {
  const fleet = new ParkedFleet('engines'), car = new VehiclePhysics('truck8'); car.ignition = 'running';
  fleet.park(car, 'left-running'); fleet.park(new VehiclePhysics('sedan'), 'off');
  expect(fleet.runningVehicles().map(v => v.id)).toEqual(['left-running']);
  expect(fleet.take('left-running')).toBe(car); expect(fleet.runningVehicles()).toEqual([]);
});
