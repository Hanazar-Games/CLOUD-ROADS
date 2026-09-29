import type { VehicleProfile } from './VehicleConfig';
export type Powertrain = 'combustion' | 'ev';

export class Transmission {
  mode: 'auto' | 'manual' = 'auto';
  powertrain: Powertrain = 'combustion';
  gear = 1;
  rpm: number;
  readonly redline: number;
  readonly idle: number;
  readonly gears: number;
  shifts = 0;
  maxSpeed: number;
  response = 1;
  load = 0;
  private coupling = 0;
  private readonly inertia: number;
  private readonly shiftDuration: number;
  private shiftTime = 0;
  private cooldown = 0;
  private readonly ranges: number[];

  constructor(profile: VehicleProfile) {
    this.maxSpeed = profile.maxSpeed;
    const heavy = profile.mass > 4000, bike = profile.shape === 'motorcycle', sport = profile.shape === 'supercar';
    this.ranges = heavy || sport ? [0.1, 0.17, 0.25, 0.35, 0.47, 0.63, 0.8, 1.06] : [0.16, 0.26, 0.39, 0.56, 0.76, 1.06];
    this.gears = this.ranges.length; this.idle = heavy ? 650 : bike ? 1200 : 850;
    this.redline = heavy ? 2800 : bike ? 11000 : sport ? 8500 : 7000; this.rpm = this.idle;
    this.inertia = heavy ? 0.24 : bike || sport ? 0.1 : 0.16;
    this.shiftDuration = heavy ? 0.3 : 0.2;
  }

  get shifting(): boolean { return this.shiftTime > 0; }
  get engineBrake(): number { return this.powertrain === 'ev' || this.shifting ? 0 : this.coupling * (1 - this.load) * 0.8; }
  get driveScale(): number {
    if (this.powertrain === 'ev') return 1;
    return this.shiftTime > 0 ? 0.25 : this.rpm >= this.redline ? 0.1 : Math.min(1, 0.55 + this.rpm / this.redline);
  }

  reset(): void {
    this.gear = 1; this.rpm = this.powertrain === 'ev' ? 0 : this.idle;
    this.shiftTime = this.cooldown = this.load = this.coupling = 0;
  }

  selectPowertrain(kind: Powertrain, speed: number): void {
    this.powertrain = kind; this.reset();
    if (kind === 'combustion' && speed > 0) while (this.gear < this.gears && this.revs(speed, this.gear) > this.redline * 0.86) this.gear++;
    if (kind === 'combustion') this.rpm = Math.max(this.idle, Math.min(this.redline, this.revs(Math.abs(speed), speed < 0 ? 1 : this.gear)));
    this.update(1 / 120, speed, 0);
  }

  shift(direction: number, speed: number): boolean {
    if (this.powertrain === 'ev') return false;
    const next = this.gear + Math.sign(direction);
    if (!direction || next < 1 || next > this.gears || this.cooldown > 0 || speed < -0.1
      || direction < 0 && this.revs(speed, next) > this.redline * 0.95) return false;
    this.gear = next; this.shiftTime = this.shiftDuration; this.cooldown = 0.55; this.shifts++;
    return true;
  }

  update(dt: number, speed: number, throttle: number): void {
    if (![dt, speed, throttle].every(Number.isFinite) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    const demand = throttle * speed < 0 ? 0 : Math.min(1, Math.abs(throttle));
    this.load += (demand - this.load) * (1 - Math.exp(-dt * (demand > this.load ? 8 : 12)));
    if (this.powertrain === 'ev') { this.gear = 1; this.rpm = Math.abs(speed) / this.maxSpeed * 14000; this.shiftTime = this.cooldown = this.coupling = 0; return; }
    this.shiftTime = Math.max(0, this.shiftTime - dt); this.cooldown = Math.max(0, this.cooldown - dt);
    let wheelRPM = this.revs(Math.abs(speed), speed < 0 ? 1 : this.gear);
    if (this.mode === 'auto' && speed >= 0) {
      if (wheelRPM > this.redline * (demand > 0 ? 0.58 + demand * 0.28 : 0.98)) this.shift(1, speed);
      else if (wheelRPM < Math.max(this.idle * 1.15, this.redline * (0.18 + demand * 0.2)) || speed < 0.5) this.shift(-1, speed);
      wheelRPM = this.revs(Math.abs(speed), this.gear);
    }
    this.coupling = Math.max(0, Math.min(1, (wheelRPM - this.idle) / (this.redline * 0.55)));
    const slip = this.shifting ? 0 : this.load * this.redline * (this.mode === 'auto' ? 0.13 : 0.065)
      * Math.max(0, Math.min(1, (0.85 - wheelRPM / this.redline) / 0.35));
    const target = Math.min(this.redline * 1.02, Math.max(this.idle + (this.shifting ? 0 : this.load * this.redline * 0.22), wheelRPM + slip));
    const response = Math.max(0.5, Math.min(1.5, this.response));
    const tau = this.shifting ? this.shiftDuration * 0.4 : this.inertia / response;
    this.rpm += (target - this.rpm) * (1 - Math.exp(-dt / tau));
  }

  private revs(speed: number, gear: number): number { return speed / (this.maxSpeed * this.ranges[gear - 1]) * this.redline; }
}
