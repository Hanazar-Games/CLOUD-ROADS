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
import { absoluteElevation, roadNames, routeNames, terrainNames, type WorldOptions } from '../world/WorldOptions';
import { roadLayout } from '../road/RoadProfile';
import { DrivingSystem } from '../vehicle/DrivingSystem';
import { VehicleAccess } from '../vehicle/VehicleAccess';
import { vehicleProfiles } from '../vehicle/VehicleConfig';
import { WalkingSystem } from '../walking/WalkingSystem';
import { graphicsPresets, renderPixelRatio } from './GraphicsSettings';
import { AudioSystem, audioChannels, type MusicStyle } from '../audio/AudioSystem';
import { SettingsDialog } from '../ui/SettingsDialog';
import { CabinDialogs } from '../ui/CabinDialogs';
import { radioStations } from '../audio/RadioStations';
import { seasonNames, type Season } from '../season/SeasonState';
import { WorldSettings } from '../settings/WorldSettings';
import { PresetPanel } from '../settings/PresetPanel';
import { KeyBindingPanel } from '../settings/KeyBindingPanel';

const biomeNames = { valley: '山谷', forest: '森林', rock: '岩石', alpine: '高山', snow: '雪区', desert: '沙漠' };
const cloudNames = { below: '云下', inside: '云中', above: '云上' };

export class Game {
  private readonly initialSeed = startingSeed(location.search);
  private readonly canvas = element<HTMLCanvasElement>('world');
  private readonly renderer = new WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
  private readonly scene = new Scene();
  private readonly sky = new SkySystem(this.scene);
  private readonly weather = new WeatherSystem(new Scene());
  private readonly clouds = new CloudSystem(this.initialSeed, this.sky.sun, this.renderer.extensions.has('EXT_color_buffer_float'));
  private readonly camera = new PerspectiveCamera(65, 1, 0.5, 7000);
  private readonly input = new InputManager(this.canvas);
  private readonly settings = new SettingsDialog(() => this.input.clear());
  private readonly worldSettings = new WorldSettings();
  private readonly presets: PresetPanel;
  private readonly flight = new FreeCamera(this.camera, this.input);
  private readonly debug = new DebugUI();
  private readonly releaseNotes = element<HTMLDialogElement>('release-notes');
  private readonly events = new AbortController();
  private readonly loop = new GameLoop((dt) => this.update(dt));
  private world: World;
  private readonly driving: DrivingSystem;
  private readonly walking: WalkingSystem;
  private readonly cabinDialogs: CabinDialogs;
  private readonly keyBindingPanel: KeyBindingPanel;
  private paused = false;
  private wireframe = false;
  private hudTime = 0;
  private contextLost = false;
  private viewRadius = VIEW_RADIUS;
  private renderScale = 1;
  private readonly audio = new AudioSystem();
  private audioPreviewPending = false;
  private windowFocused = true;

