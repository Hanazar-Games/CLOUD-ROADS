import { expect, it } from 'vitest';
import { constrainObstacle } from '../src/service/ServiceCollision';

const obstacle = { x: 0, z: 0, heading: 0, width: 2, front: 3, rear: -3 };

it('sweeps across a whole obstacle instead of testing only the destination', () => {
  const body = { x: 8, z: 1 };
  expect(constrainObstacle(body, -8, -1, 0.4, obstacle)).toBe(true);
  expect(body.x).toBeCloseTo(-1.4);
  expect(body.z).toBe(1);
});

it('uses the first face on a diagonal entry and lets an overlapping body move out', () => {
  const body = { x: 0, z: 0 };
  expect(constrainObstacle(body, -2, -10, 0.4, obstacle)).toBe(true);
  expect(body.z).toBeCloseTo(-3.4);
  const escape = { x: 2, z: 0 };
  expect(constrainObstacle(escape, 1.3, 0, 0.4, obstacle)).toBe(false);
});

it('keeps tangential motion free at contact and rejects near misses', () => {
  for (const x of [-1.4, -1.41]) {
    const body = { x, z: -10 };
    expect(constrainObstacle(body, x, 10, 0.4, obstacle)).toBe(false);
  }
});
