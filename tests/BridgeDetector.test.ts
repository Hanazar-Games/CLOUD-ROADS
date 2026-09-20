import { describe, expect, it } from 'vitest';
import { BridgeDetector } from '../src/bridge/BridgeDetector';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { RoadSpine } from '../src/road/RoadSpine';
import { HeightFunction } from '../src/terrain/HeightFunction';

const route = (length = 1200) => {
  const start = new RoadGenerator('bridge', { sample: () => 200 }).start;
  start.position = { x: 0, y: 200, z: 0 };
  const segment = new RoadSegment(start, 0, 0, length);
  return Array.from({ length: length / 4 + 1 }, (_, i) => segment.sample(i * 4 / length));
};
const valley = (depth = 120, length = 600) => ({
  sample: (_x: number, z: number) => 200 - depth * Math.sin(Math.PI * Math.max(0, Math.min(1, (-z - 100) / length))) ** 2,
});

describe('BridgeDetector', () => {
  it('uses earthworks up to 5 m and bridges higher gaps, including short and open crossings', () => {
    const samples = route(), terrain = valley();
    const spans = new BridgeDetector(terrain).detect(samples);
    expect(spans).toHaveLength(1);
    const span = spans[0];
    expect(span.depth).toBeCloseTo(120, 1);
    expect(span.end.distance - span.start.distance).toBeGreaterThan(400);
    for (const anchor of [span.start, span.end]) {
      expect(anchor.position.y - terrain.sample(anchor.position.x, anchor.position.z)).toBeLessThanOrEqual(5);
    }
    expect(new BridgeDetector(valley(5)).detect(samples)).toHaveLength(0);
    expect(new BridgeDetector(valley(5.01)).detect(samples)).toHaveLength(1);
    expect(new BridgeDetector(valley(30)).detect(samples)).toHaveLength(1);
    expect(new BridgeDetector(valley(120, 80)).detect(samples)).toHaveLength(1);
    expect(new BridgeDetector(terrain).detect(samples.slice(0, 100))[0].openEnd).toBe(true);
    expect(new BridgeDetector(terrain).detect(samples.slice(100))[0].openStart).toBe(true);
    expect(new BridgeDetector(valley(120, 3000)).detect(route(4000))).toHaveLength(1);
  });

  it('keeps open deep valleys unfilled across window boundaries and splits only service approaches', () => {
    const samples = route(8000), terrain = { sample: () => 20 }, detector = new BridgeDetector(terrain);
    const before = RoadCorridor.fromSamples(samples, detector.detect(samples));
    const clipped = samples.slice(100, -100);
    const after = RoadCorridor.fromSamples(clipped, detector.detect(clipped));
    for (const sample of [clipped[0], clipped[1], clipped.at(-1)!]) {
      expect(before.height(0, sample.position.z, 20)).toBe(20);
      expect(after.height(0, sample.position.z, 20)).toBe(20);
    }
    const split = detector.detect(samples, [{ start: 3600, end: 4100 }]);
    expect(split).toHaveLength(2);
    expect(split[0].end.distance).toBeLessThanOrEqual(3604);
    expect(split[1].start.distance).toBeGreaterThanOrEqual(4096);
    const corridor = RoadCorridor.fromSamples(samples, split);
    expect(corridor.height(0, -2000, 20)).toBe(20);
    expect(corridor.height(0, -6000, 20)).toBe(20);
  });

  it('preserves the natural valley below the span and joins earthworks at both anchors', () => {
    const samples = route(), terrain = valley();
    const [bridge] = new BridgeDetector(terrain).detect(samples);
    const corridor = RoadCorridor.fromSamples(samples, [bridge]);
    expect(corridor.height(0, -400, terrain.sample(0, -400))).toBe(80);
    for (const anchor of [bridge.start, bridge.end]) {
      const { x, y, z } = anchor.position;
      expect(corridor.height(x, z, terrain.sample(x, z))).toBeCloseTo(y - 0.08, 5);
    }
    const local = new RoadCorridor(structuredClone(corridor.forChunk(0, -2)));
    for (let z = -256; z >= -512; z -= 4) {
      expect(local.height(0, z, terrain.sample(0, z))).toBe(corridor.height(0, z, terrain.sample(0, z)));
    }
  });

  it('keeps bridge decisions stable inside overlapping terrain windows and bounds cached samples', () => {
    const terrain = new HeightFunction('CLOUD-ROAD-001');
    const detector = new BridgeDetector(terrain), spine = new RoadSpine('CLOUD-ROAD-001');
    let found = 0;
    for (let z = 0; z >= -100_000; z -= 512) {
      while (!spine.update(z, 8)) { /* Load the detection halo before terrain. */ }
      const samples = spine.samples;
      const before = detector.detect(samples);
      found += before.length;
      expect(detector.cachedSamples).toBeLessThanOrEqual(samples.length);
      const current = RoadCorridor.fromSamples(samples, before);
      const checkpoints = samples.filter((sample, i) => i % 48 === 0 && Math.abs(sample.position.z - z) < 1800);
      while (!spine.update(z - 256, 8)) { /* Shift the retained window. */ }
      const next = RoadCorridor.fromSamples(spine.samples, detector.detect(spine.samples));
      for (const sample of checkpoints) {
        const { x, z: sz } = sample.position, natural = terrain.sample(x, sz);
        expect(next.height(x, sz, natural)).toBeCloseTo(current.height(x, sz, natural), 6);
      }
    }
    expect(found).toBeGreaterThan(0);
  }, 30_000);

  it('cuts the uphill shoulder clear while retaining a bridge over the valley', () => {
    const terrain = valley();
    const cliff = { sample: (x: number, z: number) => x > 3 ? 220 : terrain.sample(x, z) };
    const samples = route(), spans = new BridgeDetector(cliff).detect(samples);
    expect(spans).toHaveLength(1);
    const corridor = RoadCorridor.fromSamples(samples, spans);
    expect(corridor.height(4, -400, 220)).toBeLessThan(197);
    expect(corridor.height(-4, -400, 80)).toBe(80);
  });
});