  constructor() {
    this.scene.background = this.sky.sun.haze;
    this.world = new World(this.scene, this.initialSeed);
    this.weather.setSeason(this.world.season);
    element<HTMLInputElement>('seed').value = this.initialSeed;
    this.driving = new DrivingSystem(this.scene, this.camera, this.input, () => this.world);
    this.walking = new WalkingSystem(this.camera, this.input, () => this.world, () => this.driving.parked ? this.driving.car : undefined);
    this.cabinDialogs = new CabinDialogs(this.driving, () => this.input.clear(), () => this.setPaused(!this.paused), category => {
      this.settings.show();
      if (category) document.querySelector<HTMLButtonElement>(`[data-settings-target="${category}"]`)!.click();
    }, this.input.bindings);
    this.keyBindingPanel = new KeyBindingPanel(this.input);
    this.world.resetCamera(this.camera);
    element('phase-label').textContent = '/ DRIVE';
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.clouds.target.samples = 2;
    this.loop.setFrameLimit(60);
    this.resize();
    window.addEventListener('resize', this.resize, { signal: this.events.signal });
    element('audio-toggle').addEventListener('click', () => { this.audio.toggle(); this.syncAudioUI(); }, { signal: this.events.signal });
    for (const [name, field, label] of audioChannels) {
      const id = `${name}-volume`, row = document.createElement('div'), initial = Math.round(this.audio[field] * 100);
      row.innerHTML = `<label class="speed-label" for="${id}">${label}<output id="${id}-value">${initial}%</output></label><input id="${id}" type="range" min="0" max="${['master', 'sfx', 'music'].includes(name) ? 100 : 150}" step="5" value="${initial}" />`;
      element('audio-channels').append(row);
      element(id).addEventListener('input', () => {
      const value = Number(element<HTMLInputElement>(id).value);
      this.audio[field] = value / 100; element(`${id}-value`).textContent = `${value}%`;
      }, { signal: this.events.signal });
    }
    element('music-style').addEventListener('change', () => { this.audio.musicStyle = element<HTMLSelectElement>('music-style').value as MusicStyle; }, { signal: this.events.signal });
    const radio = element<HTMLSelectElement>('radio-station');
    radio.replaceChildren(...radioStations.map((station, i) => new Option(`${i + 1} · ${station.name}`, String(i + 1))));
    radio.addEventListener('change', () => this.tuneRadio(Number(radio.value)), { signal: this.events.signal });
    element('music-pace').addEventListener('input', () => {
      const value = Number(element<HTMLInputElement>('music-pace').value); this.audio.musicPace = value / 100;
      element('music-pace-value').textContent = `${value}%`;
    }, { signal: this.events.signal });
    for (const kind of ['engine', 'shift', 'horn'] as const) element(`preview-${kind}`).addEventListener('click', () => {
      this.audioPreviewPending = this.audio.preview(kind);
      element('audio-preview-status').textContent = this.audioPreviewPending ? '正在试听 · 使用当前混音参数'
        : `请开启声音、解除暂停，并调高总音量、全部音效及「${kind === 'horn' ? '喇叭、提示与脚步' : '发动机与换挡'}」音量。`;
    }, { signal: this.events.signal });
    window.addEventListener('blur', () => { this.windowFocused = false; this.audio.setActive(false); }, { signal: this.events.signal });
    window.addEventListener('focus', () => { this.windowFocused = true; }, { signal: this.events.signal });
    this.input.onAction = (code) => {
      if (code === 'F3') this.debug.toggle();
      if (code === 'Pause' || code === 'F8') this.setPaused(!this.paused);
      if (code === 'KeyM') this.cabinDialogs.showMenu();
      if (code === 'KeyP') this.cabinDialogs.showSeats();
      if (code === 'Panel') this.cabinDialogs.showVehicle();
      if (code === 'Settings') this.settings.show();
      if (!this.paused && !this.releaseNotes.open && !this.settings.open && !this.cabinDialogs.open) {
        if (/^Digit\d$/.test(code) && this.driving.active) this.tuneRadio(Number(code.slice(5)) || 10);
        if (code === 'Audio') element<HTMLButtonElement>('audio-toggle').click();
        if (code === 'KeyF') this.interactVehicle();
        else if (!this.access || this.access.sequence.closing) { this.driving.action(code); this.walking.action(code); }
      }
    };
    element('traffic-density').addEventListener('input', () => {
      const density = Number(element<HTMLInputElement>('traffic-density').value);
      this.world.traffic.density = density; element('traffic-density-value').textContent = `${density}%`;
    }, { signal: this.events.signal });
    element('drive-toggle').addEventListener('click', () => {
      if (this.driving.active) this.stopDriving();
      else if (this.walking.active && (this.driving.canBoard(this.walking.person) || this.driving.nearbyVehicle(this.walking.person))) this.interactVehicle();
      else { this.stopWalking(); this.driving.start(); }
      this.setPaused(false); this.canvas.focus();
    }, { signal: this.events.signal });
    element('walk-toggle').addEventListener('click', () => {
      if (this.walking.active) this.stopWalking();
      else if (this.driving.active) this.interactVehicle();
      else this.walking.start();
      this.setPaused(false); this.canvas.focus();
    }, { signal: this.events.signal });
    for (const id of ['sun-view', 'road-view', 'hairpin-view', 'bridge-view', 'junction-view', 'crossing-view', 'tunnel-view', 'lights-view', 'service-view', 'pass-view', 'cloud-view']) {
      element(id).addEventListener('click', () => { this.settings.close(); this.stopTravel(); }, { signal: this.events.signal });
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
    element('season-kind').addEventListener('change', () => {
      const kind = element<HTMLSelectElement>('season-kind').value as Season;
      if (Object.hasOwn(seasonNames, kind)) this.world.setSeason(kind);
    }, { signal: this.events.signal });
    element('weather-kind').addEventListener('change', (event) => {
      const kind = (event.target as HTMLSelectElement).value as WeatherKind;
      if (Object.hasOwn(weatherNames, kind)) this.weather.setKind(kind, this.paused || this.settings.open || this.releaseNotes.open || !this.input.enabled);
    }, { signal: this.events.signal });
    element('fog-density').addEventListener('input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      this.weather.setFogDensity(value / 100, this.paused || this.settings.open || this.releaseNotes.open || !this.input.enabled);
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
      element<HTMLSelectElement>('shadow-quality').value = this.sky.light.castShadow ? '0' : '2048';
      this.applyGraphics(); this.customGraphics();
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
      try { this.loadSeed(this.world.seed, this.worldSettings.read()); }
      catch (error) { element('settings-status').textContent = error instanceof Error ? error.message : String(error); }
    }, { signal: this.events.signal });
    element('eighteen-bends').addEventListener('click', () => {
      element<HTMLSelectElement>('road-type').value = 'mountain';
      element<HTMLSelectElement>('route-style').value = '5';
      element<HTMLInputElement>('max-grade').value = '25'; element('max-grade-value').textContent = '25%';
      element<HTMLSelectElement>('elevation-mode').value = 'cycles';
      const min = element<HTMLInputElement>('climb-min'), max = element<HTMLInputElement>('climb-max');
      this.worldSettings.sync();
      if (!min.validity.valid || !max.validity.valid) { min.value = '300'; max.value = '900'; }
      this.worldSettings.sync();
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
      this.customGraphics();
    }, { signal: this.events.signal });
    element('graphics-preset').addEventListener('change', () => {
      const preset = graphicsPresets[element<HTMLSelectElement>('graphics-preset').value as keyof typeof graphicsPresets];
      if (!preset) return;
      for (const [id, value] of [['render-scale', preset.scale], ['shadow-quality', preset.shadows], ['antialiasing', preset.samples], ['view-distance', preset.radius], ['map-detail', preset.detail], ['cloud-quality', preset.cloudSteps]] as const)
        element<HTMLSelectElement>(id).value = String(value);
      this.setClouds(preset.clouds); this.applyGraphics();
    }, { signal: this.events.signal });
    for (const id of ['render-scale', 'shadow-quality', 'antialiasing', 'map-detail', 'cloud-quality']) element(id).addEventListener('change', () => {
      this.applyGraphics(); this.customGraphics();
    }, { signal: this.events.signal });
    element('frame-limit').addEventListener('change', () => this.loop.setFrameLimit(Number(element<HTMLSelectElement>('frame-limit').value)), { signal: this.events.signal });
    element('cloud-toggle').addEventListener('click', () => this.customGraphics(), { signal: this.events.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.audio.setActive(false); this.loop.stop(); }
      else if (!this.contextLost) this.loop.start();
    }, { signal: this.events.signal });
    element('pause').addEventListener('click', () => {
      this.setPaused(!this.paused);
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('home').addEventListener('click', () => { this.settings.close(); this.resetCamera(); }, { signal: this.events.signal });
    element('crossing-view').addEventListener('click', () => {
      const view = this.world.inspectCrossing(this.camera);
      if (view) { this.flight.reset(view.heading, view.pitch); this.setPaused(false); }
      this.canvas.focus();
    }, { signal: this.events.signal });
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
        if (id === 'junction-view' && this.world.searching) {
          element<HTMLButtonElement>(id).disabled = true;
          element(id).textContent = '定位中 · 0%';
          this.setPaused(false);
        }
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
      if (this.world.searching) {
        element<HTMLButtonElement>('service-view').disabled = true;
        element('service-view').textContent = '定位中 · 0%';
      }
      this.setPaused(false);
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('pass-view').addEventListener('click', () => {
      this.world.requestPassView();
      if (this.world.searching) {
        element<HTMLButtonElement>('pass-view').disabled = true;
        element('pass-view').textContent = '定位中 · 0%';
      }
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
      this.audio.setActive(false);
      element<HTMLButtonElement>('retry-world').disabled = true;
      this.loop.stop();
      this.setError('图形上下文暂时丢失，正在等待浏览器恢复。');
    }, { signal: this.events.signal });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      element<HTMLButtonElement>('retry-world').disabled = false;
      this.setError(this.world.chunks.error ? `地形生成失败，请重试当前世界。${this.world.chunks.error}` : null);
      if (this.input.enabled && !this.releaseNotes.open) this.canvas.focus();
      this.resize();
      if (!document.hidden) this.loop.start();
    }, { signal: this.events.signal });
    this.presets = new PresetPanel(() => ({ seed: this.world.seed, world: this.worldSettings.read(), factorySpeed: this.driving.car.speedLimit === undefined }), preset => {
      if (!this.loadSeed(preset.seed, preset.world)) throw new Error('世界尚未就绪，请等待恢复后再应用预设。');
      this.driving.car.park(); this.driving.describeEquipment();
      this.settings.show();
    }, preset => {
      if (preset.factorySpeed) this.driving.car.setSpeedLimit();
      this.driving.describeTuning(); this.applyGraphics(); this.customGraphics(); this.syncAudioUI();
    });
    this.loop.start();
  }

  private loadSeed(seed: string, options: Readonly<WorldOptions> = this.world.options): boolean {
    if (this.contextLost) return false;
    this.settings.close();
    try {
      const world = new World(this.scene, seed, options);
      world.setSeason(this.world.season.kind);
      this.stopTravel();
      this.world.dispose();
      this.world = world;
      this.weather.setSeason(world.season);
      this.world.traffic.density = Number(element<HTMLInputElement>('traffic-density').value);
      this.world.chunks.setViewRadius(this.viewRadius);
      this.clouds.setSeed(seed);
      this.world.chunks.setWireframe(this.wireframe);
      this.world.chunks.vegetation.enabled = element('vegetation-toggle').getAttribute('aria-pressed') === 'true';
      this.world.chunks.vegetation.setDetailLevel(Number(element<HTMLSelectElement>('map-detail').value));
      this.world.roadDebug.enabled = element('road-debug').getAttribute('aria-pressed') === 'true';
      this.world.furniture.enabled = element('lights-toggle').getAttribute('aria-pressed') === 'true';
      element<HTMLInputElement>('seed').value = seed;
      this.worldSettings.write(options);
      const elevation = absoluteElevation(options) ? ` · ${options.elevationMode === 'fixed' ? '固定往返' : '随机升降'} ${options.altitudeMin}–${options.altitudeMax} 米`
        : options.elevationMode === 'cycles' ? ` · 目标爬升 ${options.climbMin}–${options.climbMax} 米` : '';
      element('settings-status').textContent = `当前：${terrainNames[options.terrain]} · ${routeNames[options.routeStyle]} · 最大坡度 ${Math.round(options.maxGrade * 100)}% · ${roadNames[options.roadType]} · ${roadLayout(options)} · 单幅 ${options.roadWidth} 米${options.roadType === 'highway' ? ` · 最小半径 ${options.highwayRadius} 米` : ''}${elevation} · ${options.roadType === 'highway' ? `立交${options.interchanges ? '开启' : '关闭'}` : `岔路${options.junctions ? '开启' : '关闭'}`}`
        + `${options.mountainHeight === 'range' ? ` · 山脉 ${options.mountainMin}–${options.mountainMax} 米` : ''} · 山脉密集度 ${Math.round(options.mountainDensity * 100)}% · 植被 ${Math.round(options.vegetationDensity * 100)}%`;
      this.setError(null);
      this.resetCamera();
      return true;
    } catch (error) {
      this.setError(`无法加载世界，请重试。${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.hudTime = 0.15;
    this.input.clear();
    if (paused) this.audio.setActive(false);
    element('pause').setAttribute('aria-pressed', String(paused));
    element('pause').textContent = paused ? '继续探索' : '暂停探索';
  }

  private tuneRadio(channel: number): void {
    this.audio.tune(channel);
    if (!this.audio.enabled) this.audio.toggle();
    this.driving.systems.radioChannel = this.audio.station;
    element<HTMLSelectElement>('radio-station').value = String(this.audio.station);
    element<HTMLSelectElement>('music-style').value = this.audio.musicStyle;
    element<HTMLInputElement>('music-pace').value = String(Math.round(this.audio.musicPace * 100));
    element('music-pace-value').textContent = `${Math.round(this.audio.musicPace * 100)}%`;
    this.syncAudioUI();
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
    const preset = graphicsPresets[element<HTMLSelectElement>('graphics-preset').value as keyof typeof graphicsPresets];
    if (preset && preset.clouds !== enabled) this.customGraphics();
    this.clouds.enabled = enabled;
    element('cloud-toggle').setAttribute('aria-pressed', String(enabled));
    element('cloud-help').textContent = enabled ? '前往穿云起点，按住 Space 上升，Shift 下降。' : '云层已关闭 · 保留远景雾与所选天气。';
  }

  private resetCamera(): void {
    this.stopTravel();
    this.world.resetCamera(this.camera);
    for (const id of ['drive-toggle', 'walk-toggle', 'road-view', 'hairpin-view', 'bridge-view', 'junction-view', 'crossing-view',
      'tunnel-view', 'lights-view', 'service-view', 'pass-view']) element<HTMLButtonElement>(id).disabled = true;
    this.flight.reset();
    this.setPaused(false);
    this.setClouds(this.clouds.enabled);
    this.canvas.focus();
  }

  private stopDriving(): void {
    this.cancelAccess();
    if (!this.driving.active) { this.driving.stop(); return; }
    this.driving.stop();
    this.flight.reset(-this.camera.rotation.y, this.camera.rotation.x);
  }

  private stopWalking(): void {
    this.cancelAccess();
    if (!this.walking.active) return;
    this.walking.stop();
    this.flight.reset(-this.camera.rotation.y, this.camera.rotation.x);
  }

  private stopTravel(): void { this.cabinDialogs.close(); this.stopDriving(); this.stopWalking(); }

  private access?: { car: DrivingSystem['car']; sequence: VehicleAccess };

  private cancelAccess(): void { this.access?.sequence.cancel(); this.access = undefined; }

  private interactVehicle(): void {
    if (this.access && !this.access.sequence.closing) return;
    this.cancelAccess();
    if (this.driving.active) {
      if (!this.driving.exitLocation()) return;
      this.driving.car.park(); this.driving.autopilot.cancel();
      this.access = { car: this.driving.car, sequence: new VehicleAccess(this.driving.operations, false) };
    } else if (this.walking.active) {
      const entry = this.driving.nearbyVehicle(this.walking.person);
      if (entry ? this.driving.prepareBoarding(entry) : this.driving.canBoard(this.walking.person))
        this.access = { car: this.driving.car, sequence: new VehicleAccess(this.driving.operations, true) };
    }
    if (this.access) this.input.clear();
  }

  private setError(message: string | null): void {
    const panel = element('error');
    panel.hidden = message === null;
    element('error-message').textContent = message ?? '';
    this.input.enabled = message === null;
    this.input.clear();
    this.canvas.inert = element('explorer').inert = message !== null;
    if (message) { this.settings.close(); this.cabinDialogs.close(); }
    element<HTMLButtonElement>('controls-toggle').disabled = message !== null;
    element<HTMLButtonElement>('drive-toggle').disabled = message !== null || (!this.driving.active && !this.world.roadReady);
    element<HTMLButtonElement>('walk-toggle').disabled = message !== null || (!this.walking.active && !this.world.roadReady);
    if (message !== null) {
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      if (!this.releaseNotes.open) panel.focus();
    }
  }

  private readonly resize = (): void => {
    if (this.contextLost) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    const gl = this.renderer.getContext(), viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const limit = Math.min(this.renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, ...viewport);
    const ratio = renderPixelRatio(window.innerWidth, window.innerHeight, window.devicePixelRatio, this.renderScale, limit);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.clouds.resize(this.canvas.width, this.canvas.height);
    element('graphics-status').textContent = `3D 画面 ${this.canvas.width} × ${this.canvas.height} · ${Math.round(this.renderScale * 100)}%`
      + (ratio + 0.001 < Math.min(window.devicePixelRatio, 1.5) * this.renderScale ? ' · 已按显卡尺寸上限缩减' : '');
  };

  private customGraphics(): void { element<HTMLSelectElement>('graphics-preset').value = 'custom'; }

  private syncAudioUI(): void {
    if (this.audioPreviewPending && !this.audio.previewing) {
      this.audioPreviewPending = false;
      element('audio-preview-status').textContent = '试听已结束 · 可调整混音参数后再次试听。';
    }
    element('audio-toggle').setAttribute('aria-pressed', String(this.audio.enabled));
    element('audio-toggle').textContent = this.audio.error ? '音频不可用' : this.audio.enabled ? '静音' : '开启声音';
    element<HTMLButtonElement>('audio-toggle').disabled = !!this.audio.error;
    element('audio-status').textContent = this.audio.error || (!this.audio.enabled ? '声音未开启' : this.audio.masterVolume <= 0 ? '总音量为零'
      : this.audio.sfxVolume <= 0 && this.audio.musicVolume <= 0 ? '音效与音乐均已静音' : this.audio.state === 'running' ? '声音已开启' : '声音已暂停');
  }

  private applyGraphics(): void {
    this.renderScale = Number(element<HTMLSelectElement>('render-scale').value);
    this.world.chunks.vegetation.setDetailLevel(Number(element<HTMLSelectElement>('map-detail').value));
    const size = Number(element<HTMLSelectElement>('shadow-quality').value);
    this.sky.light.castShadow = size > 0;
    this.renderer.shadowMap.enabled = size > 0;
    if (size && this.sky.light.shadow.mapSize.x !== size) {
      this.sky.light.shadow.map?.dispose(); this.sky.light.shadow.map = null;
      this.sky.light.shadow.mapSize.set(size, size);
    }
    element('shadows').setAttribute('aria-pressed', String(size > 0));
    const antialias = Number(element<HTMLSelectElement>('antialiasing').value), samples = antialias > 1 ? Math.min(antialias, this.renderer.capabilities.maxSamples) : 0;
    this.clouds.material.uniforms.antialias.value = antialias > 0;
    this.clouds.material.uniforms.cloudSteps.value = Number(element<HTMLSelectElement>('cloud-quality').value);
    if (this.clouds.target.samples !== samples) { this.clouds.target.dispose(); this.clouds.target.samples = samples; }
    this.viewRadius = Number(element<HTMLSelectElement>('view-distance').value);
    this.world.chunks.setViewRadius(this.viewRadius);
    this.camera.far = Math.max(7000, this.viewRadius * CHUNK_SIZE * 2);
    this.resize();
  }

  private update(dt: number): void {
    if (this.world.chunks.error && element('error').hidden) this.setError(`地形生成失败，请重试当前世界。${this.world.chunks.error}`);
    const silent = this.paused || this.releaseNotes.open || this.cabinDialogs.open || !this.input.enabled;
    const frozen = silent || this.settings.open;
    if (this.access) {
      const { car, sequence } = this.access, walking = sequence.entering !== sequence.closing;
      if (car !== this.driving.car || sequence.operations !== this.driving.operations
        || (walking ? !this.walking.active || !this.driving.parked : !this.driving.active)) this.cancelAccess();
    }
    if (this.driving.active) this.driving.update(dt, frozen, this.weather.wetness);
    else if (this.walking.active) this.walking.update(dt, frozen || !!this.access && !this.access.sequence.closing);
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
    this.weather.update(frozen ? 0 : dt, this.camera, this.world.shelter, this.world.origin);
    this.audio.setActive(!silent && !document.hidden && this.windowFocused && document.hasFocus());
    this.driving.systems.radioPlaying = this.audio.musicPlaying;
    this.driving.sync(Math.max(this.sky.sun.night, this.world.shelter * 0.8, this.weather.profile.rain * 0.35,
      Math.max(0, 1 - this.weather.profile.far / 800) * 0.6), this.weather.liquidRain,
      frozen || this.access && (!document.hasFocus() || document.activeElement !== this.canvas || !this.world.roadReady) ? 0 : dt);
    this.walking.sync();
    if (this.access && !frozen && this.world.roadReady && !this.world.searching && document.hasFocus() && document.activeElement === this.canvas) {
      const sequence = this.access.sequence, step = sequence.step();
      if (step === 'complete') this.access = undefined;
      else if (step === 'transfer') {
        if (sequence.entering) {
          const { x, y, z, heading } = this.walking.person;
          this.walking.stop();
          if (this.driving.start(true)) sequence.close();
          else { this.walking.start({ x, y, z, heading }); this.cancelAccess(); }
        } else {
          const point = this.driving.exitLocation();
          if (point) {
            this.driving.stop(true);
            if (this.walking.start(point)) sequence.close();
            else { this.driving.start(true); this.cancelAccess(); }
          } else this.cancelAccess();
        }
      }
    }
    const focused = document.activeElement === this.canvas && document.hasFocus(), moving = focused && this.world.roadReady && !frozen;
    const anchor = this.driving.active ? this.driving.car : this.walking.active ? this.walking.person
      : { x: this.camera.position.x + this.world.origin.x, y: this.camera.position.y, z: this.camera.position.z + this.world.origin.z };
    const obstacles = this.world.traffic.density ? this.world.parkedVehicles.fleet.entries.filter(e => Math.hypot(e.x - anchor.x, e.z - anchor.z) < 1500)
      .map(e => this.world.parkedVehicles.fleet.vehicle(e)) : [];
    if (this.driving.active || this.driving.parked) obstacles.push(this.driving.car);
    this.world.traffic.update(moving ? dt : 0, this.world.network.routes, anchor, obstacles, this.walking.active ? this.walking.person : undefined);
    this.world.trafficVehicles.update(this.world.origin, Math.max(this.sky.sun.night, this.world.shelter));
    this.audio.update(dt, { driving: this.driving.active && moving, speed: this.driving.active && moving ? this.driving.car.speed : 0,
      throttle: this.driving.appliedThrottle > 0 && moving && this.driving.cabin.driver && this.driving.crane.stowed && this.driving.operations.driveReady,
      mass: this.driving.car.profile.mass, motorcycle: this.driving.car.kind === 'motorcycle',
      rain: this.weather.liquidRain, shelter: this.world.shelter, cockpit: this.driving.active && this.driving.cameraRig.view === 'cockpit',
      signal: this.driving.active && (this.driving.systems.leftSignal || this.driving.systems.rightSignal), wiper: this.driving.active ? this.driving.systems.sweep : 0,
      rpm: this.driving.car.engineRpm, shifts: this.driving.car.transmission.shifts, ignition: this.driving.car.ignition,
      traffic: moving ? this.world.traffic.entries.reduce((level, e) => Math.min(1, level + Math.max(0, 1 - Math.hypot(e.car.x - anchor.x, e.car.y - anchor.y, e.car.z - anchor.z) / 70) ** 2 * (0.15 + e.car.speed / 30)), 0) : 0,
      exposure: this.driving.systems.cabinExposure, wet: this.weather.wetness, night: this.sky.sun.night,
      nature: !['desert', 'dunes', 'badlands', 'volcanic'].includes(this.world.options.terrain) && this.world.season.kind !== 'winter',
      horn: this.driving.active && moving && this.input.down('KeyV'), fan: this.driving.systems.hasWindows ? this.driving.systems.fan : 0,
      washer: this.driving.systems.washerSpray, motor: this.driving.systems.equipmentMotor || this.driving.operations.moving,
      supercar: this.driving.car.kind === 'supercar', braking: this.driving.car.braking, operations: this.driving.operations.events,
      tireSlip: this.driving.car.tireSlip,
      service: this.world.services.reduce((level, site) => Math.max(level, ...site.ground.pads.map(pad => Math.max(0, 1 - Math.hypot(pad.x - this.camera.position.x - this.world.origin.x, pad.y - this.camera.position.y, pad.z - this.camera.position.z - this.world.origin.z) / 160))), 0),
      walkingSpeed: this.walking.active && moving && this.walking.person.grounded ? this.walking.person.speed : 0 });
    this.sky.update(this.camera, this.world.origin, this.weather.profile.sunlight, this.world.shelter, this.world.season);
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
    this.hudTime += dt;
    if (this.hudTime >= 0.15) {
      const stats = chunks.stats;
      this.hudTime = 0;
      this.syncAudioUI();
      if (!this.driving.active) this.driving.describeEquipment();
      const nearby = this.walking.active ? this.driving.nearbyVehicle(this.walking.person) : undefined;
      const boardable = this.walking.active && (this.driving.canBoard(this.walking.person) || !!nearby);
      element('boarding-help').hidden = !boardable && !this.access;
      element('boarding-help').textContent = this.access ? this.access.sequence.closing ? '车门关闭中 · 请稍候'
        : `车门打开中 · 准备${this.access.sequence.entering ? '上' : '下'}车`
        : `${this.input.bindings.label('KeyF')} · ${nearby ? `开门驾驶${vehicleProfiles[nearby.kind].name}` : '开门回到车辆'}`;
      element('traffic-status').textContent = `附近 ${this.world.traffic.entries.length} 辆 · ${this.world.traffic.density ? '交通运行中' : '交通已关闭'}`;
      if (!this.driving.active) element('drive-toggle').textContent = boardable ? '回到车辆' : this.driving.parked ? '重新放置车辆' : '开始驾驶';
      const season = this.world.season, roadHeight = this.world.roadSample?.position.y ?? y;
      const snow = season.snow(roadHeight);
      const precipitation = this.weather.snowfall > 0.015 ? this.weather.liquidRain > 0.015 ? '雨夹雪' : '降雪' : this.weather.liquidRain > 0.015 ? '降雨' : '无降水';
      const condition = this.world.shelter > 0.9 ? '隧道遮蔽' : snow > 0.15 ? '积雪路面，减速慢行' : this.weather.wetness > 0.2 ? '路面湿滑' : '路面正常';
      element('season-status').textContent = `${seasonNames[season.kind]} · ${season.temperature(y).toFixed(1)} °C · ${precipitation} · ${condition}`;
      element('drive-condition').textContent = `${seasonNames[season.kind]} · ${season.temperature(roadHeight).toFixed(0)} °C · ${condition}`;
      element('drive-condition').dataset.snow = String(snow > 0.15 && this.world.shelter < 0.9);
      element('altitude').textContent = Math.round(y).toLocaleString();
      element('position').textContent = `${Math.round(x)} / ${Math.round(z)}`;
      element('notice').textContent = !this.input.enabled ? '探索已中止 · 请重试当前世界' : this.paused ? '已暂停 · 按 F8 继续' : !this.world.roadReady ? '路线生成中 · 请稍候'
        : stats.queued > 0 ? `山地生成中 · ${stats.active} / ${stats.target} 分块`
        : this.input.pointerLockFailed ? '鼠标锁定不可用 · 请拖动观察' : '拖动视角 · 双击锁定鼠标 · Esc 释放';
      element('notice').textContent = this.input.bindings.format(element('notice').textContent!);
      element<HTMLButtonElement>('road-view').disabled = !this.world.roadReady || !this.world.roadSample;
      element<HTMLButtonElement>('hairpin-view').disabled = !this.world.roadReady || !this.world.road.segments.some((segment) => segment.kind === 'hairpin');
      element<HTMLButtonElement>('bridge-view').disabled = !this.world.roadReady || !this.world.bridges.length;
      element<HTMLButtonElement>('crossing-view').disabled = !this.world.roadReady || !this.world.crossings.length;
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
      const junctions = this.world.options.roadType === 'highway' ? this.world.options.interchanges : this.world.options.junctions;
      const junctionSearch = this.world.junctionSearchProgress;
      element<HTMLButtonElement>('junction-view').disabled = !this.world.roadReady || this.world.searching || !junctions;
      element('junction-view').textContent = junctionSearch === null ? '下一匝道' : `定位中 · ${Math.round(junctionSearch * 100)}%`;
      element('junction-status').textContent = junction ? `${junction.kind === 'stack' ? '多向立交 · 左转 / 右转 / 回转' : '平面分流'} · ${Math.max(0, Math.round(((junction.ramps.find(r => r.sample.distance > (this.world.roadSample?.distance ?? 0) - 30)?.sample.distance ?? junction.distance) - (this.world.roadSample?.distance ?? 0)) / 10) * 10)} m`
        : junctions ? '每 20 km 一组 · 按方向标牌分流' : '出口关闭 · 主线双向延伸';
      element('structure-help').textContent = !this.world.roadReady ? '路线生成中，结构视角稍后开放。'
        : `${this.world.tunnels.length ? '隧道入口：沿道路按 W 前进穿行。' : '当前路段没有隧道，可继续沿道路探索。'}路灯分段出现，入夜点亮。`;
      element<HTMLButtonElement>('cloud-view').disabled = !this.world.roadReady;
      element('cloud-region').textContent = this.clouds.enabled ? cloudNames[this.clouds.sample.region] : '云层关闭';
    }
    this.debug.update(() => {
      const stats = chunks.stats;
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
        'Render scale': `${Math.round(this.renderScale * 100)}%`, 'Frame limit': element<HTMLSelectElement>('frame-limit').value,
        'Map detail': element<HTMLSelectElement>('map-detail').value,
        'Scene samples': this.clouds.target.samples,
        'FXAA': this.clouds.material.uniforms.antialias.value ? 'on' : 'off', 'Cloud steps': this.clouds.material.uniforms.cloudSteps.value,
        'Valley crossings': this.world.crossings.map(site => site.kind).join(', ') || 'none',
        'Audio state': this.audio.state,
        'Engine RPM': String(Math.round(this.driving.car.engineRpm)),
        'Ignition': this.driving.car.ignition,
        'NPC vehicles': this.world.traffic.entries.length,
        'NPC density': `${this.world.traffic.density}%`,
        'NPC motion': this.world.traffic.entries.map(e => `${e.id}:${e.distance.toFixed(1)}`).join(', '),
        'Transmission': `${this.driving.car.transmission.mode} / ${this.driving.car.transmission.gear}`,
        'Window opening': this.driving.systems.windowOpen.toFixed(2),
        'Roof opening': this.driving.systems.roofOpen.toFixed(2),
        'Washer fluid': this.driving.systems.washerFluid.toFixed(2),
        'Cabin exposure': this.driving.systems.cabinExposure.toFixed(2),
        'Cabin seat': this.driving.cabin.selected.id,
        'Cabin floor': this.driving.cabin.selected.floor,
        'Vehicle operations': `${this.driving.operations.doors.toFixed(2)} / ${this.driving.operations.cargo.toFixed(2)} / ${this.driving.operations.aux.toFixed(2)}`,
        'Vehicle speed limit': `${(this.driving.car.maxSpeed * 3.6).toFixed(1)} km/h`,
        'Steering assist': this.driving.car.steeringAssist ? `${Math.round(this.driving.car.steeringAssistStrength * 100)}%` : 'off',
        'Drift angle': (this.driving.car.slipAngle * 180 / Math.PI).toFixed(1),
        'Lateral speed': this.driving.car.lateralSpeed.toFixed(2),
        'Tire slip': this.driving.car.tireSlip.toFixed(2),
        'Handbrake pressure': this.driving.car.handbrake.toFixed(2),
        'Road grip': `${Math.round(this.driving.car.gripScale * 100)}%`,
        'Cabin fan': String(this.driving.systems.fan),
        'Radio channel': String(this.audio.station),
        'Cabin lighting': `${this.driving.systems.ambientLight ? 'ambient' : 'off'} / ${this.driving.systems.cabinLight ? 'reading' : 'off'}`,
        'Seat adjustment': JSON.stringify(this.driving.cabin.adjustment),
        'Crane state': this.driving.crane.stowed ? 'stowed' : this.driving.crane.enabled ? 'active' : 'stowing',
        'Crane boom': `${this.driving.crane.yaw.toFixed(2)} / ${this.driving.crane.angle.toFixed(2)} / ${this.driving.crane.extension.toFixed(2)}`,
        'Light phase': this.sky.sun.label, 'Sun elevation': `${this.sky.sun.elevation.toFixed(1)}°`,
        Weather: weatherNames[this.weather.kind], 'World time': this.sky.sun.clock,
        Season: seasonNames[this.world.season.kind], 'Air temperature': `${this.world.season.temperature(y).toFixed(1)} °C`,
        'Seasonal snow': `${Math.round(this.world.season.snow(this.world.roadSample?.position.y ?? y) * 100)}%`,
        'Snow visible': this.weather.snow.visible ? 'yes' : 'no', 'Liquid rain': this.weather.liquidRain.toFixed(2),
        'Rain visible': this.weather.rain.visible ? 'yes' : 'no',
        'Road wetness': `${Math.round(this.weather.wetness * 100)}%`,
        Tunnels: this.world.tunnels.length, 'Tunnel shelter': `${Math.round(this.world.shelter * 100)}%`,
        'Service areas': this.world.services.length,
        'Arch bays': this.world.bridgeMesh.archBridges.bayCount, 'Arch ribs': this.world.bridgeMesh.archBridges.ribs.count,
        'Cable spans': this.world.bridgeMesh.cableBridges.spanCount, 'Bridgeheads': this.world.bridgeMesh.abutments.endCount,
        'Climb range': absoluteElevation(this.world.options) ? `${this.world.options.elevationMode} ${this.world.options.altitudeMin}–${this.world.options.altitudeMax} m`
          : this.world.options.elevationMode === 'cycles' ? `${this.world.options.climbMin}–${this.world.options.climbMax} m` : 'natural',
        'Mountain range': this.world.options.mountainHeight === 'range' ? `${this.world.options.mountainMin}–${this.world.options.mountainMax} m` : 'natural',
        'Mountain density': `${Math.round(this.world.options.mountainDensity * 100)}%`,
        'Vegetation density': `${Math.round(this.world.options.vegetationDensity * 100)}%`,
        'Elevated services': this.world.services.filter(site => site.ground.elevated).length,
        'Service mileage': this.world.services.map(site => `${(site.sample.distance / 1000).toFixed(2)} km`).join(', ') || '—',
        'Street lamps': this.world.furniture.lampPositions.length,
        'Active route': this.world.network.active.id, 'Loaded routes': this.world.network.routes.length,
        Junctions: this.world.network.junctions.length,
        'Local lights': this.world.furniture.localLights.filter(light => light.intensity > 0).length,
        'Terrain shadows': this.sky.light.castShadow ? 'on' : 'off',
        Landscape: terrainNames[this.world.options.terrain],
        'Road layout': roadLayout(this.world.options),
        'Highway minimum radius': `${this.world.options.highwayRadius} m`,
        'Carriageway width': `${this.world.options.roadWidth} m`,
        'Route style': routeNames[this.world.options.routeStyle], 'Maximum grade': `${Math.round(this.world.options.maxGrade * 100)}%`, 'Route checkpoints': this.world.road.checkpointCount,
        'Roadside grass': chunks.vegetation.meadowCount, 'Wildflowers': chunks.vegetation.flowerCount,
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
        'Glass water': `${Math.round(this.driving.glassWater * 100)}%`, 'Wiped water': `${Math.round(this.driving.sweptWater * 100)}%`,
        'Parked vehicle': this.driving.parked ? 'yes' : 'no',
        'Service vehicles': this.world.parkedVehicles.fleet.entries.length,
        'Parking batches': this.world.parkedVehicles.drawBatches,
        'Driving camera': this.driving.cameraRig.view,
        'Camera FOV': `${this.camera.fov}°`, 'Camera height': `${Math.round(this.driving.cameraRig.height * 100)} cm`,
        'Cloud region': this.clouds.enabled ? cloudNames[this.clouds.sample.region] : '关闭',
        'Cloud base / top': `${this.clouds.sample.base.toFixed(0)} / ${this.clouds.sample.top.toFixed(0)} m`,
        'Cloud density': `${((this.clouds.enabled ? this.clouds.sample.density : 0) * 100).toFixed(0)}%`,
        'Fog near / far': `${this.clouds.fog.near.toFixed(0)} / ${this.clouds.fog.far.toFixed(0)} m`,
        'Ground biome': ground ? biomeNames[ground.biome.kind] : '—',
        'Ground altitude': ground ? `${ground.height.toFixed(0)} m` : '—',
        'Ground slope': ground ? `${(Math.acos(ground.normalY) * 180 / Math.PI).toFixed(1)}°` : '—',
        'Snow cover': ground ? `${(Math.max(ground.biome.weights.snow, this.world.season.snow(ground.height)) * 100).toFixed(0)}%` : '—',
        'Snow line': ground ? `${ground.biome.snowLine.toFixed(0)} m` : '—',
        Temperature: ground ? `${this.world.season.temperature(ground.height).toFixed(1)} °C` : '—',
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
    this.keyBindingPanel.dispose();
    this.presets.dispose(); this.worldSettings.dispose();
    this.cabinDialogs.dispose();
    this.settings.dispose();
    this.audio.dispose();
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
