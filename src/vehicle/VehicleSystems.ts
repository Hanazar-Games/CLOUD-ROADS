import type { VehicleProfile } from './VehicleConfig';

export const lightNames = { auto: '自动', off: '关闭', low: '近光', high: '远光' } as const;
export const wiperNames = { auto: '自动', off: '关闭', intermittent: '间歇', low: '低速', high: '高速' } as const;
export type LightMode = keyof typeof lightNames;
export type WiperMode = keyof typeof wiperNames;
export const signalNames = { off: '关闭', left: '左转', right: '右转', hazard: '双闪' } as const;
export type SignalMode = keyof typeof signalNames;

export class VehicleSystems {
  lights: LightMode = 'auto';
  wipers: WiperMode = 'auto';
  hasWindshield = true;
  hasWindows = true;
  convertible = true;
  windowTarget = 0;
  windowOpen = 0;
  roofOpen = 1;
  roofTarget = 1;
  fan = 0;
  cabinLight = false;
  equipmentMotor = false;
  washerFluid = 3;
  washerSpray = 0;
  private washerTime = 0;
  private washWipe = 0;
  beam: 'off' | 'low' | 'high' = 'off';
  sweep = 0;
  sweepFrom = 0;
  sweepTo = 0;
  wiperRate = 0;
  rain = 0;
  signal: SignalMode = 'off';
  lightPower = 1;
  lightRange = 180;
  private blink = 0;
  private lastSignal: SignalMode = 'off';
  private turned = false;
  get leftSignal(): boolean { return this.blink < 0.4 && (this.signal === 'left' || this.signal === 'hazard'); }
  get rightSignal(): boolean { return this.blink < 0.4 && (this.signal === 'right' || this.signal === 'hazard'); }
  private phase = 0;
  private waiting = 0;
  private cycleRate = 1;
  private cycling = false;

  get cabinExposure(): number { return !this.hasWindows ? 1 : Math.max(this.windowOpen, this.convertible ? this.roofOpen : 0); }
  get equipmentMoving(): boolean { return Math.abs(this.windowTarget - this.windowOpen) > 0.001 || Math.abs(this.roofTarget - this.roofOpen) > 0.001; }

  configure(shape: VehicleProfile['shape']): void {
    this.hasWindshield = this.hasWindows = shape !== 'motorcycle'; this.convertible = shape === 'roadster';
    this.windowOpen = this.hasWindows ? this.windowTarget : 0;
    this.roofTarget = this.roofOpen = this.convertible ? 1 : 0;
    this.equipmentMotor = false;
    this.washerTime = this.washWipe = this.washerSpray = 0;
  }

  wash(): boolean {
    if (!this.hasWindshield || this.washerFluid <= 0) return false;
    this.washerTime = 1.2; this.washWipe = 3.2; return true;
  }

  refill(speed: number): boolean { if (!this.hasWindshield || Math.abs(speed) > 0.1) return false; this.washerFluid = 3; return true; }

  toggleRoof(speed: number): boolean {
    if (!this.convertible || Math.abs(speed) > 1.4) return false;
    this.roofTarget = this.roofTarget > 0.5 ? 0 : 1; return true;
  }

  update(dt: number, darkness: number, rain: number, shelter: number, steering = 0, speed = 0): void {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    this.equipmentMotor = false;
    if (dt > 0) {
      const window = this.windowOpen, roof = this.roofOpen;
      const move = (current: number, target: number, rate: number) => current + Math.max(-dt * rate, Math.min(dt * rate, target - current));
      this.windowOpen = this.hasWindows ? move(this.windowOpen, this.windowTarget, 0.65) : 0;
      if (this.convertible && Math.abs(speed) <= 1.4) this.roofOpen = move(this.roofOpen, this.roofTarget, 0.28);
      this.equipmentMotor = window !== this.windowOpen || roof !== this.roofOpen;
      const spray = this.hasWindshield ? Math.min(dt, this.washerTime, this.washerFluid / 0.08) : 0;
      this.washerSpray = spray / dt;
      this.washerFluid = Math.max(0, this.washerFluid - spray * 0.08);
      this.washerTime = Math.max(0, this.washerTime - dt); this.washWipe = Math.max(0, this.washWipe - dt);
    }
    this.sweepFrom = this.sweepTo = this.sweep;
    if (this.lastSignal !== this.signal) { this.blink = 0; this.turned = false; this.lastSignal = this.signal; }
    if (dt > 0 && Number.isFinite(dt)) {
      this.blink = (this.blink + Math.min(dt, 0.1)) % 0.8;
      if (this.signal === 'left' || this.signal === 'right') {
        this.turned ||= steering * (this.signal === 'left' ? -1 : 1) > 0.18;
        if (this.turned && Math.abs(steering) < 0.04) this.signal = 'off';
      }
    }
    this.beam = this.lights === 'auto' ? darkness > (this.beam === 'off' ? 0.2 : 0.12) ? 'low' : 'off' : this.lights;
    this.rain = Math.max(0, Math.min(1, rain * (1 - shelter)));
    this.wiperRate = !this.hasWindshield ? 0 : this.washWipe > 0 ? 1.6 : this.wipers === 'off' ? 0 : this.wipers === 'high' ? 1.6
      : this.wipers === 'low' || this.wipers === 'intermittent' ? 1.1 : this.rain < 0.03 ? 0 : this.rain > 0.65 ? 1.6 : 1.1;
    if (!this.hasWindshield) { this.sweep = this.sweepFrom = this.sweepTo = this.phase = this.waiting = 0; this.cycling = false; return; }
    let remaining = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    const delay = this.washWipe > 0 ? 0 : this.wipers === 'intermittent' ? 2.5 : this.wipers === 'auto' && this.rain < 0.3 ? 2.5 : 0;
    if (!this.wiperRate || !delay) this.waiting = 0;
    while (remaining > 1e-9) {
      if (!this.cycling) {
        if (!this.wiperRate) break;
        const wait = Math.min(this.waiting, remaining); this.waiting -= wait; remaining -= wait;
        if (remaining <= 1e-9) break;
        this.cycling = true; this.cycleRate = this.wiperRate;
      }
      const step = Math.min(remaining, (1 - this.phase) / this.cycleRate);
      if (this.phase <= 0.5 && this.phase + step * this.cycleRate >= 0.5) this.sweepTo = 1;
      this.phase += step * this.cycleRate; remaining -= step;
      if (this.phase >= 1 - 1e-9) { this.phase = 0; this.cycling = false; this.waiting = delay; this.sweepFrom = 0; }
    }
    this.sweep = (1 - Math.cos(this.phase * Math.PI * 2)) / 2;
    this.sweepFrom = Math.min(this.sweepFrom, this.sweep); this.sweepTo = Math.max(this.sweepTo, this.sweep);
  }
}
