import type { RoadSpine } from './RoadSpine';

export function roadRenderWindows<T extends { id: string; road: RoadSpine }>(routes: readonly T[], active: T, x: number, z: number) {
  const nearby = routes.flatMap(route => {
    const sample = route.road.nearest(x, z);
    return sample ? [{ route, sample, distance: Math.hypot(sample.position.x - x, sample.position.z - z) }] : [];
  }).filter(item => item.route === active || item.distance < 6000)
    .sort((a, b) => a.route === active ? -1 : b.route === active ? 1 : a.distance - b.distance);
  let remaining = 256;
  return nearby.map(({ route, sample }, i) => {
    const all = route.road.segments, at = Math.max(0, all.findIndex(s => s.end.distance >= sample.distance));
    const budget = i === 0 ? nearby.length > 2 ? 128 : 192 : Math.min(64, Math.floor(remaining / (nearby.length - i)));
    const count = Math.min(remaining, budget, all.length), first = Math.max(0, Math.min(all.length - count, at - Math.floor(count / 3)));
    const segments = all.slice(first, first + count); remaining -= segments.length;
    return { route, segments };
  }).filter(window => window.segments.length > 0);
}
