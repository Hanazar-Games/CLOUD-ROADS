import { ACESFilmicToneMapping, Color, DirectionalLight, Fog, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { FreeCamera } from '../camera/FreeCamera';
import { DebugUI, element } from '../debug/DebugUI';
import { InputManager } from '../input/InputManager';
import { GameLoop } from './GameLoop';
import { World } from '../world/World';
import { DEFAULT_SEED } from '../world/WorldSeed';
import { CHUNK_SIZE } from '../world/ChunkPlanner';

const biomeNames = { valley: '山谷', forest: '森林', rock: '岩石', alpine: '高山', snow: '雪区' };

export class Game {
  private readonly canvas = element<HTMLCanvasElement>('world');
  private readonly renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
  private readonly scene = new Scene();
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
    this.scene.background = new Color(0xa5bec9);
    this.scene.fog = new Fog(0xa5bec9, 1000, 1950);
    this.scene.add(new HemisphereLight(0xe4f1ff, 0x475346, 2.2));
    const sun = new DirectionalLight(0xffefd3, 2.4);
    sun.position.set(-1800, 2600, -1600);
    this.scene.add(sun);
    this.world = new World(this.scene, DEFAULT_SEED);
    this.world.resetCamera(this.camera);
    element('phase-label').textContent = '/ 07';
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.resize();
    window.addEventListener('resize', this.resize, { signal: this.events.signal });
    this.input.onAction = (code) => {
      if (code === 'F3') this.debug.toggle();
      if (code === 'KeyP') this.setPaused(!this.paused);
    };
    element<HTMLInputElement>('speed').addEventListener('input', (event) => {
      this.flight.speed = Number((event.target as HTMLInputElement).value);
      element('speed-value').textContent = `${this.flight.speed} m/s`;
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
      this.input.clear();
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
      if (heading !== undefined) { this.flight.reset(heading, -0.18); this.input.clear(); this.setPaused(false); }
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('road-debug').addEventListener('click', () => {
      this.world.roadDebug.enabled = !this.world.roadDebug.enabled;
      element('road-debug').setAttribute('aria-pressed', String(this.world.roadDebug.enabled));
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('hairpin-view').addEventListener('click', () => {
      const view = this.world.inspectHairpin(this.camera);
      if (view) { this.flight.reset(view.heading, view.pitch); this.input.clear(); this.setPaused(false); }
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('bridge-view').addEventListener('click', () => {
      const view = this.world.inspectBridge(this.camera);
      if (view) { this.flight.reset(view.heading, view.pitch); this.input.clear(); this.setPaused(false); }
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
      this.input.enabled = false;
      this.input.clear();
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      element<HTMLButtonElement>('retry-world').disabled = true;
      this.loop.stop();
      this.showError('图形上下文暂时丢失，正在等待浏览器恢复。');
    }, { signal: this.events.signal });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.input.enabled = true;
      this.input.clear();
      element<HTMLButtonElement>('retry-world').disabled = false;
      element('error').hidden = true;
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
      this.world.chunks.setWireframe(this.wireframe);
      this.world.roadDebug.enabled = element('road-debug').getAttribute('aria-pressed') === 'true';
      element<HTMLInputElement>('seed').value = seed;
      this.resetCamera();
      element('error').hidden = true;
    } catch (error) {
      this.showError(`无法加载世界，请重试。${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    element('pause').setAttribute('aria-pressed', String(paused));
    element('pause').textContent = paused ? '继续探索' : '暂停探索';
  }

  private resetCamera(): void {
    this.world.resetCamera(this.camera);
    this.flight.reset();
    this.input.clear();
    this.setPaused(false);
    this.canvas.focus();
  }

  private showError(message: string): void {
    element('error').hidden = false;
    element('error-message').textContent = message;
  }

  private readonly resize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  };

  private update(dt: number): void {
    this.flight.update(dt, this.paused || this.releaseNotes.open);
    this.world.update(this.camera);
    this.renderer.render(this.scene, this.camera);
    const { origin, chunks } = this.world;
    const x = this.camera.position.x + origin.x, z = this.camera.position.z + origin.z;
    const y = this.camera.position.y;
    const stats = chunks.stats;
    this.hudTime += dt;
    if (this.hudTime >= 0.15) {
      this.hudTime = 0;
      element('altitude').textContent = Math.round(y).toLocaleString();
      element('position').textContent = `${Math.round(x)} / ${Math.round(z)}`;
      element('notice').textContent = this.paused ? '已暂停 · 按 P 继续' : !this.world.roadReady ? '路线生成中 · 请稍候'
        : stats.queued > 0 ? `山地生成中 · ${stats.active} / 289 分块`
        : this.input.pointerLockFailed ? '鼠标锁定不可用 · 请拖动观察' : '拖动视角 · 双击锁定鼠标 · Esc 释放';
      element<HTMLButtonElement>('road-view').disabled = !this.world.roadReady || !this.world.roadSample;
      element<HTMLButtonElement>('hairpin-view').disabled = !this.world.roadReady || !this.world.road.segments.some((segment) => segment.kind === 'hairpin');
      element<HTMLButtonElement>('bridge-view').disabled = !this.world.roadReady || !this.world.bridges.length;
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
        'Origin rebases': origin.count, 'Flight speed': `${this.flight.speed} m/s`, Seed: this.world.seed,
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
    if (chunks.error && element('error').hidden) this.showError(`地形生成失败，请重试当前世界。${chunks.error}`);
  }

  dispose(): void {
    this.loop.stop();
    this.events.abort();
    this.input.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
