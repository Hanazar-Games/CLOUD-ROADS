import { describe, expect, it } from 'vitest';
import { buildRoadbook, travelDirection, type RoadbookSource, type RoutePoint } from '../src/road/Roadbook';
import { RoadSpine } from '../src/road/RoadSpine';

const point = (distance: number, y = distance / 10, grade = 0.1): RoutePoint => ({ distance, position: { x: 0, y, z: -distance }, grade, heading: 0 });
const source = (samples = Array.from({ length: 101 }, (_, i) => point(i * 50))): RoadbookSource => ({
  samples, bridges: [], tunnels: [], services: [], passes: [], junctions: [],
});

describe('roadbook preview', () => {
  it('starts at the actual location and clips to the requested distance', () => {
    const result = buildRoadbook(source(), point(125), 1, 1000)!;
    expect(result.length).toBe(1000);
    expect(result.points[0].distance).toBe(125);
    expect(result.points.at(-1)!.distance).toBe(1125);
    expect(result.ascent).toBeCloseTo(100);
    expect(result.descent).toBe(0);
    expect(result.maxGrade).toBeCloseTo(10);
    expect(result.partial).toBe(false);
  });

  it('reverses point order, slope and ascent when travelling back', () => {
    const result = buildRoadbook(source(), point(1125), -1, 1000)!;
    expect(result.points.at(-1)!.distance).toBe(125);
    expect(result.points[0].grade).toBeCloseTo(-0.1);
    expect(result.ascent).toBe(0);
    expect(result.descent).toBeCloseTo(100);
    expect(result.minElevation).toBeCloseTo(12.5);
    expect(result.maxElevation).toBeCloseTo(112.5);
    expect(result.points.map(p => p.ahead)).toEqual([...result.points.map(p => p.ahead)].sort((a, b) => a - b));
  });

  it('never extrapolates an unloaded road or stitches across a recycled window', () => {
    const result = buildRoadbook(source(), point(4750), 1, 3000)!;
    expect(result.length).toBe(250);
    expect(result.partial).toBe(true);
    expect(result.points.at(-1)!.distance).toBe(5000);
    expect(buildRoadbook(source([]), point(0), 1, 3000)).toBeUndefined();
    expect(buildRoadbook(source([point(100), point(200)]), point(50), 1, 3000)).toBeUndefined();
    expect(buildRoadbook(source(), point(5000), 1, 3000)!.length).toBe(0);
  });

  it('counts short climbs between display samples and bounds preview allocations', () => {
    const data = source(Array.from({ length: 5001 }, (_, i) => point(i, i === 17 ? 5 : 0, 0)));
    const result = buildRoadbook(data, point(0, 0, 0), 1, 5000)!;
    expect(result.ascent).toBe(5);
    expect(result.descent).toBe(5);
    expect(result.points.length).toBeLessThanOrEqual(161);
  });

  it('orders actual facilities ahead and discards places behind or beyond the horizon', () => {
    const data = source();
    data.passes = [point(50), point(800), point(3000)];
    data.services = [{ sample: point(600) }];
    data.junctions = [{ sample: point(500) }];
    data.bridges = [{ start: point(300), end: point(450), openStart: false, openEnd: false }];
    const result = buildRoadbook(data, point(100), 1, 1000)!;
    expect(result.events.map(e => [e.kind, e.ahead])).toEqual([['bridge', 200], ['junction', 400], ['service', 500], ['pass', 700]]);
    expect(result.points.some(p => p.kind === 'bridge')).toBe(true);
  });

  it('uses the far portal as entrance in reverse and knows when an exit is not loaded', () => {
    const data = source();
    data.tunnels = [{ start: point(1000), end: point(4000), entrance: 800, openStart: true, openEnd: true }];
    const inside = buildRoadbook(data, point(2000), 1, 3000)!.events[0];
    expect(inside).toMatchObject({ kind: 'tunnel', inside: true, ahead: 0, endKnown: false });
    const reverse = buildRoadbook(data, point(2000), -1, 3000)!.events[0];
    expect(reverse).toMatchObject({ inside: true, endKnown: true, remaining: 1200 });
    const approach = buildRoadbook(data, point(4500), -1, 3000)!.events[0];
    expect(approach).toMatchObject({ ahead: 500, inside: false });
  });

  it('uses tunnel extents and prioritizes tunnels where detection buffers overlap', () => {
    const data = source();
    data.bridges = [{ start: point(300), end: point(450) }];
    data.tunnels = [{ start: point(320), end: point(500), entrance: 310, exit: 510 }];
    const result = buildRoadbook(data, point(350), 1, 1000)!;
    expect(result.points[0].kind).toBe('tunnel');
    expect(result.events.find(e => e.kind === 'tunnel')).toMatchObject({ remaining: 160, endKnown: true });
  });

  it('has stable direction around wrapped headings and keeps input data unchanged', () => {
    expect(travelDirection(2 * Math.PI - 0.1, 0)).toBe(1);
    expect(travelDirection(Math.PI, 0)).toBe(-1);
    const data = source(), before = JSON.stringify(data);
    buildRoadbook(data, point(1000), -1, 5000);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('reads generated roads without extending them and follows recycled windows', () => {
    const road = new RoadSpine('ROADBOOK-STREAM');
    for (const z of [0, -15000, 0]) {
      for (let i = 0; i < 1500 && !road.update(z); i++) { /* Drain incremental generation. */ }
      const samples = road.samples, current = samples[Math.floor(samples.length / 2)], data = source([...samples]);
      const version = road.version, generated = road.generated, count = road.segments.length;
      for (const direction of [1, -1] as const) {
        const book = buildRoadbook(data, current, direction, 5000)!;
        expect(book.points.length).toBeLessThanOrEqual(161);
        expect(book.points.every(p => Object.values(p.position).every(Number.isFinite))).toBe(true);
        expect(book.ascent - book.descent).toBeCloseTo(book.points.at(-1)!.position.y - book.points[0].position.y, 7);
        expect(book.points.at(-1)!.distance).toBeCloseTo(current.distance + book.length * direction);
      }
      expect([road.version, road.generated, road.segments.length]).toEqual([version, generated, count]);
    }
  });

  it('replaces previous route facilities and handles large world coordinates without retaining data', () => {
    const before = source(); before.passes = [point(250)];
    expect(buildRoadbook(before, point(0), 1, 1000)!.events).toHaveLength(1);
    const next = source(before.samples.map(p => ({ ...p, position: { ...p.position, x: p.position.x + 800000, z: p.position.z - 500000 } })));
    const book = buildRoadbook(next, next.samples[0], 1, 1000)!;
    expect(book.events).toEqual([]);
    expect(book.points[0].position.x).toBe(800000);
    expect(book.points.at(-1)!.position.z).toBe(-501000);
    expect(book.ascent).toBeCloseTo(100);
  });
});
