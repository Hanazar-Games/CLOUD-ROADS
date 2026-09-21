import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, Points, PointsMaterial, Vector2, type DepthTexture, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { createRng } from '../world/WorldSeed';
import type { SeasonState } from '../season/SeasonState';

export type WeatherKind = 'clear' | 'overcast' | 'drizzle' | 'rain' | 'storm' | 'fog';
export interface WeatherProfile { cover: number; rain: number; near: number; far: number; sunlight: number; wind: number }
export const weatherNames: Record<WeatherKind, string> = { clear: '晴天', overcast: '多云', drizzle: '小雨', rain: '雨天', storm: '风雨', fog: '浓雾' };
export const weatherProfiles: Record<WeatherKind, Readonly<WeatherProfile>> = {
  clear: { cover: 0, rain: 0, near: 1000, far: 1950, sunlight: 1, wind: 1 },
  overcast: { cover: 0.78, rain: 0, near: 650, far: 1750, sunlight: 0.35, wind: 2 },
  drizzle: { cover: 0.72, rain: 0.3, near: 260, far: 1250, sunlight: 0.3, wind: 2 },
  rain: { cover: 0.95, rain: 0.75, near: 180, far: 1050, sunlight: 0.18, wind: 4 },
  storm: { cover: 1, rain: 1, near: 85, far: 650, sunlight: 0.1, wind: 8 },
  fog: { cover: 0.65, rain: 0, near: 35, far: 420, sunlight: 0.3, wind: 1 },
};

export class WeatherSystem {
  readonly rain: LineSegments<BufferGeometry, LineBasicMaterial>;
  readonly snow: Points<BufferGeometry, PointsMaterial>;
  private season?: SeasonState;
  private frozenFraction = 0;
  private readonly time = { value: 0 };
  private readonly depth = { value: null as DepthTexture | null };
  private readonly resolution = { value: new Vector2() };
  private readonly anchor = { value: new Vector2() };
  private readonly altitude = { value: 0 };
  private readonly drift = { value: new Vector2() };
  private readonly wind = { value: 1 };
  private readonly current: WeatherProfile = { ...weatherProfiles.clear };
  private density = 1;
  wetness = 0;
  kind: WeatherKind = 'clear';

