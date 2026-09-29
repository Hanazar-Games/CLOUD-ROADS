import { expect, it } from 'vitest';
import { availableShortcuts, type ShortcutContext } from '../src/input/AvailableShortcuts';
import { KeyBindings } from '../src/input/KeyBindings';
const keys = (context: ShortcutContext) => availableShortcuts(context).map(item => item.id);
it('shows ignition and energy controls only for the driver, and removes driving while standing', () => {
  expect(keys({ mode: 'driver', driveReady: true })).toEqual(expect.arrayContaining(['Ignition', 'Powertrain', 'KeyW']));
  expect(availableShortcuts({ mode: 'driver', driveReady: true }).find(s => s.id === 'Space')?.label).toBe('按住手刹漂移');
  for (const mode of ['interior', 'passenger', 'operator'] as const)
    expect(keys({ mode })).not.toEqual(expect.arrayContaining(['Ignition', 'Powertrain']));
  expect(keys({ mode: 'interior', sit: true })).toContain('CabinWalk');
  expect(keys({ mode: 'interior', sit: false })).not.toContain('CabinWalk');
  expect(keys({ mode: 'driver', accessing: true })).not.toContain('KeyW');
});
it('filters equipment by vehicle and location, and does not offer entry through a locked door', () => {
  const driver = keys({ mode: 'driver', glass: false, ev: true });
  expect(driver).toContain('Regeneration');
  for (const id of ['KeyB', 'KeyK', 'Comma', 'Transmission', 'TrailerBrake']) expect(driver).not.toContain(id);
  expect(keys({ mode: 'walking' })).not.toContain('KeyF');
  expect(keys({ mode: 'walking', cargo: true })).toContain('CabinWalk');
  expect(keys({ mode: 'walking', lock: true })).toContain('VehicleLock');
});
it('limits paused and modal hints, and uses rebindable entry and powertrain actions', () => {
  expect(keys({ mode: 'driver', paused: true })).not.toContain('Powertrain');
  expect(keys({ mode: 'driver', modal: true })).toEqual(['Escape']);
  const bindings = new KeyBindings();
  expect(bindings.resolve('KeyO', true)).toBe('CabinWalk');
  bindings.bind('CabinWalk', 'Shift+KeyD');
  expect(bindings.format('{CabinWalk} / {Powertrain}')).toBe('Shift+D / Shift+I');
});
