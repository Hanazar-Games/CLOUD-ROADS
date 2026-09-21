import { HeightFunction } from '../terrain/HeightFunction';
import { Noise } from '../terrain/Noise';
import { hashSeed } from '../world/WorldSeed';
import { RoadSegment, type MountainPlan, type RoadControlPoint } from './RoadSegment';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import type { MountainGuide } from '../terrain/MountainRanges';
import { serviceTarget } from '../service/ServiceSchedule';
import { StructurePlanner } from './StructurePlanner';
import { junctionApproach, junctionsEnabled, junctionTarget } from './JunctionSchedule';

export interface RoadTerrain { sample(x: number, z: number): number; route?(z: number): MountainGuide | undefined }
const clamp = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value));

export class RoadGenerator {
  readonly start: RoadControlPoint;
  private readonly noise: Noise;
  private readonly terrain: RoadTerrain;
  private readonly structures: StructurePlanner;

  constructor(private readonly seed: string, terrain: RoadTerrain | undefined = undefined, private readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS, origin?: RoadControlPoint) {
    this.terrain = terrain ?? new HeightFunction(seed, options.terrain, options.roadType);
    this.noise = new Noise(hashSeed(`${seed}:road`));
    this.structures = new StructurePlanner(this.terrain, options);
    this.start = origin ?? { position: { x: 128, y: this.terrain.sample(128, 128) + 1, z: 128 }, heading: 0, grade: 0, distance: 0, width: options.roadWidth, bank: 0, nextMountain: 600 };
  }

  next(start: RoadControlPoint): RoadSegment {
    const junction = junctionsEnabled(this.options) && junctionApproach(start.distance);
    start = { ...start, junction: junction || undefined };
    if (junction) {
      const grade = start.grade - clamp(start.grade, this.structures.gradeStep);
      const segment = new RoadSegment({ ...start, mountain: undefined, structure: undefined }, start.heading, grade);
      segment.end.nextMountain = junctionTarget(start.distance) + 1200;
      segment.end.nextStructure = segment.end.nextMountain;
      return segment;
    }
    let structure = start.structure;
    if (structure && start.distance >= structure.finish) structure = undefined;
    if (!structure && start.distance >= (start.nextStructure ?? 0) && !this.serviceApproach(start.distance)) {
      structure = this.structures.plan(start);
      if (structure) {
        const service = serviceTarget(this.seed, Math.max(1, Math.round((start.distance + structure.finish) / 30000)));
        if (structure.finish > service - 1000 && start.distance < service + 800) structure = undefined;
        const junction = junctionTarget(start.distance);
        if (structure && junctionsEnabled(this.options) && structure.finish > junction - 1800 && start.distance < junction + 1200) structure = undefined;
      }
      start = { ...start, nextStructure: start.distance + 192 };
    }
    start = { ...start, structure };
    if (structure) {
      const grade = Math.abs(structure.grade - start.grade) <= this.structures.gradeStep ? structure.grade
        : start.grade + Math.sign(structure.grade - start.grade) * this.structures.gradeStep;
      const segment = new RoadSegment({ ...start, mountain: undefined }, structure.heading, grade);
      segment.end.nextMountain = structure.finish + 192;
      segment.end.nextStructure = structure.finish + 192;
      return segment;
    }
    if (this.options.elevationMode === 'cycles' && this.options.maxGrade > 0) {
      let climb = start.climb ?? { cycle: 0, base: start.position.y, target: start.position.y + this.climbGain(0), ascending: true };
      if ((climb.ascending ? 1 : -1) * (start.position.y - climb.target) >= 0) {
        const cycle = climb.cycle + (climb.ascending ? 0 : 1), ascending = !climb.ascending;
        climb = { cycle, ascending, base: start.position.y, target: start.position.y + (ascending ? 1 : -1) * this.climbGain(cycle) };
      }
      start = { ...start, climb };
    }
    return this.plan(start);
  }

  private climbGain(cycle: number): number {
    return this.options.climbMin + hashSeed(`${this.seed}:climb:${cycle}`) / 4294967296 * (this.options.climbMax - this.options.climbMin);
  }

