export const lightNames = { auto: '自动', off: '关闭', low: '近光', high: '远光' } as const;
export const wiperNames = { auto: '自动', off: '关闭', intermittent: '间歇', low: '低速', high: '高速' } as const;
export type LightMode = keyof typeof lightNames;
export type WiperMode = keyof typeof wiperNames;

export class VehicleSystems {
  lights: LightMode = 'auto';
  wipers: WiperMode = 'auto';
  hasWindshield = true;
  beam: 'off' | 'low' | 'high' = 'off';
  sweep = 0;
  wiperRate = 0;
  rain = 0;
  private phase = 0;
  private waiting = 0;
  private cycleRate = 1;
  private cycling = false;

  update(dt: number, darkness: number, rain: number, shelter: number): void {
    this.beam = this.lights === 'auto' ? darkness > (this.beam === 'off' ? 0.2 : 0.12) ? 'low' : 'off' : this.lights;
    this.rain = Math.max(0, Math.min(1, rain * (1 - shelter)));
    this.wiperRate = !this.hasWindshield || this.wipers === 'off' ? 0 : this.wipers === 'high' ? 1.6
      : this.wipers === 'low' || this.wipers === 'intermittent' ? 1.1 : this.rain < 0.03 ? 0 : this.rain > 0.65 ? 1.6 : 1.1;
    if (!this.hasWindshield) { this.sweep = this.phase = this.waiting = 0; this.cycling = false; return; }
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
      this.phase += step * this.cycleRate; remaining -= step;
      if (this.phase >= 1 - 1e-9) { this.phase = 0; this.cycling = false; this.waiting = delay; }
    }
    this.sweep = (1 - Math.cos(this.phase * Math.PI * 2)) / 2;
  }
}
