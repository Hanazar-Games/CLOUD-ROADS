import { describe, expect, it } from 'vitest';
import { BridgeDetector, MAX_BRIDGE_LENGTH } from '../src/bridge/BridgeDetector';
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
  it('requires a sustained deep crossing with two ground anchors', () => {
    const samples = route(), terrain = valley();
    const spans = new BridgeDetector(terrain).detect(samples);
    expect(spans).toHaveLength(1);
    const span = spans[0];
    expect(span.depth).toBeCloseTo(120, 1);
    expect(span.end.distance - span.start.distance).toBeGreaterThan(400);
    for (const anchor of [span.start, span.end]) {
      expect(anchor.position.y - terrain.sample(anchor.position.x, anchor.position.z)).toBeLessThanOrEqual(12);
    }
    expect(new BridgeDetector(valley(30)).detect(samples)).toHaveLength(0);
    expect(new BridgeDetector(valley(120, 80)).detect(samples)).toHaveLength(0);
    expect(new BridgeDetector(terrain).detect(samples.slice(0, 100))).toHaveLength(0);
    expect(new BridgeDetector(terrain).detect(samples.slice(100))).toHaveLength(0);
    expect(new BridgeDetector(valley(120, MAX_BRIDGE_LENGTH + 1000)).detect(route(4000))).toHaveLength(0);
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

  it('rejects crossings whose shoulders would intersect a cliff', () => {
    const terrain = valley();
    const cliff = { sample: (x: number, z: number) => x > 3 ? 220 : terrain.sample(x, z) };
    expect(new BridgeDetector(cliff).detect(route())).toHaveLength(0);
  });
});