  private serviceApproach(distance: number): boolean {
    const target = serviceTarget(this.seed, Math.max(1, Math.round(distance / 15000)));
    return distance >= target - 1000 && distance < target + 800;
  }

  private plan(start: RoadControlPoint): RoadSegment {
    if (this.options.routeStyle >= 2 || this.options.maxGrade > 0.06) {
      const target = serviceTarget(this.seed, Math.max(1, Math.round(start.distance / 15000)));
      if (this.serviceApproach(start.distance)) {
        const heading = this.options.routeStyle === 0 ? this.start.heading : start.heading + clamp(this.start.heading - start.heading, Math.PI / 10);
        const blend = Math.max(0, Math.min(1, (Math.abs(start.distance - target) - 160) / 640));
        const grade = this.nextGrade(start, clamp(this.desiredGrade(start, heading), 0.02 + Math.max(0, this.options.maxGrade - 0.02) * blend));
        const segment = new RoadSegment(start, heading, grade);
        segment.end.mountain = undefined; segment.end.nextMountain = target + 800;
        return segment;
      }
    }
    if (this.options.routeStyle === 0) return this.highwaySegment(start, true);
    const guide = this.start.heading === 0 ? this.terrain.route?.(start.position.z - 900) : undefined;
    let mountain = start.mountain;
    if (this.options.routeStyle >= 2 && !mountain && start.distance >= (this.options.routeStyle === 5 ? 0 : start.nextMountain)) {
      let side = guide ? guide.x > start.position.x ? 1 : -1 : this.noise.sample(start.distance / 1000, 41) < 0 ? -1 : 1;
      if (start.climb) {
        const costs = [-1, 1].map(direction => {
          const heading = start.heading + direction * Math.PI / 4;
          return Math.abs(this.terrain.sample(start.position.x + Math.sin(heading) * 500,
            start.position.z - Math.cos(heading) * 500) + 1 - start.climb!.target);
        });
        if (Math.abs(costs[0] - costs[1]) > 5) side = costs[0] < costs[1] ? -1 : 1;
      }
      mountain = { stage: 0, side };
    }
    if (mountain) return this.mountainSegment(start, mountain);
    if (this.options.roadType === 'highway') return this.highwaySegment(start);
    const desiredHeading = guide ? clamp(Math.atan2(guide.x - start.position.x, 900) + this.noise.sample(start.distance / 1300, 17) * 0.16, 0.85)
      : this.start.heading + this.noise.fractal(start.distance / 2400, 17, 2) * 1.1;
    let best: RoadSegment | undefined;
    let bestScore = Infinity;
    const gradeLimit = this.options.maxGrade;
    const desiredGrade = this.desiredGrade(start, start.heading);
    for (const turn of [-18, -12, -6, 0, 6, 12, 18]) {
      const heading = start.heading + turn * Math.PI / 180;
      if (Math.abs(heading - this.start.heading) > 1) continue;
      const grades = new Set([this.nextGrade(start, this.desiredGrade(start, heading)),
        ...[-1, -0.5, 0, 0.5, 1].map(grade => this.nextGrade(start, grade * gradeLimit))]);
      for (const grade of grades) {
        const segment = new RoadSegment(start, heading, grade);
        let terrainCost = 0, cliffCost = 0;
        for (const t of [0.25, 0.5, 0.75, 1]) {
          const point = segment.sample(t);
          const gap = point.position.y - this.terrain.sample(point.position.x, point.position.z);
          terrainCost += Math.min(Math.abs(gap - 1), 1000) / 40;
          cliffCost += Math.max(0, gap - 100) / 1500;
        }
        const curvatureCost = (turn / 18) ** 2 * 0.25;
        const slopeCost = (grade / Math.max(gradeLimit, 0.01)) ** 2 * 0.025
          + ((grade - desiredGrade) / Math.max(gradeLimit, 0.01)) ** 2 * 0.12;
        const repetitionCost = (heading - desiredHeading) ** 2 * 0.8;
        const routeCost = guide ? Math.abs(segment.end.position.y - guide.height) / 150
          + Math.abs(segment.end.position.x - guide.x) / 1500 : 0;
        const climbCost = start.climb ? Math.min(1, Math.abs(this.terrain.sample(segment.end.position.x, segment.end.position.z) + 1 - start.climb.target) / this.climbGain(start.climb.cycle)) * 0.15 : 0;
        const score = terrainCost + cliffCost + curvatureCost + slopeCost + repetitionCost + routeCost + climbCost;
        if (score < bestScore) { bestScore = score; best = segment; }
      }
    }
    if (!best) throw new Error('No valid road candidate');
    return best;
  }

