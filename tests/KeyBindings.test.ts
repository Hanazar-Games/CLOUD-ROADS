import { expect, it } from 'vitest';
import { KeyBindings } from '../src/input/KeyBindings';

it('rebinds actions, rejects conflicts and restores defaults', () => {
  const keys = new KeyBindings();
  keys.bind('Autopilot', 'F9');
  expect(keys.resolve('F9', false)).toBe('Autopilot');
  expect(keys.resolve('F4', false)).toBeUndefined();
  expect(() => keys.bind('KeyL', 'F9')).toThrow();
  expect(() => keys.bind('KeyL', 'Escape')).toThrow();
  keys.reset();
  expect(keys.resolve('F4', false)).toBe('Autopilot');
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
