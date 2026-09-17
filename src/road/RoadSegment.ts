export const ROAD_STEP = 96;
export interface RoadVector { x: number; y: number; z: number }
export interface RoadControlPoint {
  position: RoadVector;
  heading: number;
  grade: number;
  distance: number;
  width: number;
  bank: number;
}
export interface RoadSample extends RoadControlPoint {
  tangent: RoadVector;
  curvature: number;
}

const ARC_STEPS = 24;
function hermite(a: number, b: number, m0: number, m1: number, t: number): [number, number, number] {
  const delta = b - a;
  const c2 = 3 * delta - 2 * m0 - m1, c3 = -2 * delta + m0 + m1;
  return [t === 1 ? b : a + t * (m0 + t * (c2 + t * c3)), m0 + t * (2 * c2 + t * 3 * c3), 2 * c2 + 6 * c3 * t];
}

export class RoadSegment {
  readonly end: RoadControlPoint;
  private readonly arc = new Float64Array(ARC_STEPS + 1);
  private readonly startDerivative: RoadVector;
  private readonly endDerivative: RoadVector;

  constructor(readonly start: RoadControlPoint, heading: number, grade: number) {
    const middle = (start.heading + heading) / 2;
    this.end = {
      position: { x: start.position.x + Math.sin(middle) * ROAD_STEP, y: start.position.y + (start.grade + grade) * ROAD_STEP / 2, z: start.position.z - Math.cos(middle) * ROAD_STEP },
      heading, grade, distance: start.distance, width: 8, bank: (start.heading - heading) * 0.08,
    };
    this.startDerivative = { x: Math.sin(start.heading) * ROAD_STEP, y: start.grade * ROAD_STEP, z: -Math.cos(start.heading) * ROAD_STEP };
    this.endDerivative = { x: Math.sin(heading) * ROAD_STEP, y: grade * ROAD_STEP, z: -Math.cos(heading) * ROAD_STEP };
    let previous = start.position;
    for (let i = 1; i <= ARC_STEPS; i++) {
      const [x, y, z] = this.evaluate(i / ARC_STEPS);
      this.arc[i] = this.arc[i - 1] + Math.hypot(x[0] - previous.x, y[0] - previous.y, z[0] - previous.z);
      previous = { x: x[0], y: y[0], z: z[0] };
    }
    this.end.distance += this.arc[ARC_STEPS];
  }

  private evaluate(t: number) {
    return (['x', 'y', 'z'] as const).map((axis) => hermite(this.start.position[axis], this.end.position[axis], this.startDerivative[axis], this.endDerivative[axis], t));
  }

  sample(t: number): RoadSample {
    t = Math.max(0, Math.min(1, t));
    const [x, y, z] = this.evaluate(t);
    const horizontal = Math.hypot(x[1], z[1]), speed = Math.hypot(horizontal, y[1]);
    const index = Math.min(ARC_STEPS - 1, Math.floor(t * ARC_STEPS));
    return {
      position: { x: x[0], y: y[0], z: z[0] },
      tangent: { x: x[1] / speed, y: y[1] / speed, z: z[1] / speed },
      heading: Math.atan2(x[1], -z[1]), grade: y[1] / horizontal,
      curvature: (x[1] * z[2] - z[1] * x[2]) / horizontal ** 3,
      distance: this.start.distance + this.arc[index] + (this.arc[index + 1] - this.arc[index]) * (t * ARC_STEPS - index),
      width: 8, bank: this.start.bank + (this.end.bank - this.start.bank) * t,
    };
  }

  atDistance(distance: number): RoadSample {
    const local = Math.max(0, Math.min(this.arc[ARC_STEPS], distance - this.start.distance));
    let index = 0;
    while (index < ARC_STEPS - 1 && this.arc[index + 1] < local) index++;
    return this.sample((index + (local - this.arc[index]) / (this.arc[index + 1] - this.arc[index])) / ARC_STEPS);
  }
}
