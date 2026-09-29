import { isExtraterrestrial, type TerrainKind } from '../world/WorldOptions';
import { Color, Vector2, Vector3 } from 'three';

const palettes = [
  { sun: new Color('#fff0d5'), zenith: new Color('#639ac5'), horizon: new Color('#c9d9de'), haze: new Color('#b7c8ce'), ambient: new Color('#b1c9e7') },
  { sun: new Color('#ffc477'), zenith: new Color('#607eaa'), horizon: new Color('#ffad5e'), haze: new Color('#d4aa82'), ambient: new Color('#b6bbd7') },
  { sun: new Color('#ff873e'), zenith: new Color('#45466c'), horizon: new Color('#f48943'), haze: new Color('#bd815c'), ambient: new Color('#aba0b5') },
];
const nightPalette = { sun: new Color('#a8bde2'), zenith: new Color('#070d21'), horizon: new Color('#192644'), haze: new Color('#111c30'), ambient: new Color('#455674') };

export class SunSystem {
  readonly direction = new Vector3();
  readonly sunColor = new Color();
  readonly zenith = new Color();
  readonly horizon = new Color();
  readonly haze = new Color();
  readonly ambient = new Color();
  readonly light = new Vector2();
  terrain: TerrainKind = 'alpine';
  get extraterrestrial(): boolean { return isExtraterrestrial(this.terrain); }
  setTerrain(terrain: TerrainKind): void { this.terrain = terrain; this.setTime(this.time); }
  time = 0.7;
  elevation = 0;
  night = 0;

  constructor() { this.setTime(this.time); }

  get label(): string {
    return this.time < -0.5 ? '清晨' : this.time < 0 ? '上午' : this.time < 0.4 ? '午后'
      : this.time < 0.82 ? '金色时刻' : this.time <= 1 ? '日落' : this.time < 1.18 ? '蓝调时刻' : '夜晚';
  }

  get clock(): string {
    const minutes = Math.round((13 + this.time * 6) * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  setTime(time: number): void {
    this.time = Math.max(-1, Math.min(1.5, time));
    const colorTime = this.time < 0 ? -this.time * 0.7 : Math.min(1, this.time);
    const index = colorTime <= 0.7 ? 0 : 1;
    const t = index === 0 ? colorTime / 0.7 : (colorTime - 0.7) / 0.3;
    const blend = t * t * (3 - 2 * t), a = palettes[index], b = palettes[index + 1];
    this.sunColor.copy(a.sun).lerp(b.sun, blend);
    for (const key of ['zenith', 'horizon', 'haze', 'ambient'] as const) this[key].copy(a[key]).lerp(b[key], blend);
    const night = Math.max(0, (this.time - 1) / 0.5);
    this.night = night * night * (3 - 2 * night);
    this.sunColor.lerp(nightPalette.sun, this.night);
    for (const key of ['zenith', 'horizon', 'haze', 'ambient'] as const) this[key].lerp(nightPalette[key], this.night);
    if (this.terrain === 'moon') {
      this.sunColor.set('#fff5e3'); this.zenith.set(0); this.horizon.set(0); this.haze.set(0); this.ambient.set('#b7bdc8');
    } else if (this.terrain === 'mars') {
      const dusk = Math.max(0, Math.min(1, (colorTime - 0.75) / 0.2));
      this.zenith.set('#9d6854').lerp(new Color('#140e16'), this.night);
      this.horizon.set('#d5a480').lerp(new Color('#83b4ce'), dusk).lerp(new Color('#241a22'), this.night);
      this.haze.set('#b78a70').lerp(new Color('#25212b'), this.night);
      this.ambient.set('#cbb19a').lerp(new Color('#6f6b83'), this.night);
      this.sunColor.set('#f9e9d2').lerp(new Color('#bcd8f0'), dusk);
    }
    this.elevation = this.time < 0 ? 45 + this.time * 30 : 45 - this.time * 48;
    const elevation = this.elevation * Math.PI / 180, azimuth = (-18 - Math.min(0, this.time) * 125) * Math.PI / 180;
    this.direction.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
    const daylight = Math.max(0, Math.min(1, (this.elevation + 1) / 9));
    this.light.set((3.1 - this.time * 0.7) * daylight * daylight * (3 - 2 * daylight), elevation);
  }
}
