import { expect, it } from 'vitest';
import { bindingActions, KeyBindings } from '../src/input/KeyBindings';

it('uses Backquote ignition and conflict-free ordinary keys for all default actions', () => {
  const keys = new KeyBindings();
  expect(keys.resolve('Backquote', false)).toBe('Ignition');
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'Space']) expect(keys.resolve(code, true)).toBe(code);
  expect(keys.label('Ignition')).toBe('·');
  expect(keys.format('{Ignition} 点火 · {PauseToggle} 暂停')).toBe('· 点火 · / 暂停');
  expect(bindingActions.some(([, key]) => /^F\d+$/.test(key))).toBe(false);
  expect(new Set(Object.values(keys.snapshot())).size).toBe(bindingActions.length);
  expect(keys.resolve('KeyJ', true)).toBe('VehicleLock');
  expect(keys.resolve('KeyU', true)).toBe('Fridge');
  expect(keys.resolve('KeyO', true)).toBe('CabinWalk');
  expect(keys.resolve('KeyR', true)).toBe('Roadbook');
  expect(keys.format('旅途路书 · {Roadbook}')).toBe('旅途路书 · Shift+R');
  keys.bind('Ignition', 'Shift+KeyZ'); expect(keys.format('{Ignition} 点火')).toBe('Shift+Z 点火');
});

it('rebinds actions, rejects conflicts and restores defaults', () => {
  const keys = new KeyBindings();
  keys.bind('Autopilot', 'F9');
  expect(keys.resolve('F9', false)).toBe('Autopilot');
  expect(keys.resolve('F4', false)).toBeUndefined();
  expect(() => keys.bind('KeyL', 'F9')).toThrow();
  expect(() => keys.bind('KeyL', 'Escape')).toThrow();
  keys.reset();
  expect(keys.resolve('Semicolon', false)).toBe('Autopilot');
  expect(keys.resolve('KeyL', false)).toBe('KeyL');
});

it('keeps shifted equipment controls separate and validates stored data atomically', () => {
  const keys = new KeyBindings();
  expect(keys.resolve('KeyG', true)).toBe('Refill');
  expect(keys.resolve('KeyG', false)).toBe('KeyG');
  keys.bind('Autopilot', 'F9');
  const saved = keys.snapshot(), restored = new KeyBindings();
  restored.load(saved);
  expect(restored.resolve('F9', false)).toBe('Autopilot');
  expect(() => restored.load({ ...saved, KeyL: 'F9' })).toThrow();
  expect(restored.resolve('KeyL', false)).toBe('KeyL');
});
