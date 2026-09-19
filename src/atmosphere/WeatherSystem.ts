import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, Vector2, type DepthTexture, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { createRng } from '../world/WorldSeed';

export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'fog';
export interface WeatherProfile { cover: number; rain: number; near: number; far: number; sunlight: number }
export const weatherNames: Record<WeatherKind, string> = { clear: '晴天', overcast: '多云', rain: '雨天', fog: '浓雾' };
export const weatherProfiles: Record<WeatherKind, Readonly<WeatherProfile>> = {
  clear: { cover: 0, rain: 0, near: 1000, far: 1950, sunlight: 1 },
  overcast: { cover: 0.78, rain: 0, near: 650, far: 1750, sunlight: 0.35 },
  rain: { cover: 0.95, rain: 1, near: 180, far: 1050, sunlight: 0.18 },
  fog: { cover: 0.65, rain: 0, near: 35, far: 420, sunlight: 0.3 },
};

export class WeatherSystem {
  readonly rain: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly time = { value: 0 };
  private readonly depth = { value: null as DepthTexture | null };
  private readonly resolution = { value: new Vector2() };
  kind: WeatherKind = 'clear';

  constructor(private readonly scene: Scene) {
    const rng = createRng(0x72a19), positions = new Float32Array(1000 * 6), phases = new Float32Array(2000);
    for (let i = 0; i < positions.length; i += 6) {
      const x = rng() * 100 - 50, y = rng() * 70 - 25, z = rng() * 100 - 50;
      positions.set([x, y, z, x - 0.18, y + 1.7, z + 0.07], i);
      phases[i / 3] = phases[i / 3 + 1] = y + 25;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('rainPhase', new BufferAttribute(phases, 1));
    const material = new LineBasicMaterial({ color: 0xb4c8d8, transparent: true, opacity: 0.42, depthWrite: false, depthTest: false });
    material.onBeforeCompile = shader => {
      shader.uniforms.rainTime = this.time;
      shader.uniforms.rainDepth = this.depth;
      shader.uniforms.rainResolution = this.resolution;
      shader.vertexShader = `uniform float rainTime;\nattribute float rainPhase;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        transformed.y += mod(rainPhase - rainTime * 23.0, 70.0) - rainPhase;
        transformed.x += sin(rainTime * 0.7) * 1.5;
      `);
      shader.fragmentShader = `uniform sampler2D rainDepth;\nuniform vec2 rainResolution;\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', `
          if (gl_FragCoord.z > texture2D(rainDepth, gl_FragCoord.xy / rainResolution).r) discard;
          #include <color_fragment>
        `);
    };
    this.rain = new LineSegments(geometry, material);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
  }

  render(renderer: WebGLRenderer, camera: PerspectiveCamera, depth: DepthTexture): void {
    if (!this.rain.visible) return;
    this.depth.value = depth;
    renderer.getDrawingBufferSize(this.resolution.value);
    const clear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, camera);
    renderer.autoClear = clear;
  }

  get profile(): Readonly<WeatherProfile> { return weatherProfiles[this.kind]; }
  get phase(): number { return this.time.value; }
  setKind(kind: WeatherKind): void { this.kind = kind; }

  update(dt: number, camera: PerspectiveCamera, shelter: number): void {
    this.time.value = (this.time.value + dt) % 700;
    this.rain.position.copy(camera.position);
    this.rain.material.opacity = 0.42 * (1 - shelter);
    this.rain.visible = this.profile.rain > 0 && shelter < 0.99;
  }

  dispose(): void { this.rain.removeFromParent(); this.rain.geometry.dispose(); this.rain.material.dispose(); }
}
