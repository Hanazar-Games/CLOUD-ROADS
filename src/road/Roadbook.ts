import type { RoadSample } from './RoadSegment';

export type RoutePoint = Pick<RoadSample, 'distance' | 'position' | 'grade' | 'heading'>;
type Structure = { start: RoutePoint; end: RoutePoint; openStart?: boolean; openEnd?: boolean; entrance?: number; exit?: number };
export type RoadbookKind = 'road' | 'bridge' | 'tunnel';
export interface RoadbookSource {
  samples: readonly RoutePoint[];
  bridges: readonly Structure[];
  tunnels: readonly Structure[];
  services: readonly { sample: RoutePoint }[];
  passes: readonly RoutePoint[];
  junctions: readonly { sample: RoutePoint }[];
}
export interface RoadbookEvent {
  kind: Exclude<RoadbookKind, 'road'> | 'service' | 'pass' | 'junction';
  ahead: number; distance: number; inside: boolean; endKnown: boolean; remaining?: number;
}
export interface Roadbook {
  points: (RoutePoint & { ahead: number; kind: RoadbookKind })[];
  events: RoadbookEvent[];
  length: number; partial: boolean; ascent: number; descent: number; maxGrade: number;
  minElevation: number; maxElevation: number;
}

export const travelDirection = (heading: number, roadHeading: number): 1 | -1 => Math.cos(heading - roadHeading) >= 0 ? 1 : -1;

function sampleAt(samples: readonly RoutePoint[], distance: number): RoutePoint {
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].distance <= distance) lo = mid; else hi = mid;
  }
  const a = samples[lo], b = samples[hi], t = b.distance === a.distance ? 0 : (distance - a.distance) / (b.distance - a.distance);
  const mix = (a: number, b: number) => a + (b - a) * t;
  return { distance, position: { x: mix(a.position.x, b.position.x), y: mix(a.position.y, b.position.y), z: mix(a.position.z, b.position.z) },
    grade: mix(a.grade, b.grade), heading: a.heading + Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading)) * t };
}

export function buildRoadbook(source: RoadbookSource, current: RoutePoint, direction: 1 | -1, range: number): Roadbook | undefined {
  const { samples } = source, first = samples[0], last = samples.at(-1);
  if (!first || !last || !Number.isFinite(range) || range <= 0 || current.distance < first.distance || current.distance > last.distance) return;
  const length = Math.min(range, direction > 0 ? last.distance - current.distance : current.distance - first.distance);
  const end = current.distance + direction * length, lo = Math.min(current.distance, end), hi = Math.max(current.distance, end);
  const extent = (span: Structure): [number, number] => [span.entrance ?? span.start.distance, span.exit ?? span.end.distance];
  const structures = ([['bridge', source.bridges], ['tunnel', source.tunnels]] as const)
    .flatMap(([kind, spans]) => spans.map(span => ({ kind, span, bounds: extent(span) })))
    .filter(({ bounds: [a, b] }) => a <= hi && b >= lo);
  const kindAt = (distance: number): RoadbookKind => structures.find(s => s.kind === 'tunnel' && distance >= s.bounds[0] && distance <= s.bounds[1])?.kind
    ?? structures.find(s => distance >= s.bounds[0] && distance <= s.bounds[1])?.kind ?? 'road';
  const count = Math.min(160, Math.ceil(length / 25));
  const points = Array.from({ length: count + 1 }, (_, i) => {
    const ahead = count ? length * i / count : 0, p = sampleAt(samples, current.distance + direction * ahead);
    return { ...p, grade: p.grade * direction, ahead, kind: kindAt(p.distance) };
  });
  let ascent = 0, descent = 0, maxGrade = Math.abs(points[0].grade) * 100;
  let minElevation = points[0].position.y, maxElevation = minElevation, previous = sampleAt(samples, lo);
  minElevation = Math.min(minElevation, previous.position.y); maxElevation = Math.max(maxElevation, previous.position.y);
  maxGrade = Math.max(maxGrade, Math.abs(previous.grade) * 100);
  const accumulate = (p: RoutePoint) => {
    const dy = (p.position.y - previous.position.y) * direction;
    ascent += Math.max(0, dy); descent += Math.max(0, -dy); previous = p;
    maxGrade = Math.max(maxGrade, Math.abs(p.grade) * 100);
    minElevation = Math.min(minElevation, p.position.y); maxElevation = Math.max(maxElevation, p.position.y);
  };
  for (const p of samples) if (p.distance > lo && p.distance < hi) accumulate(p);
  accumulate(sampleAt(samples, hi));
  const events: RoadbookEvent[] = structures.map(({ kind, span, bounds: [a, b] }) => {
    const entrance = direction > 0 ? a : b, exit = direction > 0 ? b : a;
    const ahead = Math.max(0, (entrance - current.distance) * direction);
    const endKnown = direction > 0 ? span.exit !== undefined || !span.openEnd : span.entrance !== undefined || !span.openStart;
    return { kind, ahead, distance: current.distance + direction * ahead, inside: current.distance >= a && current.distance <= b,
      endKnown, remaining: endKnown ? Math.max(0, (exit - current.distance) * direction - ahead) : undefined };
  });
  for (const [kind, places] of [['service', source.services.map(s => s.sample)], ['pass', source.passes], ['junction', source.junctions.map(j => j.sample)]] as const) {
    for (const place of places) {
      const ahead = (place.distance - current.distance) * direction;
      if (ahead >= 0 && ahead <= length) events.push({ kind, ahead, distance: place.distance, inside: false, endKnown: true });
    }
  }
  events.sort((a, b) => a.ahead - b.ahead || a.kind.localeCompare(b.kind));
  return { points, events: events.slice(0, 6), length, partial: length < range - 0.01, ascent, descent, maxGrade, minElevation, maxElevation };
}