  private nextGrade(start: RoadControlPoint, target: number): number {
    const limit = this.options.maxGrade;
    return limit === 0 ? 0 : clamp(start.grade + clamp(target - start.grade, Math.max(0.002, limit / 3)), limit);
  }

  private desiredGrade(start: RoadControlPoint, heading: number, length = 96): number {
    const curve = new RoadSegment(start, heading, start.grade, length);
    let numerator = 0, denominator = 0;
    // Fit terrain to the segment's integrated grade, then damp the correction.
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const point = curve.sample(t).position, response = length * (t ** 3 - t ** 4 / 2);
      numerator += response * (this.terrain.sample(point.x, point.z) + 1 - point.y);
      denominator += response * response;
    }
    return clamp(start.grade + 0.5 * numerator / denominator, this.options.maxGrade);
  }

  private highwaySegment(start: RoadControlPoint, straight = false): RoadSegment {
    const { x, z } = start.position;
    const guide = straight || this.start.heading !== 0 ? undefined : this.terrain.route?.(z - 700), behind = this.terrain.route?.(z + 700);
    const direction = guide && behind ? Math.atan2(guide.x - behind.x, 1400) : this.noise.fractal(start.distance / 12000, 17, 2) * 0.28;
    const desired = this.start.heading + clamp(guide ? direction * 0.6 + Math.atan2(guide.x - x, 1800) * 0.4 : direction, 0.35);
    const heading = straight ? this.start.heading : start.heading + clamp((desired - start.heading) * 0.16, Math.PI / 60);
    const limit = this.options.maxGrade;
    const grade = limit === 0 ? 0 : clamp(start.grade + clamp(this.desiredGrade(start, heading) - start.grade, 0.002 * Math.max(1, limit / 0.03)), limit);
    return new RoadSegment(start, heading, grade);
  }

  private mountainSegment(start: RoadControlPoint, plan: MountainPlan): RoadSegment {
    const level = this.options.routeStyle;
    const angle = plan.side * (65 + (level - 2) * 3.3) * Math.PI / 180;
    const last = [0, 0, 3, 7, 15, Infinity][level], exiting = plan.stage > last;
    const target = this.start.heading + (exiting ? 0 : angle * (Math.ceil(plan.stage / 2) % 2 ? -1 : 1));
    const hairpin = !exiting && plan.stage % 2 === 1;
    const heading = hairpin ? target : start.heading + clamp(target - start.heading, Math.PI / 10);
    const length = hairpin ? [0, 0, 272, 224, 192, 160][level] : plan.stage === 0 || exiting ? 96 : [0, 0, 288, 192, 96, 96][level];
    const desired = this.desiredGrade(start, heading, length);
    const grade = this.nextGrade(start, desired);
    const segment = new RoadSegment(start, heading, grade, length, hairpin ? 'hairpin' : 'traverse');
    const aligned = Math.abs(target - heading) < 1e-8;
    const stage = !aligned ? plan.stage : plan.stage + (level === 5 && hairpin ? 2 : 1);
    segment.end.mountain = exiting && aligned ? undefined : { ...plan, stage };
    if (!segment.end.mountain) segment.end.nextMountain = segment.end.distance + [0, 0, 2200, 1100, 260, 0][level]
      * (0.85 + (this.noise.sample(start.distance / 600, 83) + 1) * 0.15);
    return segment;
  }
}
