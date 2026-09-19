import { HeightFunction } from '../terrain/HeightFunction';
import { Noise } from '../terrain/Noise';
import { hashSeed } from '../world/WorldSeed';
import { RoadSegment, type MountainPlan, type RoadControlPoint } from './RoadSegment';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import type { MountainGuide } from '../terrain/MountainRanges';

export interface RoadTerrain { sample(x: number, z: number): number; route?(z: number): MountainGuide | undefined }
const clamp = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value));

export class RoadGenerator {
  readonly start: RoadControlPoint;
  private readonly noise: Noise;
  private readonly terrain: RoadTerrain;

  constructor(seed: string, terrain: RoadTerrain | undefined = undefined, private readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.terrain = terrain ?? new HeightFunction(seed, options.terrain, options.routeStyle, options.roadType);
    this.noise = new Noise(hashSeed(`${seed}:road`));
    this.start = { position: { x: 128, y: this.terrain.sample(128, 128) + 1, z: 128 }, heading: 0, grade: 0, distance: 0, width: options.roadWidth, bank: 0, nextMountain: 600 };
  }

  next(start: RoadControlPoint): RoadSegment {
    if (this.options.roadType === 'highway') return this.highwaySegment(start);
    const winding = this.options.routeStyle === 'winding', cliff = this.options.routeStyle === 'cliff';
    const guide = this.terrain.route?.(start.position.z - 900);
    let mountain = start.mountain;
    if (!cliff && !mountain && start.distance >= start.nextMountain) {
      const gap = this.terrain.sample(start.position.x, start.position.z - 500) - start.position.y;
      if (winding || Math.abs(gap) > 80 || guide && Math.abs(guide.grade) > 0.023) mountain = {
        stage: 0, side: guide ? guide.x > start.position.x ? 1 : -1 : this.noise.sample(start.distance / 1000, 41) < 0 ? -1 : 1,
        grade: guide ? clamp((guide.height - start.position.y) / 1800, 0.06) : clamp(gap / 900, 0.06) };
    }
    if (mountain) return this.mountainSegment(start, mountain);
    const desiredHeading = guide ? clamp(Math.atan2(guide.x - start.position.x, 900) + this.noise.sample(start.distance / 1300, 17) * 0.16, 0.85)
      : this.noise.fractal(start.distance / (winding ? 900 : 2400), 17, 2) * 1.1;
    let best: RoadSegment | undefined;
    let bestScore = Infinity;
    const gradeLimit = 0.06;
    const grades = new Set([-1, -0.5, 0, 0.5, 1].map((grade) => start.grade + clamp(grade * gradeLimit - start.grade, 0.02)));
    for (const turn of [-18, -12, -6, 0, 6, 12, 18]) {
      const heading = start.heading + turn * Math.PI / 180;
      if (Math.abs(heading) > 1) continue;
      for (const grade of grades) {
        const segment = new RoadSegment(start, heading, grade);
        let terrainCost = 0, cliffCost = 0, scenicReward = 0;
        for (const t of [0.25, 0.5, 0.75, 1]) {
          const point = segment.sample(t);
          const gap = point.position.y - this.terrain.sample(point.position.x, point.position.z);
          terrainCost += Math.min(Math.abs(gap), 1000) / 400;
          cliffCost += Math.max(0, gap - 100) / 1500;
          scenicReward += Math.min(Math.max(gap, 0), 80) / 1600;
        }
        const curvatureCost = (turn / 18) ** 2 * 0.25;
        const slopeCost = (grade / 0.06) ** 2 * 0.025;
        const repetitionCost = (heading - desiredHeading) ** 2 * 0.8;
        const target = cliff ? this.terrain.route?.(segment.end.position.z) : guide;
        const routeCost = target ? Math.abs(segment.end.position.y - target.height) / (cliff ? 40 : 150)
          + Math.abs(segment.end.position.x - target.x) / (cliff ? 30 : 1500) : 0;
        const score = terrainCost + cliffCost + curvatureCost + slopeCost + repetitionCost + routeCost - scenicReward;
        if (score < bestScore) { bestScore = score; best = segment; }
      }
    }
    if (!best) throw new Error('No valid road candidate');
    return best;
  }

  private highwaySegment(start: RoadControlPoint): RoadSegment {
    const { x, y, z } = start.position;
    const cliff = this.options.routeStyle === 'cliff';
    const guide = this.terrain.route?.(z - 700), behind = this.terrain.route?.(z + 700);
    const direction = guide && behind ? Math.atan2(guide.x - behind.x, 1400) : this.noise.fractal(start.distance / 12000, 17, 2) * 0.28;
    const desired = clamp(guide ? cliff ? Math.atan2(guide.x - x, 700) : direction * 0.6 + Math.atan2(guide.x - x, 1800) * 0.4 : direction, 0.35);
    const heading = start.heading + clamp((desired - start.heading) * (cliff ? 0.35 : 0.16), Math.PI / 60);
    let targetHeight = guide?.height;
    if (targetHeight === undefined) {
      targetHeight = 0;
      for (const distance of [400, 1000, 1800]) targetHeight += this.terrain.sample(x + Math.sin(heading) * distance, z - Math.cos(heading) * distance) / 3;
    }
    const grade = start.grade + clamp(clamp((targetHeight - y) / (cliff ? 700 : 1600), 0.03) - start.grade, 0.002);
    return new RoadSegment(start, heading, grade);
  }

  private mountainSegment(start: RoadControlPoint, plan: MountainPlan): RoadSegment {
    const angle = plan.side * Math.PI * 5 / 12;
    const target = plan.stage === 13 ? 0 : plan.stage >= 5 && plan.stage < 10 ? -angle : angle;
    const hairpin = plan.stage === 5 || plan.stage === 10;
    const heading = hairpin ? target : start.heading + clamp(target - start.heading, Math.PI / 10);
    const grade = start.grade + clamp(plan.grade - start.grade, 0.02);
    const segment = new RoadSegment(start, heading, grade, hairpin ? 144 : 96, hairpin ? 'hairpin' : 'traverse');
    const aligned = Math.abs(target - heading) < 1e-8;
    const stage = (plan.stage === 0 || plan.stage === 13) && !aligned ? plan.stage : plan.stage + 1;
    segment.end.mountain = stage <= 13 ? { ...plan, stage } : undefined;
    if (stage > 13) segment.end.nextMountain = segment.end.distance + (this.options.routeStyle === 'winding' ? 1200 + (this.noise.sample(start.distance / 600, 83) + 1) * 450 : 4000);
    return segment;
  }
}
