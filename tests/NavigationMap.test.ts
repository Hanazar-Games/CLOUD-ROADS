import { expect, it } from 'vitest';
import { buildNavigation } from '../src/road/NavigationMap';
import type { RoadbookSource } from '../src/road/Roadbook';

const samples = Array.from({ length: 101 }, (_, i) => ({ distance: i * 25,
  position: { x: 0, y: 100 + i, z: -i * 25 }, heading: 0, grade: 0.04 }));
const source: RoadbookSource = { samples, bridges: [], tunnels: [], services: [{ sample: samples[60] }], passes: [], junctions: [] };

it('projects the real vehicle position and distinguishes an adjacent ramp from the main route', () => {
  const pose = { x: 40, y: 140, z: -1000, heading: 0, speed: 10 };
  const map = buildNavigation(source, samples[40], pose, 8)!;
  expect(map.onRoad).toBe(false);
  expect(map.points.every(p => p.x < map.position.x)).toBe(true);
  expect(map.events[0].kind).toBe('service');
  expect(map.events[0].y).toBeLessThan(map.position.y);
  expect(buildNavigation(source, samples[40], { ...pose, x: 0, y: 90 }, 8)!.onRoad).toBe(false);
});

it('faces the vehicle heading, follows reverse travel and stops at loaded boundaries', () => {
  const pose = { ...samples[40].position, heading: Math.PI, speed: 10 };
  const map = buildNavigation(source, samples[40], pose, 8)!;
  expect(map.direction).toBe(-1);
  expect(map.book.partial).toBe(true);
  expect(map.book.points.at(-1)!.distance).toBe(0);
  expect(map.points.at(-1)!.y).toBeLessThan(map.position.y);
  const reverse = buildNavigation(source, samples[40], { ...pose, heading: 0, speed: -3 }, 8)!;
  expect(reverse.direction).toBe(-1);
  expect(reverse.points.at(-1)!.y).toBeGreaterThan(reverse.position.y);
});

it('is invariant under world translation and returns no stale route when the road is unavailable', () => {
  const pose = { ...samples[40].position, heading: 0, speed: 1 };
  const map = buildNavigation(source, samples[40], pose, 8)!;
  const shifted = samples.map(s => ({ ...s, position: { ...s.position, x: s.position.x + 1e7, z: s.position.z - 2e7 } }));
  const next = buildNavigation({ ...source, samples: shifted, services: [] }, shifted[40], { ...pose, x: pose.x + 1e7, z: pose.z - 2e7 }, 8)!;
  expect(next.points).toEqual(map.points);
  expect(buildNavigation(source, undefined, pose, 8)).toBeUndefined();
  expect(buildNavigation({ ...source, samples: [] }, samples[40], pose, 8)).toBeUndefined();
  for (const point of map.points) {
    expect(point.x).toBeGreaterThanOrEqual(16); expect(point.x).toBeLessThanOrEqual(368);
    expect(point.y).toBeGreaterThanOrEqual(40); expect(point.y).toBeLessThanOrEqual(180);
  }
});
