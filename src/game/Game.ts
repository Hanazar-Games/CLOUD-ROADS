import { ACESFilmicToneMapping, PCFShadowMap, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { CLOUD_BASE } from '../atmosphere/CloudField';
import { CloudSystem } from '../atmosphere/CloudSystem';
import { SkySystem } from '../atmosphere/SkySystem';
import { FreeCamera } from '../camera/FreeCamera';
import { DebugUI, element } from '../debug/DebugUI';
import { InputManager } from '../input/InputManager';
import { GameLoop } from './GameLoop';
import { World } from '../world/World';
import { DEFAULT_SEED } from '../world/WorldSeed';
import { CHUNK_SIZE } from '../world/ChunkPlanner';

const biomeNames = { valley: '山谷', forest: '森林', rock: '岩石', alpine: '高山', snow: '雪区' };
const cloudNames = { below: '云下', inside: '云中', above: '云上' };

export class Game {
  private readonly canvas = element<HTMLCanvasElement>('world');
  private readonly renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
  private readonly scene = new Scene();
  private readonly sky = new SkySystem(this.scene);
  private readonly clouds = new CloudSystem(DEFAULT_SEED, this.sky.sun, this.renderer.extensions.has('EXT_color_buffer_float'));
  private readonly camera = new PerspectiveCamera(65, 1, 0.5, 7000);
  private readonly input = new InputManager(this.canvas);
  private readonly flight = new FreeCamera(this.camera, this.input);
  private readonly debug = new DebugUI();
  private readonly releaseNotes = element<HTMLDialogElement>('release-notes');
  private readonly events = new AbortController();
  private readonly loop = new GameLoop((dt) => this.update(dt));
  private world: World;
  private paused = false;
  private wireframe = false;
  private hudTime = 0;
  private contextLost = false;

  constructor() {
    this.scene.background = this.sky.sun.haze;
    this.world = new World(this.scene, DEFAULT_SEED);
    this.world.resetCamera(this.camera);
    element('phase-label').textContent = '/ 09';
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.resize();
    window.addEventListener('resize', this.resize, { signal: this.events.signal });
    this.input.onAction = (code) => {
      if (code === 'F3') this.debug.toggle();
      if (code === 'KeyP') this.setPaused(!this.paused);
    };
    element('debug-close').addEventListener('click', () => {
      this.debug.hide();
      if (this.input.enabled) this.canvas.focus();
    }, { signal: this.events.signal });
    element<HTMLInputElement>('speed').addEventListener('input', (event) => {
      this.flight.speed = Number((event.target as HTMLInputElement).value);
      element('speed-value').textContent = `${this.flight.speed} m/s`;
      element('speed').setAttribute('aria-valuetext', `每秒 ${this.flight.speed} 米`);
    }, { signal: this.events.signal });
    element<HTMLInputElement>('daylight').addEventListener('input', (event) => {
      this.sky.sun.setTime(Number((event.target as HTMLInputElement).value) / 100);
      element('daylight-value').textContent = this.sky.sun.label;
      element('daylight').setAttribute('aria-valuetext', `${this.sky.sun.label}，太阳高度 ${this.sky.sun.elevation.toFixed(1)} 度`);
    }, { signal: this.events.signal });
    element('sun-view').addEventListener('click', () => {
      const direction = this.sky.sun.direction;
      this.flight.reset(Math.atan2(direction.x, -direction.z), Math.asin(direction.y));
      this.setPaused(false);
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('shadows').addEventListener('click', () => {
      this.sky.light.castShadow = !this.sky.light.castShadow;
      element('shadows').setAttribute('aria-pressed', String(this.sky.light.castShadow));
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('seed-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const seed = element<HTMLInputElement>('seed').value.trim();
      if (!seed) { element<HTMLInputElement>('seed').value = this.world.seed; return; }
      this.loadSeed(seed);
    }, { signal: this.events.signal });
    element('retry-world').addEventListener('click', () => this.loadSeed(this.world.seed), { signal: this.events.signal });
    element('pause').addEventListener('click', () => {
      this.setPaused(!this.paused);
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('controls-toggle').addEventListener('click', () => {
      const panel = element('explorer'), button = element('controls-toggle');
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
      button.textContent = panel.hidden ? '展开面板' : '收起面板';
    }, { signal: this.events.signal });
    element('home').addEventListener('click', () => this.resetCamera(), { signal: this.events.signal });
    element('road-view').addEventListener('click', () => {
      const heading = this.world.inspectRoad(this.camera);
      if (heading !== undefined) { this.flight.reset(heading, -0.18); this.setPaused(false); }
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('road-debug').addEventListener('click', () => {
      this.world.roadDebug.enabled = !this.world.roadDebug.enabled;
      element('road-debug').setAttribute('aria-pressed', String(this.world.roadDebug.enabled));
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('hairpin-view').addEventListener('click', () => {
      const view = this.world.inspectHairpin(this.camera);
      if (view) { this.flight.reset(view.heading, view.pitch); this.setPaused(false); }
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('bridge-view').addEventListener('click', () => {
      const view = this.world.inspectBridge(this.camera);
      if (view) { this.flight.reset(view.heading, view.pitch); this.setPaused(false); }
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('cloud-view').addEventListener('click', () => {
      const view = this.world.inspectValley(this.camera, CLOUD_BASE - 80);
      if (view) {
        this.setClouds(true);
        this.flight.reset(view.heading, view.pitch);
        this.setPaused(false);
        element('cloud-help').textContent = 'Space 上升穿云，Shift 下降；穿出后拖动视角俯瞰云海。';
      } else {
        element('cloud-help').textContent = this.world.roadReady ? '附近没有安全的云下低谷，请移动后重试。' : '路线生成中，请稍候再试。';
      }
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('cloud-toggle').addEventListener('click', () => {
      this.setClouds(!this.clouds.enabled);
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('wireframe').addEventListener('click', () => {
      this.wireframe = !this.wireframe;
      this.world.chunks.setWireframe(this.wireframe);
      element('wireframe').setAttribute('aria-pressed', String(this.wireframe));
      this.canvas.focus();
    }, { signal: this.events.signal });
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      element<HTMLButtonElement>('retry-world').disabled = true;
      this.loop.stop();
      this.setError('图形上下文暂时丢失，正在等待浏览器恢复。');
    }, { signal: this.events.signal });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      element<HTMLButtonElement>('retry-world').disabled = false;
      this.setError(this.world.chunks.error ? `地形生成失败，请重试当前世界。${this.world.chunks.error}` : null);
      if (this.input.enabled && !this.releaseNotes.open) this.canvas.focus();
      this.loop.start();
    }, { signal: this.events.signal });
    this.loop.start();
  }

  private loadSeed(seed: string): void {
    if (this.contextLost) return;
    try {
      const world = new World(this.scene, seed);
      this.world.dispose();
      this.world = world;
      this.clouds.setSeed(seed);
      this.world.chunks.setWireframe(this.wireframe);
      this.world.roadDebug.enabled = element('road-debug').getAttribute('aria-pressed') === 'true';
      element<HTMLInputElement>('seed').value = seed;
      this.setError(null);
      this.resetCamera();
    } catch (error) {
      this.setError(`无法加载世界，请重试。${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.input.clear();
    element('pause').setAttribute('aria-pressed', String(paused));
    element('pause').textContent = paused ? '继续探索' : '暂停探索';
  }

  private setClouds(enabled: boolean): void {
    this.clouds.enabled = enabled;
    element('cloud-toggle').setAttribute('aria-pressed', String(enabled));
    element('cloud-help').textContent = enabled ? '前往穿云起点，按住 Space 上升，Shift 下降。' : '云层已关闭 · 保留基础远景雾。';
  }

  private resetCamera(): void {
    this.world.resetCamera(this.camera);
    this.flight.reset();
    this.setPaused(false);
    this.setClouds(this.clouds.enabled);
    this.canvas.focus();
  }

  private setError(message: string | null): void {
    const panel = element('error');
    panel.hidden = message === null;
    element('error-message').textContent = message ?? '';
    this.input.enabled = message === null;
    this.input.clear();
    this.canvas.inert = element('explorer').inert = message !== null;
    element<HTMLButtonElement>('controls-toggle').disabled = message !== null;
    if (message !== null) {
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      if (!this.releaseNotes.open) panel.focus();
    }
  }

  private readonly resize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.clouds.resize(this.canvas.width, this.canvas.height);
  };

  private update(dt: number): void {
    if (this.world.chunks.error && element('error').hidden) this.setError(`地形生成失败，请重试当前世界。${this.world.chunks.error}`);
    const frozen = this.paused || this.releaseNotes.open || !this.input.enabled;
    this.flight.update(dt, frozen);
    this.world.update(this.camera);
    this.sky.update(this.camera, this.world.origin);
    this.clouds.update(frozen ? 0 : dt, this.camera, this.world.origin);
    this.renderer.info.reset();
    this.clouds.render(this.renderer, this.scene, this.camera);
    const { origin, chunks } = this.world;
    const x = this.camera.position.x + origin.x, z = this.camera.position.z + origin.z;
    const y = this.camera.position.y;
    const stats = chunks.stats;
    this.hudTime += dt;
    if (this.hudTime >= 0.15) {
      this.hudTime = 0;
      element('altitude').textContent = Math.round(y).toLocaleString();
      element('position').textContent = `${Math.round(x)} / ${Math.round(z)}`;
      element('notice').textContent = !this.input.enabled ? '探索已中止 · 请重试当前世界' : this.paused ? '已暂停 · 按 P 继续' : !this.world.roadReady ? '路线生成中 · 请稍候'
        : stats.queued > 0 ? `山地生成中 · ${stats.active} / 289 分块`
        : this.input.pointerLockFailed ? '鼠标锁定不可用 · 请拖动观察' : '拖动视角 · 双击锁定鼠标 · Esc 释放';
      element<HTMLButtonElement>('road-view').disabled = !this.world.roadReady || !this.world.roadSample;
      element<HTMLButtonElement>('hairpin-view').disabled = !this.world.roadReady || !this.world.road.segments.some((segment) => segment.kind === 'hairpin');
      element<HTMLButtonElement>('bridge-view').disabled = !this.world.roadReady || !this.world.bridges.length;
      element<HTMLButtonElement>('cloud-view').disabled = !this.world.roadReady;
      element('cloud-region').textContent = this.clouds.enabled ? cloudNames[this.clouds.sample.region] : '云层关闭';
    }
    this.debug.update(() => {
      const ground = this.world.roadReady ? this.world.sampleGround(x, z) : undefined;
      return {
        Coordinates: `${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`,
        'Local X / Z': `${this.camera.position.x.toFixed(1)} / ${this.camera.position.z.toFixed(1)}`,
        Chunk: `${Math.floor(x / CHUNK_SIZE)}, ${Math.floor(z / CHUNK_SIZE)}`,
        'Active chunks': stats.active, 'LOD 0 / 1 / 2': `${stats.high} / ${stats.medium} / ${stats.low}`,
        'Pooled meshes': stats.pooled, 'Allocated meshes': stats.allocated,
        'Pending / queued': `${stats.pending} / ${stats.queued}`, 'Generated chunks': stats.completed,
        Triangles: this.renderer.info.render.triangles, 'Draw calls': this.renderer.info.render.calls,
        'GPU textures': this.renderer.info.memory.textures,
        'Light phase': this.sky.sun.label, 'Sun elevation': `${this.sky.sun.elevation.toFixed(1)}°`,
        'Terrain shadows': this.sky.light.castShadow ? 'on' : 'off',
        'Origin rebases': origin.count, 'Flight speed': `${this.flight.speed} m/s`, Seed: this.world.seed,
        'Cloud region': this.clouds.enabled ? cloudNames[this.clouds.sample.region] : '关闭',
        'Cloud base / top': `${this.clouds.sample.base.toFixed(0)} / ${this.clouds.sample.top.toFixed(0)} m`,
        'Cloud density': `${((this.clouds.enabled ? this.clouds.sample.density : 0) * 100).toFixed(0)}%`,
        'Fog near / far': `${this.clouds.fog.near.toFixed(0)} / ${this.clouds.fog.far.toFixed(0)} m`,
        'Ground biome': ground ? biomeNames[ground.biome.kind] : '—',
        'Ground altitude': ground ? `${ground.height.toFixed(0)} m` : '—',
        'Ground slope': ground ? `${(Math.acos(ground.normalY) * 180 / Math.PI).toFixed(1)}°` : '—',
        'Snow cover': ground ? `${(ground.biome.weights.snow * 100).toFixed(0)}%` : '—',
        'Snow line': ground ? `${ground.biome.snowLine.toFixed(0)} m` : '—',
        Temperature: ground ? `${ground.biome.temperature.toFixed(1)} °C` : '—',
        Humidity: ground ? `${(ground.biome.humidity * 100).toFixed(0)}%` : '—',
        'Road segments': this.world.road.segments.length, 'Road ready': this.world.roadReady ? 'yes' : 'generating',
        'Hairpins': this.world.road.segments.filter((segment) => segment.kind === 'hairpin').length,
        'Bridges': this.world.bridges.length, 'Bridge piers': this.world.bridgeMesh.pierCount,
        'Road distance': this.world.roadSample ? `${(this.world.roadSample.distance / 1000).toFixed(2)} km` : '—',
        'Road grade': this.world.roadSample ? `${(this.world.roadSample.grade * 100).toFixed(2)}%` : '—',
        'Road curvature': this.world.roadSample?.curvature.toFixed(5) ?? '—',
      };
    });
  }

  dispose(): void {
    this.loop.stop();
    this.events.abort();
    this.input.dispose();
    this.world.dispose();
    this.clouds.dispose();
    this.sky.dispose();
    this.renderer.dispose();
  }
}