  constructor(private readonly scene: Scene) {
    const rng = createRng(0x72a19), positions = new Float32Array(1400 * 6), phases = new Float32Array(2800), seeds = new Float32Array(5600);
    for (let i = 0; i < positions.length; i += 6) {
      const x = rng() * 100 - 50, y = rng() * 70 - 25, z = rng() * 100 - 50;
      positions.set([x, y, z, x - 0.18, y + 1.7, z + 0.07], i);
      phases[i / 3] = phases[i / 3 + 1] = y + 25;
      seeds.set([x, z, x, z], i / 3 * 2);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('rainPhase', new BufferAttribute(phases, 1));
    geometry.setAttribute('rainSeed', new BufferAttribute(seeds, 2));
    const material = new LineBasicMaterial({ color: 0xb4c8d8, transparent: true, opacity: 0.42, depthWrite: false, depthTest: false });
    const snowGeometry = new BufferGeometry();
    snowGeometry.setAttribute('position', new BufferAttribute(positions.filter((_, i) => i % 6 < 3), 3));
    snowGeometry.setAttribute('rainPhase', new BufferAttribute(phases.filter((_, i) => i % 2 === 0), 1));
    snowGeometry.setAttribute('rainSeed', new BufferAttribute(seeds.filter((_, i) => i % 4 < 2), 2));
    const snowMaterial = new PointsMaterial({ color: 0xe5edf5, size: 0.2, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false });
    for (const [particleMaterial, snow] of [[material, false], [snowMaterial, true]] as const) particleMaterial.onBeforeCompile = shader => {
      shader.uniforms.rainTime = this.time;
      shader.uniforms.rainDepth = this.depth;
      shader.uniforms.rainResolution = this.resolution;
      shader.uniforms.rainAnchor = this.anchor; shader.uniforms.rainAltitude = this.altitude;
      shader.uniforms.rainDrift = this.drift; shader.uniforms.rainWind = this.wind;
      shader.vertexShader = `uniform float rainTime, rainAltitude, rainWind;\nuniform vec2 rainAnchor, rainDrift;\nattribute float rainPhase;\nattribute vec2 rainSeed;\nvarying float rainDistance;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        transformed.y += mod(rainPhase - rainTime * ${snow ? '3.0' : '23.0'} - rainAltitude, 70.0) - rainPhase;
        transformed.xz += mod(rainSeed + rainDrift - rainAnchor + 50.0, 100.0) - 50.0 - rainSeed;
        ${snow ? 'transformed.xz += vec2(sin(rainTime * 0.62831853 + rainPhase), cos(rainTime * 0.44879895 + rainSeed.x)) * 0.6;' : 'transformed.x -= (position.y - rainPhase + 25.0) * rainWind / 23.0;'}
      `).replace('#include <project_vertex>', '#include <project_vertex>\nrainDistance = length(mvPosition.xyz);');
      shader.fragmentShader = `uniform sampler2D rainDepth;\nuniform vec2 rainResolution;\nvarying float rainDistance;\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', `
          if (gl_FragCoord.z > texture2D(rainDepth, gl_FragCoord.xy / rainResolution).r) discard;
          #include <color_fragment>
          diffuseColor.a *= smoothstep(1.5, 5.0, rainDistance) * (1.0 - smoothstep(35.0, 65.0, rainDistance));
          ${snow ? 'diffuseColor.a *= 1.0 - smoothstep(0.2, 0.5, length(gl_PointCoord - 0.5));' : ''}
        `);
    };
    this.rain = new LineSegments(geometry, material);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.snow = new Points(snowGeometry, snowMaterial);
    this.snow.frustumCulled = false; this.snow.visible = false;
    scene.add(this.rain, this.snow);
  }

  render(renderer: WebGLRenderer, camera: PerspectiveCamera, depth: DepthTexture): void {
    if (!this.rain.visible && !this.snow.visible) return;
    this.depth.value = depth;
    renderer.getDrawingBufferSize(this.resolution.value);
    const clear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, camera);
    renderer.autoClear = clear;
  }

  get profile(): Readonly<WeatherProfile> { return this.current; }
  get liquidRain(): number { return this.profile.rain * (1 - this.frozenFraction); }
  get snowfall(): number { return this.profile.rain * this.frozenFraction; }
  setSeason(season: SeasonState): void { this.season = season; }
  get phase(): number { return this.time.value; }
  setKind(kind: WeatherKind, immediate = false): void { this.kind = kind; if (immediate) this.transition(1); }
  setFogDensity(density: number, immediate = false): void {
    if (!Number.isFinite(density)) return;
    this.density = Math.max(0.5, Math.min(2, density)); if (immediate) this.transition(1);
  }

  private transition(blend: number): void {
    const target = weatherProfiles[this.kind];
    for (const key of Object.keys(target) as (keyof WeatherProfile)[]) {
      const value = target[key] / (key === 'near' || key === 'far' ? this.density : 1);
      this.current[key] += (value - this.current[key]) * blend;
    }
  }

  update(dt: number, camera: PerspectiveCamera, shelter: number, origin = { x: 0, z: 0 }): void {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    this.transition(1 - Math.exp(-1.6 * dt));
    this.frozenFraction = this.season ? Math.max(0, Math.min(1, (2 - this.season.temperature(camera.position.y)) / 3)) : 0;
    const targetWetness = Math.min(1, this.liquidRain * 1.4);
    this.wetness += (targetWetness - this.wetness) * (1 - Math.exp(-dt / (targetWetness > this.wetness ? 3 : 45)));
    this.time.value = (this.time.value + dt) % 700;
    this.drift.value.x = (this.drift.value.x + dt * this.profile.wind) % 100;
    this.drift.value.y = (this.drift.value.y + dt * this.profile.wind * 0.3) % 100;
    this.wind.value = this.profile.wind;
    this.anchor.value.set((camera.position.x + origin.x) % 100, (camera.position.z + origin.z) % 100);
    this.altitude.value = camera.position.y % 70;
    this.rain.position.copy(camera.position);
    this.rain.material.opacity = (0.16 + 0.25 * this.liquidRain) * (1 - shelter);
    this.rain.geometry.setDrawRange(0, Math.floor(1400 * this.liquidRain) * 2);
    this.rain.visible = this.liquidRain > 0.015 && shelter < 0.99;
    this.snow.position.copy(camera.position);
    this.snow.material.opacity = 0.85 * (1 - shelter);
    this.snow.geometry.setDrawRange(0, Math.floor(1400 * this.snowfall));
    this.snow.visible = this.snowfall > 0.015 && shelter < 0.99;
  }

  dispose(): void {
    for (const particles of [this.rain, this.snow]) { particles.removeFromParent(); particles.geometry.dispose(); particles.material.dispose(); }
  }
}
