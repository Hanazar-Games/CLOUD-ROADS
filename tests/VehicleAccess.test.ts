import { expect, it } from 'vitest';
import { VehicleAccess } from '../src/vehicle/VehicleAccess';
import { VehicleOperations } from '../src/vehicle/VehicleOperations';
import { vehicleProfiles } from '../src/vehicle/VehicleConfig';

it.each([true, false])('waits for the door before transfer and closing before driving (entering=%s)', entering => {
  const operations = new VehicleOperations(vehicleProfiles.sedan), access = new VehicleAccess(operations, entering);
  expect(operations.driveReady).toBe(false);
  for (let i = 0; i < 50; i++) { operations.update(1 / 60); expect(access.step()).toBeUndefined(); }
  expect(operations.doors).toBeGreaterThan(0.5);
  expect(operations.toggle('doors', 0, true)).toBe(false);
  for (let i = 0; i < 60; i++) operations.update(1 / 60);
  expect(access.step()).toBe('transfer');
  access.close(); expect(access.step()).toBeUndefined();
  expect(operations.driveReady).toBe(false);
  for (let i = 0; i < 100; i++) operations.update(1 / 60);
  expect(access.step()).toBe('complete'); expect(operations.driveReady).toBe(true);
  expect(operations.events).toBe(2);
});

it('cancels safely and can reverse a closing door without snapping its angle', () => {
  const operations = new VehicleOperations(vehicleProfiles.coach), exit = new VehicleAccess(operations, false);
  for (let i = 0; i < 100; i++) operations.update(1 / 60);
  exit.close(); operations.update(0.1); const angle = operations.doors;
  exit.cancel(); const enter = new VehicleAccess(operations, true);
  expect(operations.doors).toBe(angle); expect(enter.step()).toBeUndefined();
  enter.cancel(); expect(operations.accessing).toBe(false); expect(operations.target.doors).toBe(0);
});

it('transfers motorcycles without inventing a door animation or sound', () => {
  const operations = new VehicleOperations(vehicleProfiles.motorcycle), access = new VehicleAccess(operations, true);
  expect(access.step()).toBe('transfer'); access.close(); expect(access.step()).toBe('complete');
  expect(operations.events).toBe(0); expect(operations.driveReady).toBe(true);
});
