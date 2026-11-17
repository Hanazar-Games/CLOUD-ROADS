export class AviationRenderClock {
  constructor() { this.reset(); }

  reset() { this.elapsed = 0; this.phase = 0; }

  tick(dt, fps, force = false) {
    this.elapsed += dt; this.phase += dt;
    const interval = fps > 0 ? 1 / fps : 0;
    if (!force && this.phase + 1e-9 < interval) return null;
    const elapsed = this.elapsed;
    this.elapsed = 0;
    this.phase = force || !interval ? 0 : Math.max(0, this.phase - Math.floor((this.phase + 1e-9) / interval) * interval);
    return elapsed;
  }
}
