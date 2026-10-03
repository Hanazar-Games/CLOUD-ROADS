export const ROAD_STEP = 96;
export const ROAD_SAMPLES = 48;
export interface RoadVector { x: number; y: number; z: number }
export interface MountainPlan { stage: number; side: number }
export interface ClimbPlan { cycle: number; base: number; target: number; ascending: boolean }
export interface StructurePlan { kind: 'bridge' | 'tunnel'; start: number; end: number; finish: number; grade: number; heading: number; landmark?: boolean; approach?: readonly number[] }
export interface RoadControlPoint {
  routeId?: string;
  opening?: number;
  elevated?: boolean;
  junction?: boolean;
  position: RoadVector;
  heading: number;
  grade: number;
  distance: number;
  width: number;
  bank: number;
  nextMountain: number;
  mountain?: MountainPlan;
  climb?: ClimbPlan;
  structure?: StructurePlan;
  nextStructure?: number;
  structureStep?: number;
  nextLandmark?: number;
}
export interface RoadSample extends RoadControlPoint {
  tangent: RoadVector;
  curvature: number;
}

const ARC_STEPS = 24;
// Smooth heading and grade give both ends zero curvature and vertical acceleration.
const smooth = (t: number) => t * t * (3 - 2 * t);

export class RoadSegment {
  readonly end: RoadControlPoint;
  private readonly arc = new Float64Array(ARC_STEPS + 1);
  private readonly xs = new Float64Array(ARC_STEPS + 1);
  private readonly zs = new Float64Array(ARC_STEPS + 1);

  constructor(readonly start: RoadControlPoint, private readonly heading: number, private readonly grade: number,
    readonly length = ROAD_STEP, readonly kind: 'cruise' | 'traverse' | 'hairpin' = 'cruise') {
    for (let i = 1; i <= ARC_STEPS; i++) {
      const [x, z, distance] = this.integrate((i - 1) / ARC_STEPS, i / ARC_STEPS);
      this.xs[i] = this.xs[i - 1] + x;
      this.zs[i] = this.zs[i - 1] + z;
      this.arc[i] = this.arc[i - 1] + distance;
    }
    this.end = { ...start,
      position: { x: start.position.x + this.xs[ARC_STEPS], y: start.position.y + length * (start.grade + grade) / 2, z: start.position.z + this.zs[ARC_STEPS] },
      heading, grade, distance: start.distance + this.arc[ARC_STEPS], bank: 0,
    };
  }

  private integrate(a: number, b: number): [number, number, number] {
    const weights = [1, 4, 1];
    let x = 0, z = 0, distance = 0;
    for (let i = 0; i < 3; i++) {
      const t = a + (b - a) * i / 2, blend = smooth(t);
      const heading = this.start.heading + (this.heading - this.start.heading) * blend;
      const grade = this.start.grade + (this.grade - this.start.grade) * blend;
      x += weights[i] * Math.sin(heading);
      z -= weights[i] * Math.cos(heading);
      distance += weights[i] * Math.hypot(1, grade);
    }
    const scale = this.length * (b - a) / 6;
    return [x * scale, z * scale, distance * scale];
  }

  sample(t: number): RoadSample {
    t = Math.max(0, Math.min(1, t));
    const index = Math.min(ARC_STEPS - 1, Math.floor(t * ARC_STEPS));
    const [dx, dz, distance] = this.integrate(index / ARC_STEPS, t);
    const heading = this.start.heading + (this.heading - this.start.heading) * smooth(t);
    const grade = this.start.grade + (this.grade - this.start.grade) * smooth(t);
    const speed = Math.hypot(1, grade);
    const curvature = (this.heading - this.start.heading) * 6 * t * (1 - t) / this.length;
    return {
      ...this.start,
      position: t === 1 ? { ...this.end.position } : {
        x: this.start.position.x + this.xs[index] + dx,
        y: this.start.position.y + this.length * (this.start.grade * t + (this.grade - this.start.grade) * (t ** 3 - t ** 4 / 2)),
        z: this.start.position.z + this.zs[index] + dz,
      },
      tangent: { x: Math.sin(heading) / speed, y: grade / speed, z: -Math.cos(heading) / speed },
      heading, grade, curvature,
      distance: this.start.distance + this.arc[index] + distance,
      bank: -Math.max(-Math.PI / 30, Math.min(Math.PI / 30, Math.atan(curvature * 6))) * 4 * t * (1 - t),
    };
  }

  atDistance(distance: number): RoadSample {
    if (distance <= this.start.distance) return this.sample(0);
    if (distance >= this.end.distance) return this.sample(1);
    const local = distance - this.start.distance;
    if (this.start.grade === this.grade) return this.sample(local / this.arc[ARC_STEPS]);
    let first = 0, last = ARC_STEPS;
    while (last - first > 1) {
      const middle = (first + last) >> 1;
      if (this.arc[middle] < local) first = middle; else last = middle;
    }
    const a = first / ARC_STEPS, remaining = local - this.arc[first];
    const speed = (t: number) => Math.hypot(1, this.start.grade + (this.grade - this.start.grade) * smooth(t));
    const initialSpeed = speed(a);
    let low = a, high = last / ARC_STEPS;
    // Invert the same Simpson arc integral without constructing intermediate geometry.
    for (let i = 0; i < 24; i++) {
      const t = (low + high) / 2;
      const arc = (initialSpeed + 4 * speed((a + t) / 2) + speed(t)) * this.length * (t - a) / 6;
      if (arc < remaining) low = t;
      else high = t;
    }
    return this.sample((low + high) / 2);
  }
}
