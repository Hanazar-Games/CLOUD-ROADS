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

  update(dt: number, darkness: number, rain: number, shelter: number, steering = 0): void {
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
    this.wiperRate = !this.hasWindshield || this.wipers === 'off' ? 0 : this.wipers === 'high' ? 1.6
      : this.wipers === 'low' || this.wipers === 'intermittent' ? 1.1 : this.rain < 0.03 ? 0 : this.rain > 0.65 ? 1.6 : 1.1;
    if (!this.hasWindshield) { this.sweep = this.sweepFrom = this.sweepTo = this.phase = this.waiting = 0; this.cycling = false; return; }
    let remaining = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    const delay = this.wipers === 'intermittent' ? 2.5 : this.wipers === 'auto' && this.rain < 0.3 ? 2.5 : 0;
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
