import { ACESFilmicToneMapping, PCFShadowMap, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { CLOUD_BASE } from '../atmosphere/CloudField';
import { CloudSystem } from '../atmosphere/CloudSystem';
import { SkySystem } from '../atmosphere/SkySystem';
import { WeatherSystem, weatherNames, type WeatherKind } from '../atmosphere/WeatherSystem';
import { FreeCamera } from '../camera/FreeCamera';
import { DebugUI, element } from '../debug/DebugUI';
import { InputManager } from '../input/InputManager';
import { GameLoop } from './GameLoop';
import { World } from '../world/World';
import { randomSeed, startingSeed } from '../world/WorldSeed';
import { CHUNK_SIZE, VIEW_RADII, VIEW_RADIUS } from '../world/ChunkPlanner';
import { routeNames, terrainNames, type TerrainKind, type WorldOptions } from '../world/WorldOptions';
import { DrivingSystem } from '../vehicle/DrivingSystem';
import { WalkingSystem } from '../walking/WalkingSystem';

const biomeNames = { valley: '山谷', forest: '森林', rock: '岩石', alpine: '高山', snow: '雪区', desert: '沙漠' };
const cloudNames = { below: '云下', inside: '云中', above: '云上' };

export class Game {
  private readonly initialSeed = startingSeed(location.search);
  private readonly canvas = element<HTMLCanvasElement>('world');
  private readonly renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
  private readonly scene = new Scene();
  private readonly sky = new SkySystem(this.scene);
  private readonly weather = new WeatherSystem(new Scene());
  private readonly clouds = new CloudSystem(this.initialSeed, this.sky.sun, this.renderer.extensions.has('EXT_color_buffer_float'));
  private readonly camera = new PerspectiveCamera(65, 1, 0.5, 7000);
  private readonly input = new InputManager(this.canvas);
  private readonly flight = new FreeCamera(this.camera, this.input);
  private readonly debug = new DebugUI();
  private readonly releaseNotes = element<HTMLDialogElement>('release-notes');
  private readonly events = new AbortController();
  private readonly loop = new GameLoop((dt) => this.update(dt));
  private world: World;
  private readonly driving: DrivingSystem;
  private readonly walking: WalkingSystem;
  private paused = false;
  private wireframe = false;
  private hudTime = 0;
  private contextLost = false;
  private viewRadius = VIEW_RADIUS;

  constructor() {
    this.scene.background = this.sky.sun.haze;
    this.world = new World(this.scene, this.initialSeed);
    element<HTMLInputElement>('seed').value = this.initialSeed;
    this.driving = new DrivingSystem(this.scene, this.camera, this.input, () => this.world);
    this.walking = new WalkingSystem(this.camera, this.input, () => this.world);
    this.world.resetCamera(this.camera);
    element('phase-label').textContent = '/ DRIVE';
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
      if (!this.paused && !this.releaseNotes.open) { this.driving.action(code); this.walking.action(code); }
    };
    element('drive-toggle').addEventListener('click', () => {
      if (this.driving.active) this.stopDriving();
      else { this.stopWalking(); this.driving.start(); }
      this.setPaused(false); this.canvas.focus();
    }, { signal: this.events.signal });
    element('walk-toggle').addEventListener('click', () => {
      if (this.walking.active) this.stopWalking();
      else { this.stopDriving(); this.walking.start(); }
      this.setPaused(false); this.canvas.focus();
    }, { signal: this.events.signal });
    for (const id of ['sun-view', 'road-view', 'hairpin-view', 'bridge-view', 'junction-view', 'tunnel-view', 'lights-view', 'service-view', 'pass-view', 'cloud-view']) {
      element(id).addEventListener('click', () => this.stopTravel(), { signal: this.events.signal });
    }
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
      this.setTime(Number((event.target as HTMLInputElement).value));
    }, { signal: this.events.signal });
    element('time-preset').addEventListener('change', (event) => {
      const value = Number((event.target as HTMLSelectElement).value);
      if (Number.isFinite(value)) this.setTime(value);
    }, { signal: this.events.signal });
    element('weather-kind').addEventListener('change', (event) => {
      const kind = (event.target as HTMLSelectElement).value as WeatherKind;
      if (Object.hasOwn(weatherNames, kind)) this.weather.setKind(kind, this.paused || this.releaseNotes.open || !this.input.enabled);
    }, { signal: this.events.signal });
    element('fog-density').addEventListener('input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      this.weather.setFogDensity(value / 100, this.paused || this.releaseNotes.open || !this.input.enabled);
      element('fog-density-value').textContent = `${value}%`;
    }, { signal: this.events.signal });
    element('sun-view').addEventListener('click', () => {
      const direction = this.sky.sun.direction;
      this.flight.reset(this.sky.sun.night > 0.5 ? Math.atan2(0.45, 0.7) : Math.atan2(direction.x, -direction.z),
        this.sky.sun.night > 0.5 ? Math.asin(0.55 / Math.hypot(0.45, 0.55, 0.7)) : Math.asin(direction.y));
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
    element('random-world').addEventListener('click', () => this.loadSeed(randomSeed()), { signal: this.events.signal });
    element('world-options').addEventListener('submit', (event) => {
      event.preventDefault();
      const terrain = element<HTMLSelectElement>('terrain-kind').value as TerrainKind;
      const roadType = element<HTMLSelectElement>('road-type').value as WorldOptions['roadType'];
      const roadWidth = Number(element<HTMLSelectElement>('road-width').value);
      const routeStyle = Number(element<HTMLSelectElement>('route-style').value) as WorldOptions['routeStyle'];
      const maxGrade = Number(element<HTMLInputElement>('max-grade').value) / 100;
      const elevationMode = element<HTMLSelectElement>('elevation-mode').value as WorldOptions['elevationMode'];
      const climbMin = elevationMode === 'cycles' ? Number(element<HTMLInputElement>('climb-min').value) : this.world.options.climbMin;
      const climbMax = elevationMode === 'cycles' ? Number(element<HTMLInputElement>('climb-max').value) : this.world.options.climbMax;
      if (!(terrain in terrainNames) || !(routeStyle in routeNames) || !['mountain', 'highway'].includes(roadType) || ![6, 8, 10].includes(roadWidth)
        || !Number.isFinite(maxGrade) || maxGrade < 0 || maxGrade > 0.4 || !['natural', 'cycles'].includes(elevationMode)
        || !Number.isFinite(climbMin + climbMax) || climbMin < 50 || climbMax > 2000 || climbMin > climbMax) return;
      this.loadSeed(this.world.seed, { terrain, roadType, roadWidth, routeStyle, maxGrade, elevationMode, climbMin, climbMax });
    }, { signal: this.events.signal });
    element('max-grade').addEventListener('input', () => {
      element('max-grade-value').textContent = `${element<HTMLInputElement>('max-grade').value}%`;
    }, { signal: this.events.signal });
    for (const id of ['elevation-mode', 'climb-min', 'climb-max']) element(id).addEventListener('input', () => this.syncClimbControls(), { signal: this.events.signal });
    element('eighteen-bends').addEventListener('click', () => {
      element<HTMLSelectElement>('road-type').value = 'mountain';
      element<HTMLSelectElement>('route-style').value = '5';
      element<HTMLInputElement>('max-grade').value = '25'; element('max-grade-value').textContent = '25%';
      element<HTMLSelectElement>('elevation-mode').value = 'cycles';
      const min = element<HTMLInputElement>('climb-min'), max = element<HTMLInputElement>('climb-max');
      this.syncClimbControls();
      if (!min.validity.valid || !max.validity.valid) { min.value = '300'; max.value = '900'; }
      this.syncClimbControls();
    }, { signal: this.events.signal });
    element('vegetation-toggle').addEventListener('click', () => {
      const vegetation = this.world.chunks.vegetation;
      vegetation.enabled = !vegetation.enabled;
      element('vegetation-toggle').setAttribute('aria-pressed', String(vegetation.enabled));
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('view-distance').addEventListener('change', () => {
      const radius = Number(element<HTMLSelectElement>('view-distance').value);
      if (!VIEW_RADII.some(value => value === radius)) return;
      this.viewRadius = radius;
      this.world.chunks.setViewRadius(radius);
      this.camera.far = Math.max(7000, radius * CHUNK_SIZE * 2);
      this.camera.updateProjectionMatrix();
    }, { signal: this.events.signal });
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
    for (const [id, inspect] of [['tunnel-view', () => this.world.inspectTunnel(this.camera)], ['lights-view', () => this.world.inspectLights(this.camera)], ['junction-view', () => this.world.inspectJunction(this.camera)]] as const) {
      element(id).addEventListener('click', () => {
        const view = inspect();
        if (view) { this.flight.reset(view.heading, view.pitch); this.setPaused(false); }
        this.canvas.focus();
      }, { signal: this.events.signal });
    }
    element('lights-toggle').addEventListener('click', () => {
      this.world.furniture.enabled = !this.world.furniture.enabled;
      element('lights-toggle').setAttribute('aria-pressed', String(this.world.furniture.enabled));
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('service-view').addEventListener('click', () => {
      this.world.requestServiceView();
      this.setPaused(false);
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('pass-view').addEventListener('click', () => {
      this.world.requestPassView();
      this.setPaused(false);
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

  private loadSeed(seed: string, options: Readonly<WorldOptions> = this.world.options): void {
    if (this.contextLost) return;
    try {
      const world = new World(this.scene, seed, options);
      this.stopTravel();
      this.world.dispose();
      this.world = world;
      this.world.chunks.setViewRadius(this.viewRadius);
      this.clouds.setSeed(seed);
      this.world.chunks.setWireframe(this.wireframe);
      this.world.chunks.vegetation.enabled = element('vegetation-toggle').getAttribute('aria-pressed') === 'true';
      this.world.roadDebug.enabled = element('road-debug').getAttribute('aria-pressed') === 'true';
      this.world.furniture.enabled = element('lights-toggle').getAttribute('aria-pressed') === 'true';
      element<HTMLInputElement>('seed').value = seed;
      element<HTMLSelectElement>('terrain-kind').value = options.terrain;
      element<HTMLSelectElement>('road-type').value = options.roadType;
      element<HTMLSelectElement>('road-width').value = String(options.roadWidth);
      element<HTMLSelectElement>('route-style').value = String(options.routeStyle);
      element<HTMLInputElement>('max-grade').value = String(Math.round(options.maxGrade * 100));
      element('max-grade-value').textContent = `${Math.round(options.maxGrade * 100)}%`;
      element<HTMLSelectElement>('elevation-mode').value = options.elevationMode;
      element<HTMLInputElement>('climb-min').value = String(options.climbMin); element<HTMLInputElement>('climb-max').value = String(options.climbMax);
      this.syncClimbControls();
      element('settings-status').textContent = `当前：${terrainNames[options.terrain]} · ${routeNames[options.routeStyle]} · 最大坡度 ${Math.round(options.maxGrade * 100)}% · ${options.roadType === 'highway' ? '高速 · 每向' : '山路 ·'} ${options.roadWidth} 米${options.elevationMode === 'cycles' ? ` · 单次爬升 ${options.climbMin}–${options.climbMax} 米` : ''}`;
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

  private setTime(value: number): void {
    this.sky.sun.setTime(value / 100);
    element<HTMLInputElement>('daylight').value = String(value);
    element<HTMLSelectElement>('time-preset').value = [-100, 0, 70, 90, 150].includes(value) ? String(value) : 'custom';
    element('daylight-value').textContent = `${this.sky.sun.label} · ${this.sky.sun.clock}`;
    element('daylight').setAttribute('aria-valuetext', `${this.sky.sun.label}，${this.sky.sun.clock}`);
    element('sun-view').textContent = this.sky.sun.night > 0.5 ? '望向月亮' : '望向太阳';
  }

  private setClouds(enabled: boolean): void {
    this.clouds.enabled = enabled;
    element('cloud-toggle').setAttribute('aria-pressed', String(enabled));
    element('cloud-help').textContent = enabled ? '前往穿云起点，按住 Space 上升，Shift 下降。' : '云层已关闭 · 保留远景雾与所选天气。';
  }

  private syncClimbControls(): void {
    const enabled = element<HTMLSelectElement>('elevation-mode').value === 'cycles';
    const min = element<HTMLInputElement>('climb-min'), max = element<HTMLInputElement>('climb-max');
    min.disabled = max.disabled = !enabled;
    max.setCustomValidity(enabled && Number(min.value) > Number(max.value) ? '爬升上限不能低于下限。' : '');
  }

  private resetCamera(): void {
    this.stopTravel();
    this.world.resetCamera(this.camera);
    this.flight.reset();
    this.setPaused(false);
    this.setClouds(this.clouds.enabled);
    this.canvas.focus();
  }

  private stopDriving(): void {
    if (!this.driving.active) return;
    this.driving.stop();
    this.flight.reset(-this.camera.rotation.y, this.camera.rotation.x);
  }

  private stopWalking(): void {
    if (!this.walking.active) return;
    this.walking.stop();
    this.flight.reset(-this.camera.rotation.y, this.camera.rotation.x);
  }

  private stopTravel(): void { this.stopDriving(); this.stopWalking(); }

  private setError(message: string | null): void {
    const panel = element('error');
    panel.hidden = message === null;
    element('error-message').textContent = message ?? '';
    this.input.enabled = message === null;
    this.input.clear();
    this.canvas.inert = element('explorer').inert = message !== null;
    element<HTMLButtonElement>('controls-toggle').disabled = message !== null;
    element<HTMLButtonElement>('drive-toggle').disabled = message !== null || (!this.driving.active && !this.world.roadReady);
    element<HTMLButtonElement>('walk-toggle').disabled = message !== null || (!this.walking.active && !this.world.roadReady);
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
    if (this.driving.active) this.driving.update(dt, frozen, this.weather.wetness);
    else if (this.walking.active) this.walking.update(dt, frozen);
    else this.flight.update(dt, frozen);
    this.world.update(this.camera, !frozen, this.driving.active ? this.driving.car.heading + (this.driving.car.speed < -0.1 ? Math.PI : 0)
      : this.walking.active ? this.walking.person.heading : undefined, this.driving.active ? this.driving.car : this.walking.active ? this.walking.person : undefined);
    if (this.world.serviceView) {
      this.stopTravel();
      this.flight.reset(this.world.serviceView.heading, this.world.serviceView.pitch);
      this.world.serviceView = undefined;
      this.input.clear();
      this.flight.update(0, false);
    }
    this.driving.sync(Math.max(this.sky.sun.night, this.world.shelter * 0.8, this.weather.profile.rain * 0.35,
      Math.max(0, 1 - this.weather.profile.far / 800) * 0.6), this.weather.profile.rain);
    this.walking.sync();
    this.sky.update(this.camera, this.world.origin, this.weather.profile.sunlight, this.world.shelter);
    this.weather.update(frozen ? 0 : dt, this.camera, this.world.shelter, this.world.origin);
    this.clouds.update(frozen ? 0 : dt, this.camera, this.world.origin, this.weather.profile, this.world.shelter, this.viewRadius * CHUNK_SIZE);
    this.world.furniture.illuminate(this.camera, this.sky.sun.night, this.world.tunnelMesh.lampPositions, this.world.origin.x, this.world.origin.z, this.world.serviceMesh.lampPositions);
    this.world.serviceMesh.windows.material.emissiveIntensity = this.sky.sun.night * 0.35;
    this.world.roadMesh.mesh.material.roughness = 0.95 - this.weather.wetness * 0.58;
    this.renderer.info.reset();
    this.clouds.render(this.renderer, this.scene, this.camera);
    this.weather.render(this.renderer, this.camera, this.clouds.target.depthTexture!);
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
        : stats.queued > 0 ? `山地生成中 · ${stats.active} / ${stats.target} 分块`
        : this.input.pointerLockFailed ? '鼠标锁定不可用 · 请拖动观察' : '拖动视角 · 双击锁定鼠标 · Esc 释放';
      element<HTMLButtonElement>('road-view').disabled = !this.world.roadReady || !this.world.roadSample;
      element<HTMLButtonElement>('hairpin-view').disabled = !this.world.roadReady || !this.world.road.segments.some((segment) => segment.kind === 'hairpin');
      element<HTMLButtonElement>('bridge-view').disabled = !this.world.roadReady || !this.world.bridges.length;
      element<HTMLButtonElement>('tunnel-view').disabled = !this.world.roadReady || !this.world.tunnels.length;
      element<HTMLButtonElement>('lights-view').disabled = !this.world.roadReady || !this.world.furniture.lampPositions.length;
      const searching = this.world.serviceSearchProgress;
      element<HTMLButtonElement>('service-view').disabled = this.world.searching || !this.world.roadReady;
      element('service-view').textContent = searching === null ? '下一服务区' : `定位中 · ${Math.round(searching * 100)}%`;
      const passSearch = this.world.passSearchProgress;
      element<HTMLButtonElement>('pass-view').disabled = this.world.searching || !this.world.roadReady || this.world.options.terrain !== 'alpine' || this.world.network.active.id !== 'root';
      element('pass-view').textContent = passSearch === null ? '下一垭口' : `定位中 · ${Math.round(passSearch * 100)}%`;
      element('route-stage').textContent = this.world.routeStage;
      const junction = this.world.nextJunction;
      element<HTMLButtonElement>('junction-view').disabled = !this.world.roadReady || !junction;
      element('junction-status').textContent = junction ? `${junction.kind === 'stack' ? '环形立交 · 右侧出口' : '三向岔路 · 左 / 直行 / 右'} · ${Math.max(0, Math.round((junction.distance - (this.world.roadSample?.distance ?? 0)) / 10) * 10)} m` : '沿当前路线继续探索';
      element('structure-help').textContent = !this.world.roadReady ? '路线生成中，结构视角稍后开放。'
        : `${this.world.tunnels.length ? '隧道入口：沿道路按 W 前进穿行。' : '当前路段没有隧道，可继续沿道路探索。'}路灯分段出现，入夜点亮。`;
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
        'View distance': `${(this.viewRadius * CHUNK_SIZE / 1000).toFixed(2)} km`, 'Target chunks': stats.target,
        'Mountain stage': this.world.routeStage, 'Mountain passes': this.world.passes.length,
        'Pooled meshes': stats.pooled, 'Allocated meshes': stats.allocated,
        'Pending / queued': `${stats.pending} / ${stats.queued}`, 'Generated chunks': stats.completed,
        'Prefetched chunks': stats.prefetched, 'Preloading chunks': stats.preloading,
        Triangles: this.renderer.info.render.triangles, 'Draw calls': this.renderer.info.render.calls,
        'GPU textures': this.renderer.info.memory.textures,
        'Light phase': this.sky.sun.label, 'Sun elevation': `${this.sky.sun.elevation.toFixed(1)}°`,
        Weather: weatherNames[this.weather.kind], 'World time': this.sky.sun.clock,
        'Rain visible': this.weather.rain.visible ? 'yes' : 'no',
        'Road wetness': `${Math.round(this.weather.wetness * 100)}%`,
        Tunnels: this.world.tunnels.length, 'Tunnel shelter': `${Math.round(this.world.shelter * 100)}%`,
        'Service areas': this.world.services.length,
        'Cable towers': this.world.bridgeMesh.cableBridges.towerCount, 'Stay cables': this.world.bridgeMesh.cableBridges.cables.count,
        'Climb range': this.world.options.elevationMode === 'cycles' ? `${this.world.options.climbMin}–${this.world.options.climbMax} m` : 'natural',
        'Elevated services': this.world.services.filter(site => site.ground.elevated).length,
        'Service mileage': this.world.services.map(site => `${(site.sample.distance / 1000).toFixed(2)} km`).join(', ') || '—',
        'Street lamps': this.world.furniture.lampPositions.length,
        'Active route': this.world.network.active.id, 'Loaded routes': this.world.network.routes.length,
        Junctions: this.world.network.junctions.length,
        'Local lights': this.world.furniture.localLights.filter(light => light.intensity > 0).length,
        'Terrain shadows': this.sky.light.castShadow ? 'on' : 'off',
        Landscape: terrainNames[this.world.options.terrain],
        'Road layout': this.world.options.roadType === 'highway' ? '双向四车道' : '双向两车道',
        'Carriageway width': `${this.world.options.roadWidth} m`,
        'Route style': routeNames[this.world.options.routeStyle], 'Maximum grade': `${Math.round(this.world.options.maxGrade * 100)}%`, 'Route checkpoints': this.world.road.checkpointCount,
        'Roadside grass': chunks.vegetation.meadow.count, 'Wildflowers': chunks.vegetation.flowers.count + chunks.vegetation.flowerSpikes.count,
        'Vegetation instances': chunks.vegetation.enabled ? chunks.vegetation.count : 0,
        'Tree canopies': chunks.vegetation.enabled ? chunks.vegetation.canopyCount : 0,
        'Distant canopies': chunks.vegetation.enabled ? chunks.vegetation.distantCount : 0,
        'Ground cover': chunks.vegetation.enabled ? chunks.vegetation.groundCount : 0,
        'Origin rebases': origin.count, 'Flight speed': `${this.flight.speed} m/s`, Seed: this.world.seed,
        'Travel mode': this.driving.active ? 'driving' : this.walking.active ? 'walking' : 'flight',
        'Walking speed': `${(this.walking.person.speed * 3.6).toFixed(1)} km/h`,
        'Walking grounded': this.walking.person.grounded ? 'yes' : 'no',
        'Walking position': `${this.walking.person.x.toFixed(2)}, ${this.walking.person.y.toFixed(2)}, ${this.walking.person.z.toFixed(2)}`,
        'Vehicle speed': `${(this.driving.car.speed * 3.6).toFixed(1)} km/h`,
        'Vehicle model': this.driving.car.profile.name,
        'Trailer angle': `${(this.driving.car.articulation * 180 / Math.PI).toFixed(1)}°`,
        'Vehicle position': `${this.driving.car.x.toFixed(2)}, ${this.driving.car.y.toFixed(2)}, ${this.driving.car.z.toFixed(2)}`,
        'Vehicle suspension': `${this.driving.car.suspension} · ${this.driving.car.wheels.map(wheel => (wheel.compression * 100).toFixed(1)).join(' / ')} cm`,
        'Suspension damping': `${Math.round(this.driving.car.damping * 100)}%`,
        'Vehicle lights': this.driving.systems.beam,
        'Vehicle signal': this.driving.systems.signal,
        'Light power': `${Math.round(this.driving.systems.lightPower * 100)}%`, 'Light range': `${this.driving.systems.lightRange} m`,
        'Wiper sweep': this.driving.systems.sweep.toFixed(3),
        'Wiper rate': this.driving.systems.wiperRate.toFixed(1),
        'Driving camera': this.driving.cameraRig.view,
        'Camera FOV': `${this.camera.fov}°`, 'Camera height': `${Math.round(this.driving.cameraRig.height * 100)} cm`,
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
        'Tallest bridge': `${Math.max(0, ...this.world.bridges.map(bridge => bridge.depth)).toFixed(0)} m`,
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
    this.driving.dispose();
    this.walking.dispose();
    this.world.dispose();
    this.clouds.dispose();
    this.weather.dispose();
    this.sky.dispose();
    this.renderer.dispose();
  }
}
