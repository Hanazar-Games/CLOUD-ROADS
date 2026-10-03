import { expect, it } from 'vitest';
import { RoadSpine } from '../src/road/RoadSpine';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { roadRenderWindows } from '../src/road/RoadRenderWindow';

it('keeps all nearby interchange approaches visible within a fixed segment budget and follows the viewer', () => {
  const options = { ...DEFAULT_OPTIONS, routeStyle: 0 as const, maxGrade: 0 };
  const routes = Array.from({ length: 4 }, (_, i) => {
    const road = new RoadSpine(`window-${i}`, { sample: () => 100 }, options);
    while (!road.advanceToDistance(24000)) { /* Fill each road window. */ }
    return { id: `road-${i}`, road, ready: i === 0 };
  });
  const p = routes[0].road.samples[200].position;
  const windows = roadRenderWindows(routes, routes[0], p.x, p.z);
  expect(windows).toHaveLength(4);
  expect(windows.reduce((sum, w) => sum + w.segments.length, 0)).toBeLessThanOrEqual(256);
  for (const { route, segments } of windows) {
    const distance = route.road.nearest(p.x, p.z)!.distance;
    expect(segments[0].start.distance).toBeLessThanOrEqual(distance);
    expect(segments.at(-1)!.end.distance).toBeGreaterThan(distance);
  }
  const end = routes[0].road.samples.at(-100)!.position;
  const moved = roadRenderWindows(routes, routes[0], end.x, end.z);
  expect(moved[0].segments[0].start.distance).toBeGreaterThan(windows[0].segments[0].start.distance);
});
