import { expect, it } from 'vitest';
import { bridgeTier, bridgeSpacing } from '../src/bridge/BridgeProfile';
import { hasRoadBarrier } from '../src/road/RoadProtection';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it('upgrades span size strictly above 50 m and 100 m', () => {
  expect([5, 50, 50.01, 100, 100.01, 350].map(bridgeTier)).toEqual([0, 0, 1, 1, 2, 2]);
  expect([20, 75, 150, 350].map(bridgeSpacing)).toEqual([48, 96, 192, 192]);
});

it('leaves repeatable openings on ground roads and always protects bridges and tunnels', () => {
  const segment = new RoadSegment(new RoadGenerator('rail', { sample: () => 100 }).start, 0, 0, 6000);
  const samples = Array.from({ length: 61 }, (_, i) => segment.sample(i / 60));
  const context = { seed: 'rail', options: DEFAULT_OPTIONS, bridges: [], tunnels: [], services: [] };
  const guards = samples.map(sample => hasRoadBarrier(context, sample, 1));
  expect(guards.some(Boolean)).toBe(true); expect(guards.some(value => !value)).toBe(true);
  expect(samples.map(sample => hasRoadBarrier(context, sample, 1))).toEqual(guards);
  const span = { start: samples[0], end: samples.at(-1)! };
  for (const sample of samples) for (const side of [-1, 1]) {
    expect(hasRoadBarrier({ ...context, bridges: [span] }, sample, side)).toBe(true);
    expect(hasRoadBarrier({ ...context, tunnels: [span] }, sample, side)).toBe(true);
  }
});
