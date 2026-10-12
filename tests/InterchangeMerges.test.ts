import { expect, it } from 'vitest';
import { highwayInterchange } from '../src/road/HighwayInterchange';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { roadProfile } from '../src/road/RoadProfile';
import { accessQuads } from '../src/road/SurfaceRibbon';
import { INTERCHANGE_EXTENT } from '../src/road/JunctionSchedule';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it.each([5, 12])('provides connected acceleration and deceleration lanes on a %s m highway', roadWidth => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, roadWidth };
  const start = new RoadGenerator('merge-lanes', { sample: () => 100 }, options).start;
  const center = new RoadSegment({ ...start, heading: 0.7, position: { x: 80000, y: 180, z: -80000 } }, 0.7, 0).sample(0);
  const plan = highwayInterchange('merge-lanes', center, options), width = roadProfile(options).outerHalfWidth;
  for (const ramp of plan.ramps) {
    const quads = accessQuads(ramp.points.slice(1).map((b, i) => ({ a: ramp.points[i], b })));
    for (const [direction, points, minimum] of [[ramp.from, ramp.points, 220], [ramp.to, [...ramp.points].reverse(), 280]] as const) {
      const angle = center.heading + direction * Math.PI / 2;
      const lateral = (p: { x: number; z: number }) => (p.x - center.position.x) * Math.cos(angle) + (p.z - center.position.z) * Math.sin(angle);
      let distance = 0, outside = false;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i]; distance += Math.hypot(b.x - a.x, b.z - a.z);
        if (lateral(b) - b.halfWidth! > width + 0.05) break;
        expect(b.y).toBeCloseTo(points[0].y, 5);
        if (distance < minimum && lateral(b) > width + 1) outside = true;
      }
      expect(distance).toBeGreaterThan(minimum);
      expect(outside).toBe(true);
      for (const p of direction === ramp.from ? [quads[0].leftA, quads[0].rightA] : [quads.at(-1)!.leftB, quads.at(-1)!.rightB]) {
        expect(lateral(p)).toBeGreaterThan(2);
        expect(lateral(p)).toBeLessThan(width);
      }
    }
    for (const port of [ramp.entry, ramp.exit]) {
      expect(Math.max(Math.abs(port.start), Math.abs(port.end))).toBeLessThan(INTERCHANGE_EXTENT);
    }
  }
});
