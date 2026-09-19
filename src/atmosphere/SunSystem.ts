import { Color, Vector2, Vector3 } from 'three';

const palettes = [
  { sun: new Color('#fff0d5'), zenith: new Color('#639ac5'), horizon: new Color('#c9d9de'), haze: new Color('#b7c8ce'), ambient: new Color('#b1c9e7') },
  { sun: new Color('#ffc477'), zenith: new Color('#607eaa'), horizon: new Color('#ffad5e'), haze: new Color('#d4aa82'), ambient: new Color('#b6bbd7') },
  { sun: new Color('#ff873e'), zenith: new Color('#45466c'), horizon: new Color('#f48943'), haze: new Color('#bd815c'), ambient: new Color('#aba0b5') },
];

export class SunSystem {
  readonly direction = new Vector3();
  readonly sunColor = new Color();
  readonly zenith = new Color();
  readonly horizon = new Color();
  readonly haze = new Color();
  readonly ambient = new Color();
  readonly light = new Vector2();
  time = 0.7;
  elevation = 0;

  constructor() { this.setTime(this.time); }

  get label(): string { return this.time < 0.4 ? '午后' : this.time < 0.82 ? '金色时刻' : '日落'; }

  setTime(time: number): void {
    this.time = Math.max(0, Math.min(1, time));
    const index = this.time <= 0.7 ? 0 : 1;
    const t = index === 0 ? this.time / 0.7 : (this.time - 0.7) / 0.3;
    const blend = t * t * (3 - 2 * t), a = palettes[index], b = palettes[index + 1];
    this.sunColor.copy(a.sun).lerp(b.sun, blend);
    for (const key of ['zenith', 'horizon', 'haze', 'ambient'] as const) this[key].copy(a[key]).lerp(b[key], blend);
    this.elevation = 45 - this.time * 48;
    const elevation = this.elevation * Math.PI / 180, azimuth = -18 * Math.PI / 180;
    this.direction.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
    const daylight = Math.max(0, Math.min(1, (this.elevation + 1) / 9));
    this.light.set((3.1 - this.time * 0.7) * daylight * daylight * (3 - 2 * daylight), elevation);
  }
}
