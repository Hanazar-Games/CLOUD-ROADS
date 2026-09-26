import type { VehicleProfile } from './VehicleConfig';

export class Transmission {
  mode: 'auto' | 'manual' = 'auto';
  gear = 1;
  rpm: number;
  readonly redline: number;
  readonly idle: number;
  readonly gears: number;
  shifts = 0;
  private shiftTime = 0;
  private cooldown = 0;
  private readonly ranges: number[];

  constructor(private readonly profile: VehicleProfile) {
    const heavy = profile.mass > 4000, bike = profile.shape === 'motorcycle';
    this.ranges = heavy ? [0.1, 0.17, 0.25, 0.35, 0.47, 0.63, 0.8, 1.06] : [0.16, 0.26, 0.39, 0.56, 0.76, 1.06];
    this.gears = this.ranges.length; this.idle = heavy ? 650 : bike ? 1200 : 850;
    this.redline = heavy ? 2800 : bike ? 11000 : 7000; this.rpm = this.idle;
  }

  get driveScale(): number {
    return this.shiftTime > 0 ? 0.25 : this.rpm >= this.redline ? 0.1 : Math.min(1, 0.55 + this.rpm / this.redline);
  }

  reset(): void { this.gear = 1; this.rpm = this.idle; this.shiftTime = this.cooldown = 0; }

  shift(direction: number, speed: number): boolean {
    const next = this.gear + Math.sign(direction);
    if (!direction || next < 1 || next > this.gears || this.cooldown > 0 || speed < -0.1
      || direction < 0 && this.revs(speed, next) > this.redline * 0.95) return false;
    this.gear = next; this.shiftTime = 0.18; this.cooldown = 0.55; this.shifts++;
    return true;
  }

  update(dt: number, speed: number, throttle: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    this.shiftTime = Math.max(0, this.shiftTime - dt); this.cooldown = Math.max(0, this.cooldown - dt);
    const wheelRPM = this.revs(Math.abs(speed), speed < 0 ? 1 : this.gear);
    this.rpm = Math.min(this.redline * 1.04, Math.max(this.idle + Math.abs(throttle) * 350, wheelRPM));
    if (this.mode === 'auto' && speed >= 0) {
      if (wheelRPM > this.redline * 0.86) this.shift(1, speed);
      else if (wheelRPM < this.redline * 0.34 || speed < 0.5) this.shift(-1, speed);
    }
  }

  private revs(speed: number, gear: number): number { return speed / (this.profile.maxSpeed * this.ranges[gear - 1]) * this.redline; }
}
