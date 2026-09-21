import { describe, expect, it } from 'vitest';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { BridgeDetector } from '../src/bridge/BridgeDetector';
import { TunnelDetector } from '../src/tunnel/TunnelDetector';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { cableSpans } from '../src/bridge/CableBridgeMesh';

describe('terrain-led structure alignments', () => {
  it.each([4900, 5000])('retains a complete %i m bore close to the tunnel length limit', length => {
    const terrain = { sample: (_x: number, z: number) => 128 - z > 450 && 128 - z < 450 + length ? 850 : 500 };
    const options = { ...DEFAULT_OPTIONS, routeStyle: 0 as const }, generator = new RoadGenerator('limit', terrain, options);
    let point = generator.start; const samples = [];
    while (point.distance < 6000) {
      const segment = generator.next(point);
      for (let i = 0; i < 48; i++) samples.push(segment.sample(i / 48));
      point = segment.end;
    }
    const spans = new TunnelDetector(terrain, options).detect(samples, []);
    expect(spans).toHaveLength(1);
    expect(spans[0].end.distance - spans[0].start.distance).toBeGreaterThan(length - 8);
    expect(spans[0].end.distance - spans[0].start.distance).toBeLessThanOrEqual(5000);
    expect(spans[0].openStart).toBe(false); expect(spans[0].openEnd).toBe(false);
  });

  it.each([[1, 'natural'], [5, 'natural'], [5, 'cycles']] as const)('plans a straight shallow-grade crossing before winding level %i enters a deep valley (%s)', (routeStyle, elevationMode) => {
    const terrain = { sample: (_x: number, z: number) => {
      const t = Math.max(0, Math.min(1, (128 - z - 400) / 1400));
      return 500 - Math.sin(t * Math.PI) ** 2 * 360;
    } };
    const options = { ...DEFAULT_OPTIONS, routeStyle, elevationMode }, generator = new RoadGenerator('deep-valley', terrain, options);
    let point = generator.start; const samples = [];
    while (point.distance < 2600) {
      const segment = generator.next(point);
      for (let i = 0; i < 48; i++) samples.push(segment.sample(i / 48));
      point = segment.end;
    }
    const span = new BridgeDetector(terrain, options).detect(samples).find(span => span.depth > 200)!;
    expect(span).toBeDefined();
    const cables = cableSpans([span], terrain, RoadCorridor.fromSamples(samples, [span], options), options);
    expect(cables).toHaveLength(1);
    expect(cables[0].towers.every(s => s.position.y - terrain.sample(s.position.x, s.position.z) > 200)).toBe(true);
    for (const sample of span.samples) {
      expect(Math.abs(sample.curvature)).toBeLessThan(1e-8);
      expect(Math.abs(sample.grade)).toBeLessThanOrEqual(0.01);
      expect(sample.heading).toBeCloseTo(span.start.heading, 8);
    }
  });

  it('keeps a continuous long tunnel within 5 km and preserves its ends across streaming windows', () => {
    const terrain = { sample: (_x: number, z: number) => {
      const d = 128 - z; return d > 450 && d < 4550 ? 850 : 500;
    } };
    const generator = new RoadGenerator('long-tunnel', terrain, { ...DEFAULT_OPTIONS, routeStyle: 0 });
    let point = generator.start; const samples = [];
    while (point.distance < 5500) {
      const segment = generator.next(point);
      for (let i = 0; i < 48; i++) samples.push(segment.sample(i / 48));
      point = segment.end;
    }
    const detector = new TunnelDetector(terrain), spans = detector.detect(samples, []);
    expect(spans).toHaveLength(1);
    const span = spans[0];
    expect(span.end.distance - span.start.distance).toBeGreaterThan(3500);
    expect(span.end.distance - span.start.distance).toBeLessThanOrEqual(5000);
    const middle = detector.detect(samples.filter(p => p.distance > 1500 && p.distance < 3500), []);
    expect(middle).toHaveLength(1);
    expect(middle[0].openStart).toBe(true); expect(middle[0].openEnd).toBe(true);
    const replay = new RoadGenerator('long-tunnel', terrain, { ...DEFAULT_OPTIONS, routeStyle: 0 });
    let checkpoint = JSON.parse(JSON.stringify(samples.find(p => p.distance >= 2048)!));
    let original = samples.find(p => p.distance >= 2048)!;
    for (let i = 0; i < 48; i++) {
      const a = generator.next(original), b = replay.next(checkpoint);
      expect(a.end).toEqual(b.end);
      original = a.sample(1); checkpoint = b.sample(1);
    }
  });
});
