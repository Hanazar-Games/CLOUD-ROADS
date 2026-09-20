import { expect, it } from 'vitest';
import { WalkingPhysics, type WalkingInput } from '../src/walking/WalkingPhysics';

const flat = { sample: () => ({ height: 10, grip: 1 }), constrainWalker: () => false };
const idle: WalkingInput = { forward: 0, lateral: 0, run: false, sprint: false, jump: false };
const move = (input: Partial<WalkingInput>, seconds = 3, hz = 60) => {
  const person = new WalkingPhysics(); person.reset(0, 10, 0, 0);
  for (let i = 0; i < seconds * hz; i++) person.update(1 / hz, { ...idle, ...input }, flat);
  return person;
};

it('accelerates through walking, running and sprinting without a diagonal speed advantage', () => {
  const walk = move({ forward: 1 }), run = move({ forward: 1, run: true }), sprint = move({ forward: 1, run: true, sprint: true });
  expect(walk.speed).toBeCloseTo(2.2, 2);
  expect(run.speed).toBeCloseTo(4.8, 2);
  expect(sprint.speed).toBeCloseTo(8, 2);
  expect(-run.z).toBeGreaterThan(-walk.z * 1.7);
  expect(-sprint.z).toBeGreaterThan(-run.z * 1.4);
  const diagonal = move({ forward: 1, lateral: 1 });
  expect(diagonal.speed).toBeCloseTo(walk.speed, 3);
  expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(-walk.z, 4);
  expect(move({ forward: 1, sprint: true }).speed).toBeCloseTo(8, 2);
  for (let i = 0; i < 60; i++) sprint.update(1 / 60, idle, flat);
  expect(sprint.speed).toBe(0);
});

it('stops upward movement at an overhead bridge structure', () => {
  const person = new WalkingPhysics(); person.reset(0, 10, 0, 0);
  const covered = { ...flat, ceiling: () => 12.2 };
  let peak = person.y;
  for (let i = 0; i < 90; i++) { person.update(1 / 60, { ...idle, jump: i === 0 }, covered); peak = Math.max(peak, person.y); }
  expect(peak + 1.75).toBeLessThanOrEqual(12.20001);
  expect(person.grounded).toBe(true);
});

it('jumps once per press, lands on the same surface and gives consistent results across frame rates', () => {
  const person = new WalkingPhysics(); person.reset(0, 10, 0, 0);
  person.update(1 / 60, { ...idle, jump: true }, flat);
  expect(person.grounded).toBe(false);
  let peak = person.y;
  for (let i = 0; i < 180; i++) { person.update(1 / 60, { ...idle, jump: true }, flat); peak = Math.max(peak, person.y); }
  expect(peak).toBeGreaterThan(11);
  expect(person.y).toBe(10); expect(person.grounded).toBe(true);
  person.update(1 / 60, idle, flat);
  person.update(1 / 60, { ...idle, jump: true }, flat);
  expect(person.y).toBeGreaterThan(10);
  const a = move({ forward: 1, jump: true }, 2, 30), b = move({ forward: 1, jump: true }, 2, 120);
  expect(a.z).toBeCloseTo(b.z, 5); expect(a.y).toBeCloseTo(b.y, 5);
});

it('steps down under gravity and cannot walk up vertical terrain or climb during a jump', () => {
  const person = new WalkingPhysics(); person.reset(0, 10, 0, 0);
  const cliff = { ...flat, sample: (_x: number, z: number) => ({ height: z < -2 ? 30 : 10, grip: 1 }) };
  for (let i = 0; i < 120; i++) person.update(1 / 60, { ...idle, forward: 1, jump: i === 30 }, cliff);
  expect(person.z).toBeGreaterThan(-2); expect(person.y).toBe(10);
  const ledge = { ...flat, sample: (_x: number, z: number) => ({ height: z < -2 ? 0 : 10, grip: 1 }) };
  for (let i = 0; i < 240; i++) person.update(1 / 60, { ...idle, forward: 1 }, ledge);
  expect(person.z).toBeLessThan(-2); expect(person.y).toBe(0); expect(person.grounded).toBe(true);
});
