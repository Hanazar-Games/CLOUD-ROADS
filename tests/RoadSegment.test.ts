import { expect, it, vi } from 'vitest';
import { RoadSegment, type RoadControlPoint } from '../src/road/RoadSegment';

const start = (grade: number): RoadControlPoint => ({
  position: { x: 82000, y: 530, z: -230000 }, heading: 0.6, grade,
  distance: 160000, width: 8, bank: 0, nextMountain: 0,
});

it.each([
  [0, 0, 0, 1200], [0.4, 0.4, Math.PI, 96], [-0.4, 0.4, -Math.PI, 72],
  [0.4, -0.4, Math.PI, 96], [0, 0.01, 0, 1200], [-0.04, -0.08, 0.2, 96],
])('inverts arc distance on grades %s to %s and heading change %s over %s m', (from, to, turn, length) => {
  const segment = new RoadSegment(start(from), 0.6 + turn, to, length);
  for (const t of [0, 0.00001, 1 / 24, 0.125, 0.5, 0.73, 23 / 24, 0.99999, 1]) {
    const expected = segment.sample(t), actual = segment.atDistance(expected.distance);
    expect(Math.hypot(actual.position.x - expected.position.x, actual.position.y - expected.position.y,
      actual.position.z - expected.position.z)).toBeLessThan(0.00001);
    expect(actual.distance).toBeCloseTo(expected.distance, 5);
    expect(actual.heading).toBeCloseTo(expected.heading, 6);
    expect(actual.grade).toBeCloseTo(expected.grade, 6);
    expect(actual.bank).toBeCloseTo(expected.bank, 6);
    expect(actual.curvature).toBeCloseTo(expected.curvature, 6);
    for (const axis of ['x', 'y', 'z'] as const) expect(actual.tangent[axis]).toBeCloseTo(expected.tangent[axis], 6);
  }
});

it('constructs only the final road sample for a distance query', () => {
  const segment = new RoadSegment(start(-0.4), -2.6, 0.4);
  const distance = segment.sample(0.731).distance;
  const sample = vi.spyOn(segment, 'sample');
  expect(segment.atDistance(distance).distance).toBeCloseTo(distance, 5);
  expect(sample).toHaveBeenCalledTimes(1);
});

it('clamps outside distances to exact endpoints and joins adjacent segments continuously', () => {
  const first = new RoadSegment(start(0.2), 1.9, -0.3), second = new RoadSegment(first.end, -0.6, 0.4);
  expect(first.atDistance(first.start.distance - 100)).toEqual(first.sample(0));
  expect(first.atDistance(first.end.distance + 100)).toEqual(first.sample(1));
  const end = first.atDistance(first.end.distance), next = second.atDistance(first.end.distance);
  for (const key of ['position', 'tangent', 'heading', 'grade', 'distance'] as const) expect(end[key]).toEqual(next[key]);
});
