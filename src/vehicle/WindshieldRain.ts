export const GLASS_COLUMNS = 64, GLASS_ROWS = 32;

export class WindshieldRain {
  readonly data = new Uint8Array(GLASS_COLUMNS * GLASS_ROWS);
  private readonly wet = new Float32Array(this.data.length);
  private readonly angles = new Float32Array(this.data.length * 2).fill(-1);
  coverage = 0;
  sweptCoverage = 0;
  time = 0;

  constructor(width: number, height: number) {
    const radius = Math.min(height * 0.93, width * 0.44);
    for (let i = 0; i < this.data.length; i++) {
      const x = ((i % GLASS_COLUMNS + 0.5) / GLASS_COLUMNS - 0.5) * width;
      const y = (Math.floor(i / GLASS_COLUMNS) + 0.5) / GLASS_ROWS * height - height * 0.06;
      for (const [side, pivot] of [-0.46, 0.04].entries()) {
        const dx = x - pivot * width, r = Math.hypot(dx, y), sweep = (Math.atan2(y, dx) - 0.08) / 1.56;
        if (r > radius * 0.42 && r < radius && sweep >= 0 && sweep <= 1) this.angles[i * 2 + side] = sweep;
      }
    }
  }

  update(dt: number, rain: number, from: number, to: number, speed: number): boolean {
    if (!Number.isFinite(dt) || dt <= 0 || (!rain && !this.coverage)) return false;
    dt = Math.min(dt, 0.1); this.time = (this.time + dt) % 120;
    let sum = 0, swept = 0, count = 0;
    const drying = 0.045 + Math.abs(speed) * 0.001, moving = to - from > 1e-6;
    for (let i = 0; i < this.data.length; i++) {
      let water = Math.max(0, Math.min(1, this.wet[i] + dt * (rain * (0.35 + (i % 7) * 0.07) - drying)));
      const a = this.angles[i * 2], b = this.angles[i * 2 + 1];
      if (moving && ((a >= 0 && a >= from - 0.025 && a <= to + 0.025) || (b >= 0 && b >= from - 0.025 && b <= to + 0.025))) water = 0;
      this.wet[i] = water; this.data[i] = Math.round(water * 255); sum += water;
      if (a >= 0 || b >= 0) { swept += water; count++; }
    }
    this.coverage = sum / this.data.length; this.sweptCoverage = count ? swept / count : 0;
    return true;
  }
}
