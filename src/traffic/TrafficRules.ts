import type { SignalVehicle, TrafficSignals } from './TrafficSignals';

export class TrafficRules {
  enabled = true;
  redWarnings = true;
  speedWarnings = true;
  speedLimit = 80;
  tolerance = 5;
  duration = 5;
  cooldown = 8;
  count = 0;
  warning?: { kind: 'red' | 'speed'; remaining: number };
  private previous?: { x: number; z: number; key: string; distance: number; time: number };
  private speeding = 0;
  private quiet = 0;
  reset(): void { this.previous = undefined; this.speeding = this.quiet = this.count = 0; this.warning = undefined; }
  update(dt: number, car: SignalVehicle, signals: TrafficSignals, active: boolean): void {
    if (this.warning && (this.warning.kind === 'red' ? !this.redWarnings : !this.speedWarnings)) this.warning = undefined;
    if (!this.enabled || !active) { this.previous = undefined; this.speeding = this.quiet = 0; this.warning = undefined; return; }
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1); this.quiet = Math.max(0, this.quiet - dt);
    if (this.warning) { this.warning.remaining -= dt; if (this.warning.remaining <= 0) this.warning = undefined; }
    const approach = signals.approach(car), previous = this.previous;
    const teleported = previous && Math.hypot(car.x - previous.x, car.z - previous.z) > Math.max(25, Math.abs(car.speed) * dt * 3 + 5);
    if (this.redWarnings && approach && previous?.key === approach.key && !teleported && car.speed > 0.1
      && previous.distance >= 0 && approach.distance < 0) {
      const fraction = previous.distance / (previous.distance - approach.distance);
      if (signals.phase(approach.junction, approach.axis, previous.time + (signals.time - previous.time) * fraction).color === 'red') this.show('red');
    }
    this.previous = approach ? { x: car.x, z: car.z, key: approach.key, distance: approach.distance, time: signals.time } : undefined;
    this.speeding = this.speedWarnings && !teleported && Math.abs(car.speed) * 3.6 > this.speedLimit + this.tolerance ? this.speeding + dt : 0;
    if (this.speeding >= 2 && !this.quiet) { this.show('speed'); this.speeding = 0; }
  }
  private show(kind: 'red' | 'speed'): void {
    if (kind === 'speed' && this.quiet) return;
    this.count++; this.warning = { kind, remaining: this.duration }; this.quiet = this.cooldown;
  }
}
