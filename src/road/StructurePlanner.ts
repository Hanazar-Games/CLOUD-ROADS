import type { RoadTerrain } from './RoadGenerator';
import { roadProfile } from './RoadProfile';
import { ROAD_STEP, RoadSegment, type RoadControlPoint, type StructurePlan } from './RoadSegment';
import type { WorldOptions } from '../world/WorldOptions';

export const MAX_TUNNEL_LENGTH = 5000;

export class StructurePlanner {
  private readonly halfWidth: number;
  readonly gradeStep: number;

  constructor(private readonly terrain: RoadTerrain, private readonly options: Readonly<WorldOptions>) {
    this.halfWidth = roadProfile(options).outerHalfWidth;
    this.gradeStep = options.roadType === 'highway' || options.routeStyle === 0
      ? 0.002 * Math.max(1, options.maxGrade / 0.03) : Math.max(0.002, options.maxGrade / 3);
  }

  plan(start: RoadControlPoint): StructurePlan | undefined {
    if (Math.abs(start.grade) > 0.06 || start.elevated) return;
    const { x, y, z } = start.position, sin = Math.sin(start.heading), cos = Math.cos(start.heading);
    const ground = (along: number, offset = 0) => this.terrain.sample(x + sin * along + cos * offset, z - cos * along + sin * offset);
    const ahead = [192, 384, 576, 768].map(d => ground(d) - y);
    const kind = ahead.some(gap => gap < -100) ? 'bridge' : ahead.some(gap => gap > 35) ? 'tunnel' : undefined;
    if (!kind) return;
    if (kind === 'tunnel' && [192, 384, 576, 768].every(d =>
      Math.abs(ground(d) - ground(d - 192)) / 192 <= this.options.maxGrade * 0.8)) return;
    const limit = kind === 'bridge' ? 0.01 : 0.03, grade = Math.max(-limit, Math.min(limit, start.grade));
    const approach: RoadSegment[] = [];
    let point = start;
    do {
      const target = Math.abs(grade - point.grade) <= this.gradeStep ? grade : point.grade + Math.sign(grade - point.grade) * this.gradeStep;
      const segment = new RoadSegment(point, start.heading, target);
      approach.push(segment); point = segment.end;
    } while (point.grade !== grade);
    const approachLength = approach.length * ROAD_STEP;
    const at = (d: number) => approach[Math.floor(d / ROAD_STEP)].sample(d % ROAD_STEP / ROAD_STEP);
    const height = (d: number) => d < approachLength ? at(d).position.y : point.position.y + (d - approachLength) * grade;
    const distance = (d: number) => d < approachLength ? at(d).distance : point.distance + (d - approachLength) * Math.hypot(1, grade);
    const gap = (d: number) => height(d) - ground(d);
    const covered = (d: number) => [-this.halfWidth, 0, this.halfWidth].every(offset => ground(d, offset) > height(d) + 11);
    const inside = kind === 'bridge' ? (d: number) => gap(d) > 5 : covered;
    if (inside(0)) return;
    let entry = -1, peak = 0;
    for (let d = 32; d <= 5600; d += 32) {
      if (inside(d)) {
        if (entry < 0) {
          if (d > 960) return;
          entry = this.boundary(inside, d - 32, d, true);
          if (entry < approachLength + 24) return;
        }
        peak = Math.max(peak, kind === 'bridge' ? gap(d) : -gap(d));
        if (distance(d) - distance(entry) > (kind === 'tunnel' ? MAX_TUNNEL_LENGTH : 4800)) return;
      } else if (entry >= 0) {
        const end = this.boundary(inside, d - 32, d, false);
        if (kind === 'bridge' ? peak <= 200 || gap(end + 32) < -25 : peak < 35 || distance(end) - distance(entry) < 120) return;
        if (kind === 'tunnel' && (distance(end) - distance(entry) > MAX_TUNNEL_LENGTH
          || gap(entry - 24) > 5 || gap(end + 24) > 5)) return;
        return { kind, start: distance(entry), end: distance(end), finish: distance(end + ROAD_STEP), grade, heading: start.heading };
      }
    }
  }

  private boundary(inside: (distance: number) => boolean, low: number, high: number, entering: boolean): number {
    for (let i = 0; i < 12; i++) {
      const middle = (low + high) / 2;
      if (inside(middle) === entering) high = middle; else low = middle;
    }
    return entering ? high : low;
  }
}
