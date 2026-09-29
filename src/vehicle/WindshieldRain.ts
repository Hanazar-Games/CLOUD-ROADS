import { wiperLayout } from './WiperLayout';

export const GLASS_COLUMNS = 64, GLASS_ROWS = 32;

export class WindshieldRain {
  readonly data = new Uint8Array(GLASS_COLUMNS * GLASS_ROWS);
  private readonly wet = new Float32Array(this.data.length);
  private readonly angles = new Float32Array(this.data.length * 2).fill(-1);
  coverage = 0;
  sweptCoverage = 0;
  time = 0;

  constructor(width: number, height: number) {
    const layout = wiperLayout(width, height), { radius } = layout;
    for (let i = 0; i < this.data.length; i++) {
      const x = ((i % GLASS_COLUMNS + 0.5) / GLASS_COLUMNS - 0.5) * width;
      const y = ((Math.floor(i / GLASS_COLUMNS) + 0.5) / GLASS_ROWS - 0.5) * height - layout.y;
      for (const [side, pivot] of layout.pivots.entries()) {
        const dx = x - pivot, r = Math.hypot(dx, y), sweep = (Math.atan2(y, dx) - layout.start) / layout.arc;
        if (r > radius * layout.bladeStart && r < radius * layout.bladeEnd && sweep >= 0 && sweep <= 1) this.angles[i * 2 + side] = sweep;
      }
    }
  }

  update(dt: number, rain: number, from: number, to: number, speed: number, washer = 0): boolean {
    if (!Number.isFinite(dt) || dt <= 0 || (!rain && !washer && !this.coverage)) return false;
    dt = Math.min(dt, 0.1); this.time = (this.time + dt) % 120;
    let sum = 0, swept = 0, count = 0;
    const drying = 0.045 + Math.abs(speed) * 0.001, moving = to - from > 1e-6;
    for (let i = 0; i < this.data.length; i++) {
      const jet = washer * Math.max(0, 1 - Math.abs((i % GLASS_COLUMNS) / GLASS_COLUMNS - 0.5) * 1.6) * 2;
      let water = Math.max(0, Math.min(1, this.wet[i] + dt * (rain * (0.35 + (i % 7) * 0.07) + jet - drying)));
      const a = this.angles[i * 2], b = this.angles[i * 2 + 1];
      if (moving && ((a >= 0 && a >= from - 0.025 && a <= to + 0.025) || (b >= 0 && b >= from - 0.025 && b <= to + 0.025))) water = 0;
      this.wet[i] = water; this.data[i] = Math.round(water * 255); sum += water;
      if (a >= 0 || b >= 0) { swept += water; count++; }
    }
    this.coverage = sum / this.data.length; this.sweptCoverage = count ? swept / count : 0;
    return true;
  }
}
