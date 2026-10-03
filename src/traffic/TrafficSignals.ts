import type { Junction } from '../road/RoadNetwork';
import { roadProfile } from '../road/RoadProfile';
import type { WorldOptions } from '../world/WorldOptions';

export const signalTuning = { mainGreen: [12, 5, 90], crossGreen: [8, 5, 90], yellow: [3, 2, 6], clearance: [2, 1, 8] } as const;
export type SignalTiming = { -readonly [K in keyof typeof signalTuning]: number };
export const DEFAULT_SIGNAL_TIMING: Readonly<SignalTiming> = { mainGreen: 12, crossGreen: 8, yellow: 3, clearance: 2 };
export interface SignalVehicle { x: number; y: number; z: number; heading: number; speed: number; profile: { chassisLength: number; width: number } }
export type SignalColor = 'red' | 'yellow' | 'green';

export function signalPhase(time: number, axis: number, timing: Readonly<SignalTiming>): { color: SignalColor; remaining: number } {
  const first = timing.mainGreen + timing.yellow + timing.clearance, cycle = first + timing.crossGreen + timing.yellow + timing.clearance;
  const local = ((time - (axis ? first : 0)) % cycle + cycle) % cycle, green = axis ? timing.crossGreen : timing.mainGreen;
  return local < green ? { color: 'green', remaining: green - local } : local < green + timing.yellow
    ? { color: 'yellow', remaining: green + timing.yellow - local } : { color: 'red', remaining: cycle - local };
}

export class TrafficSignals {
  readonly timing: SignalTiming = { ...DEFAULT_SIGNAL_TIMING };
  junctions: readonly Junction[] = [];
  time = 0;
  private holdUntil = 0;
  readonly halfWidth: number;
  readonly stopOffset: number;
  constructor(options: Readonly<WorldOptions>) { this.halfWidth = roadProfile(options).outerHalfWidth; this.stopOffset = this.halfWidth + 6; }
  sync(junctions: readonly Junction[]): void { this.junctions = junctions.filter(j => j.kind === 'crossroads'); }
  configure(values: Partial<SignalTiming>): void {
    let changed = false;
    for (const key of Object.keys(signalTuning) as (keyof SignalTiming)[]) {
      const value = values[key], [, min, max] = signalTuning[key];
      if (value === undefined || !Number.isFinite(value)) continue;
      const next = Math.round(Math.max(min, Math.min(max, value)));
      changed ||= next !== this.timing[key]; this.timing[key] = next;
    }
    if (changed) this.holdUntil = this.time + this.timing.clearance;
  }
  tick(dt: number): void { if (Number.isFinite(dt) && dt > 0) this.time += Math.min(0.1, dt); }
  phase(_junction: Junction, axis: number, time = this.time): { color: SignalColor; remaining: number } {
    return time < this.holdUntil ? { color: 'red', remaining: this.holdUntil - time } : signalPhase(time, axis, this.timing);
  }
  approach(car: SignalVehicle) {
    let closest: { junction: Junction; axis: number; direction: number; distance: number; key: string } | undefined;
    for (const junction of this.junctions) {
      const s = junction.sample, turn = car.heading - s.heading;
      const axis = Math.abs(Math.cos(turn)) > Math.SQRT1_2 ? 0 : 1;
      const heading = s.heading + axis * Math.PI / 2, direction = Math.cos(car.heading - heading) >= 0 ? 1 : -1;
      const dx = car.x - s.position.x, dz = car.z - s.position.z;
      const along = (dx * Math.sin(heading) - dz * Math.cos(heading)) * direction;
      const side = dx * Math.cos(heading) + dz * Math.sin(heading);
      if (Math.abs(car.y - s.position.y) > 5 || Math.abs(side) > this.halfWidth + car.profile.width / 2
        || along > this.halfWidth + 3 || along < -1200) continue;
      const distance = -this.stopOffset - along - car.profile.chassisLength / 2;
      if (!closest || Math.abs(distance) < Math.abs(closest.distance)) closest = { junction, axis, direction, distance, key: `${junction.id}:${axis}:${direction}` };
    }
    return closest;
  }
  stopDistance(car: SignalVehicle): number {
    const approach = this.approach(car);
    if (!approach || approach.distance < -0.05 || car.speed < -0.1) return Infinity;
    const phase = this.phase(approach.junction, approach.axis);
    if (phase.color === 'green' || phase.color === 'yellow' && approach.distance < car.speed ** 2 / 6 + 2) return Infinity;
    return Math.max(0, approach.distance - 1.5);
  }
}
