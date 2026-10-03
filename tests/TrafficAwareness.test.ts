import { expect, it } from 'vitest';
import { followingSpeed, laneChangeDuration } from '../src/traffic/TrafficAwareness';

it('follows moving traffic and anticipates braking before the leader has lost speed', () => {
  const cruising = followingSpeed(40, 20, 0, 3, 1.8);
  expect(cruising).toBeGreaterThan(18);
  expect(followingSpeed(40, 20, -5, 3, 1.8)).toBeLessThan(cruising);
  expect(followingSpeed(40, 0, 0, 3, 1.8)).toBeLessThan(cruising);
  expect(followingSpeed(40, 0, 0, 1, 1.8)).toBeLessThan(followingSpeed(40, 0, 0, 3, 1.8));
  expect(followingSpeed(-1, 0, 0, 3, 1.8)).toBe(0);
});

it('gives long vehicles and slippery pavement more time to change lanes', () => {
  expect(laneChangeDuration(4.7, 0.4)).toBeGreaterThan(laneChangeDuration(4.7, 1));
  expect(laneChangeDuration(15, 1)).toBeGreaterThan(laneChangeDuration(4.7, 1));
});
