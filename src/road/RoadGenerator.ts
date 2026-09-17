import { HeightFunction } from '../terrain/HeightFunction';
import { Noise } from '../terrain/Noise';
import { hashSeed } from '../world/WorldSeed';
import { RoadSegment, type RoadControlPoint } from './RoadSegment';

export interface RoadTerrain { sample(x: number, z: number): number }
const clamp = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value));

export class RoadGenerator {
  readonly start: RoadControlPoint;
  private readonly noise: Noise;

  constructor(seed: string, private readonly terrain: RoadTerrain = new HeightFunction(seed)) {
    this.noise = new Noise(hashSeed(`${seed}:road`));
    this.start = { position: { x: 128, y: terrain.sample(128, 128) + 1, z: 128 }, heading: 0, grade: 0, distance: 0, width: 8, bank: 0 };
  }

  next(start: RoadControlPoint): RoadSegment {
    const desiredHeading = this.noise.fractal(start.distance / 2400, 17, 2) * 1.1;
    let best: RoadSegment | undefined;
    let bestScore = Infinity;
    const grades = new Set([-0.06, -0.03, 0, 0.03, 0.06].map((grade) => start.grade + clamp(grade - start.grade, 0.02)));
    for (const turn of [-18, -12, -6, 0, 6, 12, 18]) {
      const heading = start.heading + turn * Math.PI / 180;
      // A forward-only corridor prevents intersections before switchback planning is introduced.
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
        const score = terrainCost + cliffCost + curvatureCost + slopeCost + repetitionCost - scenicReward;
        if (score < bestScore) { bestScore = score; best = segment; }
      }
    }
    if (!best) throw new Error('No valid road candidate');
    return best;
  }
}
