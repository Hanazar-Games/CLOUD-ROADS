import { ACESFilmicToneMapping, PCFShadowMap, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { CLOUD_BASE } from '../atmosphere/CloudField';
import { CloudSystem } from '../atmosphere/CloudSystem';
import { SkySystem } from '../atmosphere/SkySystem';
import { WeatherSystem, weatherNames, type WeatherKind } from '../atmosphere/WeatherSystem';
import { FreeCamera } from '../camera/FreeCamera';
import { DebugUI, element } from '../debug/DebugUI';
import { runtimeLog } from '../debug/RuntimeLog';
import { InputManager } from '../input/InputManager';
import { GameLoop } from './GameLoop';
import { World } from '../world/World';
import { randomSeed, startingSeed } from '../world/WorldSeed';
import { CHUNK_SIZE, VIEW_RADIUS } from '../world/ChunkPlanner';
import { absoluteElevation, roadNames, routeNames, terrainNames, type WorldOptions } from '../world/WorldOptions';
import { roadLayout } from '../road/RoadProfile';
import { DrivingSystem } from '../vehicle/DrivingSystem';
import { VehicleAccess } from '../vehicle/VehicleAccess';
import { vehicleProfiles } from '../vehicle/VehicleConfig';
import { WalkingSystem } from '../walking/WalkingSystem';
import { graphicsControls, graphicsLabel, graphicsPosition, graphicsPresets, graphicsValue, renderPixelRatio } from './GraphicsSettings';
import { AudioSystem, audioChannels, type MusicStyle } from '../audio/AudioSystem';
import { engineSound } from '../audio/VehicleEngine';
import { SettingsDialog } from '../ui/SettingsDialog';
import { CabinDialogs } from '../ui/CabinDialogs';
import { RoadbookPanel } from '../ui/RoadbookPanel';
import { radioStations } from '../audio/RadioStations';
import { seasonNames, type Season } from '../season/SeasonState';
import { WorldSettings } from '../settings/WorldSettings';
import { PresetPanel } from '../settings/PresetPanel';
import { KeyBindingPanel } from '../settings/KeyBindingPanel';
import { GaragePanel } from '../garage/GaragePanel';
import { trafficScenarios, trafficTuning, type TrafficTuning } from '../traffic/TrafficSystem';
import { InteriorVolume } from '../render/InteriorVolume';
import type { CabinLayout } from '../vehicle/CabinLayout';
import { ShortcutDock } from '../ui/ShortcutDock';
import { TrafficControlPanel } from '../settings/TrafficControlPanel';
import { crossroadsEnabled } from '../road/JunctionSchedule';

const biomeNames = { valley: '山谷', forest: '森林', rock: '岩石', alpine: '高山', snow: '雪区', desert: '沙漠' };
const cloudNames = { below: '云下', inside: '云中', above: '云上' };

export class Game {
  private readonly initialSeed = startingSeed(location.search);
  private readonly canvas = element<HTMLCanvasElement>('world');
  private readonly shortcutDock: ShortcutDock;
  private readonly renderer = new WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
  private readonly scene = new Scene();
  private readonly sky = new SkySystem(this.scene);
  private readonly interior = new InteriorVolume();
  private readonly weather = new WeatherSystem(new Scene(), this.interior);
  private readonly clouds = new CloudSystem(this.initialSeed, this.sky.sun, this.renderer.extensions.has('EXT_color_buffer_float'), this.interior);
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
  private readonly roadbook: RoadbookPanel;
  private readonly keyBindingPanel: KeyBindingPanel;
  private readonly garagePanel: GaragePanel;
  private readonly trafficControls: TrafficControlPanel;
  private paused = false;
  private wireframe = false;
  private hudTime = 0;
  private contextLost = false;
  private viewRadius = VIEW_RADIUS;
  private renderScale = 1;
  private graphicsTimer?: ReturnType<typeof setTimeout>;
  private graphicsPending = false;
  private graphicsResources = false;
  private readonly audio = new AudioSystem();
  private audioPreviewPending = false;
  private audioTestPending = false;
  private windowFocused = true;

  constructor() {
    this.scene.background = this.sky.sun.haze;
    this.world = new World(this.scene, this.initialSeed);
    this.trafficControls = new TrafficControlPanel(() => this.world);
    this.weather.setSeason(this.world.season);
    this.sky.sun.setTerrain(this.world.options.terrain);
    element<HTMLInputElement>('seed').value = this.initialSeed;
    this.driving = new DrivingSystem(this.scene, this.camera, this.input, () => this.world, () => this.walking?.active ? this.walking.person : undefined);
    this.walking = new WalkingSystem(this.camera, this.input, () => this.world, () => this.driving.parked ? this.driving.car : undefined);
    this.roadbook = new RoadbookPanel(() => {
      const w = this.world, car = this.driving.car, person = this.walking.person;
      const anchor = this.driving.active ? car : this.walking.active ? person
        : { x: this.camera.position.x + w.origin.x, y: this.camera.position.y, z: this.camera.position.z + w.origin.z };
      const current = w.roadReady ? w.road.nearest(anchor.x, anchor.z) : undefined;
      const nearby = current && Math.hypot(anchor.x - current.position.x, anchor.z - current.position.z) < w.options.roadWidth * 2 + 8
        && Math.abs(anchor.y - current.position.y) < 15;
      return { source: { samples: w.road.samples, bridges: w.bridges, tunnels: w.tunnels, services: w.services, passes: w.passes,
        junctions: w.network.junctions.filter(j => j.route === w.network.active.id) }, revision: w.network.version, current,
        heading: this.driving.active ? car.heading + (car.speed < -0.1 ? Math.PI : 0) : this.walking.active ? person.heading : -this.camera.rotation.y,
        context: `${terrainNames[w.options.terrain]} · ${w.season.extraterrestrial ? '低重力远行' : `${seasonNames[w.season.kind]} · ${weatherNames[this.weather.kind]}`}`,
        location: nearby ? '当前道路' : '附近主线路线（非匝道或车库内部）' };
    });
    this.cabinDialogs = new CabinDialogs(this.driving, () => this.input.clear(), () => this.setPaused(!this.paused), category => {
      this.settings.show();
      if (category) document.querySelector<HTMLButtonElement>(`[data-settings-target="${category}"]`)!.click();
    }, this.input.bindings, () => this.roadbook.update(true));
    this.keyBindingPanel = new KeyBindingPanel(this.input);
    this.shortcutDock = new ShortcutDock(this.input.bindings);
    this.garagePanel = new GaragePanel(() => this.world, point => {
      this.settings.close(); this.stopTravel(); this.walking.start(point); this.setPaused(false); this.canvas.focus();
    });
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
    this.audio.onDiagnostic = (level, message) => runtimeLog.write(level, 'audio', message);
    for (const type of ['click', 'keydown']) window.addEventListener(type, event => {
      if (!event.isTrusted || !this.audio.awaitingActivation) return;
      this.refreshAudioFocus(); this.audio.unlock(); this.syncAudioUI();
    }, { signal: this.events.signal });
    element('audio-toggle').addEventListener('click', () => { this.refreshAudioFocus(); this.audio.toggle(); this.syncAudioUI(); }, { signal: this.events.signal });
    element('audio-recover').addEventListener('click', () => {
      this.refreshAudioFocus(); this.audio.recover();
      for (const [name, field] of audioChannels.slice(0, 3)) {
        const input = element<HTMLInputElement>(`${name}-volume`); input.value = String(Math.round(this.audio[field] * 100));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      element('audio-test-status').textContent = '已请求重建音频。请查看声音状态，再点击声音测试。'; this.syncAudioUI();
    }, { signal: this.events.signal });
    element('audio-test').addEventListener('click', () => {
      this.refreshAudioFocus();
      this.audioTestPending = this.audio.testSound();
      element('audio-test-status').textContent = this.audioTestPending
        ? '正在发送左 → 中 → 右测试音；如未听到，请检查系统输出设备与浏览器站点静音。'
        : '测试未开始：请解除暂停、回到游戏窗口，调高总音量与测试音量；音频异常时点击强制开启声音。';
      this.syncAudioUI();
    }, { signal: this.events.signal });
    element('diagnostics-open').addEventListener('click', () => { this.settings.close(); this.debug.show(); }, { signal: this.events.signal });
    for (const [id, field, unit] of [
      ['audio-resume-fade', 'resumeFade', 'ms'], ['audio-test-volume', 'testVolume', '%'],
      ['music-recovery', 'musicRecovery', 'ms'], ['audio-limiter-release', 'limiterRelease', 'ms'],
    ] as const) element(id).addEventListener('input', () => {
      const value = Number(element<HTMLInputElement>(id).value); this.audio[field] = value / (unit === '%' ? 100 : 1000);
      element(`${id}-value`).textContent = `${value} ${unit}`;
    }, { signal: this.events.signal });
    const audioGroups = [
      ['mix', '整体音量', ['master', 'sfx', 'music']],
      ['horns', '喇叭与附近车辆', ['horn', 'npc-horn', 'nearby-engine']],
      ['powertrain', '动力与路面', ['engine', 'exhaust', 'shift', 'turbo', 'tire', 'collision']],
      ['environment', '环境与设备', ['nature', 'weather', 'cabin', 'effects']],
      ['music', '音乐层次', ['music-bass', 'music-melody']],
    ] as const;
    for (const [id, title] of audioGroups) {
      const group = document.createElement('fieldset'); group.id = `audio-group-${id}`; group.className = 'audio-group';
      const legend = document.createElement('legend'); legend.textContent = title; group.append(legend); element('audio-channels').append(group);
    }
    for (const [name, field, label] of audioChannels) {
      const id = `${name}-volume`, row = document.createElement('div'), initial = Math.round(this.audio[field] * 100);
      row.innerHTML = `<label class="speed-label" for="${id}">${label}<output id="${id}-value">${initial}%</output></label><input id="${id}" type="range" min="0" max="${['master', 'sfx', 'music'].includes(name) ? 100 : ['horn', 'npc-horn'].includes(name) ? 300 : 150}" step="5" value="${initial}" />`;
      const group = audioGroups.find(([, , names]) => (names as readonly string[]).includes(name))!;
      element(`audio-group-${group[0]}`).append(row);
      element(id).addEventListener('input', () => {
      const value = Number(element<HTMLInputElement>(id).value);
      this.audio[field] = value / 100; element(`${id}-value`).textContent = `${value}%`;
      }, { signal: this.events.signal });
    }
    for (const [id, field] of [['horn-focus', 'hornFocus'], ['cabin-isolation', 'cabinIsolation']] as const) element(id).addEventListener('input', () => {
      const value = Number(element<HTMLInputElement>(id).value); this.audio[field] = value / 100;
      element(`${id}-value`).textContent = `${value}%`;
    }, { signal: this.events.signal });
    element('audio-mix-reset').addEventListener('click', () => {
      for (const id of [...audioChannels.map(([name]) => `${name}-volume`), 'horn-focus', 'cabin-isolation', 'music-ducking', 'music-pace',
        'audio-resume-fade', 'audio-test-volume', 'music-recovery', 'audio-limiter-release']) {
        const input = element<HTMLInputElement>(id); input.value = input.defaultValue; input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      element('audio-preview-status').textContent = '已恢复默认混音，可试听或继续旅程。';
    }, { signal: this.events.signal });
    element('music-style').addEventListener('change', () => { this.audio.setStyle(element<HTMLSelectElement>('music-style').value as MusicStyle); }, { signal: this.events.signal });
    element('music-ducking').addEventListener('input', () => {
      this.audio.musicDucking = Number(element<HTMLInputElement>('music-ducking').value) / 100;
      element('music-ducking-value').textContent = `${Math.round(this.audio.musicDucking * 100)}%`;
    }, { signal: this.events.signal });
    const radio = element<HTMLSelectElement>('radio-station');
    radio.replaceChildren(...radioStations.map((station, i) => new Option(`${i + 1} · ${station.name}`, String(i + 1))));
    radio.addEventListener('change', () => this.tuneRadio(Number(radio.value), !this.presets.applying), { signal: this.events.signal });
    element('music-pace').addEventListener('input', () => {
      const value = Number(element<HTMLInputElement>('music-pace').value); this.audio.musicPace = value / 100;
      element('music-pace-value').textContent = `${value}%`;
    }, { signal: this.events.signal });
    for (const kind of ['engine', 'shift', 'horn'] as const) element(`preview-${kind}`).addEventListener('click', () => {
      this.refreshAudioFocus();
      this.audioPreviewPending = this.audio.preview(kind);
      element('audio-preview-status').textContent = this.audioPreviewPending ? '正在试听 · 使用当前混音参数'
        : this.audio.error || (this.paused ? '游戏已暂停 · 解除暂停后恢复声音'
          : this.audio.awaitingActivation ? '声音设置已保留 · 点击页面或按键后开启声音'
            : `请调高总音量、全部音效及「${kind === 'horn' ? '本车喇叭' : kind === 'shift' ? '发动机与换挡机械声' : '发动机'}」音量。`);
      this.syncAudioUI();
    }, { signal: this.events.signal });
    window.addEventListener('blur', () => { this.windowFocused = false; this.audio.setActive(false); }, { signal: this.events.signal });
    window.addEventListener('focus', () => { this.windowFocused = true; }, { signal: this.events.signal });
    this.input.onAction = (code) => {
      if (code === 'Debug') this.debug.toggle();
      if (code === 'Pause' || code === 'PauseToggle') this.setPaused(!this.paused);
      if (code === 'KeyM') this.cabinDialogs.showMenu();
      if (code === 'KeyP') this.cabinDialogs.showSeats();
      if (code === 'Panel') this.cabinDialogs.showVehicle();
      if (code === 'Roadbook') this.cabinDialogs.showRoadbook();
      if (code === 'Settings') this.settings.show();
      if (!this.paused && !this.releaseNotes.open && !this.settings.open && !this.cabinDialogs.open) {
        if (/^Digit\d$/.test(code) && this.driving.active) this.tuneRadio(Number(code.slice(5)) || 10);
        if (code === 'Audio') element<HTMLButtonElement>('audio-toggle').click();
        if (code === 'KeyF') this.interactVehicle();
        else if (code === 'CabinWalk' && this.walking.active) this.enterCargo();
        else if (!this.access || this.access.sequence.closing) { this.driving.action(code); this.walking.action(code); }
      }
    };
    for (const id of ['seat-walk', 'panel-walk']) element(id).addEventListener('click', () => {
      this.cabinDialogs.close(); this.driving.toggleCabinWalk(); this.canvas.focus();
    }, { signal: this.events.signal });
    element('panel-exit').addEventListener('click', () => {
      this.cabinDialogs.close(); this.interactVehicle(); this.canvas.focus();
    }, { signal: this.events.signal });
    element('traffic-density').addEventListener('input', () => {
      const density = Number(element<HTMLInputElement>('traffic-density').value);
      this.world.traffic.density = density; element('traffic-density-value').textContent = `${density}%`;
    }, { signal: this.events.signal });
    element('traffic-limit').addEventListener('input', () => {
      this.world.traffic.limit = Number(element<HTMLInputElement>('traffic-limit').value);
      element('traffic-limit-value').textContent = `${this.world.traffic.limit} 辆`;
    }, { signal: this.events.signal });
    element('traffic-scenario').addEventListener('change', () => {
      this.world.traffic.scenario = element<HTMLSelectElement>('traffic-scenario').value as keyof typeof trafficScenarios;
    }, { signal: this.events.signal });
    for (const key of Object.keys(trafficTuning) as (keyof TrafficTuning)[]) element(`traffic-${key}`).addEventListener('input', () => {
      this.world.traffic.configure({ [key]: Number(element<HTMLInputElement>(`traffic-${key}`).value) });
      for (const name of Object.keys(trafficTuning) as (keyof TrafficTuning)[]) {
        const value = String(this.world.traffic.tuning[name]);
        element<HTMLInputElement>(`traffic-${name}`).value = value; element(`traffic-${name}-value`).textContent = value;
      }
    }, { signal: this.events.signal });
    element('traffic-behavior-reset').addEventListener('click', () => {
      for (const [key, [value]] of Object.entries(trafficTuning)) {
        const input = element<HTMLInputElement>(`traffic-${key}`); input.value = String(value); input.dispatchEvent(new Event('input'));
      }
    }, { signal: this.events.signal });
    element('drive-toggle').addEventListener('click', () => {
      if (this.driving.active) this.stopDriving();
      else if (this.walking.active && (this.driving.canBoard(this.walking.person, true) || this.driving.nearbyVehicle(this.walking.person))) this.interactVehicle();
      else { this.stopWalking(); this.driving.start(); }
      this.setPaused(false); this.canvas.focus();
    }, { signal: this.events.signal });
    element('walk-toggle').addEventListener('click', () => {
      if (this.walking.active) this.stopWalking();
      else if (this.driving.active) this.interactVehicle();
      else this.walking.start();
      this.setPaused(false); this.canvas.focus();
    }, { signal: this.events.signal });
    for (const id of ['sun-view', 'road-view', 'hairpin-view', 'bridge-view', 'junction-view', 'crossing-view', 'tunnel-view', 'lights-view', 'service-view', 'pass-view', 'landmark-view', 'cloud-view']) {
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
    element('weather-kind').addEventListener('change', () => {
      const kind = element('weather-kind').querySelector<HTMLInputElement>('input:checked')!.value as WeatherKind;
      if (Object.hasOwn(weatherNames, kind)) this.weather.setKind(kind, this.paused || this.settings.open || this.releaseNotes.open || !this.input.enabled);
      this.driving.systems.updateFog(this.weather.fogLightsNeeded);
    }, { signal: this.events.signal });
    element('fog-density').addEventListener('input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      this.weather.setFogDensity(value / 100, this.paused || this.settings.open || this.releaseNotes.open || !this.input.enabled);
      this.driving.systems.updateFog(this.weather.fogLightsNeeded);
      element('fog-density-value').textContent = `${value}%`;
    }, { signal: this.events.signal });
    element('fog-visibility').addEventListener('input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      this.weather.setVisibility(value, this.paused || this.settings.open || this.releaseNotes.open || !this.input.enabled);
      element('fog-visibility-value').textContent = `${value} m`;
    }, { signal: this.events.signal });
    element('sun-view').addEventListener('click', () => {
      const direction = this.sky.sun.direction;
      this.flight.reset(this.sky.sun.night > 0.5 ? Math.atan2(0.45, 0.7) : Math.atan2(direction.x, -direction.z),
        this.sky.sun.night > 0.5 ? Math.asin(0.55 / Math.hypot(0.45, 0.55, 0.7)) : Math.asin(direction.y));
      this.setPaused(false);
      this.canvas.focus();
    }, { signal: this.events.signal });
    element('shadows').addEventListener('click', () => {
      element<HTMLInputElement>('shadow-quality').value = this.sky.light.castShadow ? '0' : '2';
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
    element('graphics-preset').addEventListener('change', () => {
      const preset = graphicsPresets[element<HTMLSelectElement>('graphics-preset').value as keyof typeof graphicsPresets];
      if (!preset) return;
      for (const [id, value] of [['render-scale', preset.scale], ['shadow-quality', preset.shadows], ['antialiasing', preset.samples], ['view-distance', preset.radius], ['map-detail', preset.detail], ['cloud-quality', preset.cloudSteps], ['vegetation-lod', preset.lod], ['distant-trees', preset.trees], ['vegetation-shadows', preset.plantShadows], ['vegetation-budget', preset.budget], ['vehicle-detail-distance', preset.vehicles],
        ['tree-density', preset.foliage], ['ground-density', preset.ground], ['flower-density', preset.flowers], ['rock-density', preset.rocks], ['detail-distance', preset.details],
        ['road-texture', preset.detail ? 1 : 0], ['road-relief', preset.detail], ['road-filtering', preset.detail ? 8 : 2],
        ['model-load-budget', preset.detail === 2 ? 3 : 2], ['model-preload-distance', preset.vehicles ? 180 : 0],
        ['terrain-upload-budget', 2], ['terrain-upload-limit', 2], ['terrain-preload', 1],
        ['parked-detail-limit', preset.detail === 2 ? 20 : preset.detail ? 12 : preset.vehicles ? 6 : 0], ['garage-cache', preset.detail === 2 ? 5 : 4]] as const)
        element<HTMLInputElement>(id).value = String(graphicsPosition(id, value));
      this.setClouds(preset.clouds); this.applyGraphics();
    }, { signal: this.events.signal });
    for (const id of graphicsControls) {
      element(id).addEventListener('input', () => {
        this.syncGraphicsLabels(); this.customGraphics(); this.graphicsPending = true;
        this.graphicsResources ||= ['render-scale', 'shadow-quality', 'antialiasing', 'view-distance', 'cloud-quality'].includes(id);
        clearTimeout(this.graphicsTimer); this.graphicsTimer = setTimeout(() => this.flushGraphics(), 150);
      }, { signal: this.events.signal });
      element(id).addEventListener('change', () => this.flushGraphics(), { signal: this.events.signal });
    }
    element('frame-limit').addEventListener('input', () => {
      this.loop.setFrameLimit(this.graphicsSetting('frame-limit')); this.syncGraphicsLabels();
    }, { signal: this.events.signal });
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
    element('landmark-view').addEventListener('click', () => {
      this.world.requestLandmarkView(); this.setPaused(false); this.canvas.focus();
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
      runtimeLog.write('info', 'graphics', 'WebGL context restored.');
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
    if (this.presets.restoreStartup(new URLSearchParams(location.search).has('seed') ? this.initialSeed : undefined)) this.settings.close();
    this.applyGraphics();
    this.loop.start();
  }

  private loadSeed(seed: string, options: Readonly<WorldOptions> = this.world.options): boolean {
    if (this.contextLost) return false;
    this.flushGraphics();
    this.settings.close();
    try {
      const world = new World(this.scene, seed, options);
      world.setSeason(this.world.season.kind);
      this.stopTravel();
      this.world.dispose();
      this.world = world;
      this.weather.setSeason(world.season);
      this.sky.sun.setTerrain(world.options.terrain);
      for (const id of ['weather-kind', 'season-kind']) element<HTMLSelectElement | HTMLFieldSetElement>(id).disabled = world.season.extraterrestrial;
      element<HTMLInputElement>('fog-density').disabled = world.options.terrain === 'moon';
      element<HTMLInputElement>('fog-visibility').disabled = world.season.extraterrestrial;
      this.world.traffic.density = Number(element<HTMLInputElement>('traffic-density').value);
      this.world.traffic.limit = Number(element<HTMLInputElement>('traffic-limit').value);
      this.world.traffic.scenario = element<HTMLSelectElement>('traffic-scenario').value as keyof typeof trafficScenarios;
      this.world.traffic.configure(Object.fromEntries(Object.keys(trafficTuning).map(key => [key, Number(element<HTMLInputElement>(`traffic-${key}`).value)])));
      this.applyPerformance();
      this.garagePanel.apply();
      this.world.chunks.setViewRadius(this.viewRadius);
      this.clouds.setSeed(seed);
      this.world.chunks.setWireframe(this.wireframe);
      this.world.chunks.vegetation.enabled = element('vegetation-toggle').getAttribute('aria-pressed') === 'true';
      this.world.roadDebug.enabled = element('road-debug').getAttribute('aria-pressed') === 'true';
      this.world.furniture.enabled = element('lights-toggle').getAttribute('aria-pressed') === 'true';
      element<HTMLInputElement>('seed').value = seed;
      this.worldSettings.write(options);
      const elevation = absoluteElevation(options) ? ` · ${options.elevationMode === 'fixed' ? '固定往返' : '随机升降'} ${options.altitudeMin}–${options.altitudeMax} 米`
        : options.elevationMode === 'cycles' ? ` · 目标爬升 ${options.climbMin}–${options.climbMax} 米` : '';
      element('settings-status').textContent = `当前：${terrainNames[options.terrain]} · ${routeNames[options.routeStyle]} · 最大坡度 ${Math.round(options.maxGrade * 100)}% · ${roadNames[options.roadType]} · ${roadLayout(options)} · 单幅 ${options.roadWidth} 米${options.roadType === 'highway' ? ` · 最小半径 ${options.highwayRadius} 米` : ''}${elevation} · ${options.roadType === 'highway' ? `立交${options.interchanges ? '开启' : '关闭'}` : `岔路${options.junctions ? '开启' : '关闭'}`}`
        + `${options.mountainHeight === 'range' ? ` · 山脉 ${options.mountainMin}–${options.mountainMax} 米` : ''} · 山脉密集度 ${Math.round(options.mountainDensity * 100)}% · 植被 ${Math.round(options.vegetationDensity * 100)}%`;
      this.setError(null);
      runtimeLog.write('info', 'world', `World loaded: ${seed}; ${options.terrain}; ${options.roadType}.`);
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

  private tuneRadio(channel: number, enable = true): void {
    this.audio.tune(channel);
    if (enable && !this.audio.enabled) this.audio.toggle();
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
      'tunnel-view', 'lights-view', 'service-view', 'pass-view', 'landmark-view']) element<HTMLButtonElement>(id).disabled = true;
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

  private access?: { car: DrivingSystem['car']; sequence: VehicleAccess; compartment?: CabinLayout };

  private cancelAccess(): void { this.access?.sequence.cancel(); this.access = undefined; }

  private interactVehicle(): void {
    if (this.access && !this.access.sequence.closing) return;
    this.cancelAccess();
    if (this.driving.active) {
      if (!this.driving.exitLocation()) return;
      this.driving.car.equipment.locked = false;
      this.driving.car.park(); this.driving.autopilot.cancel();
      this.access = { car: this.driving.car, sequence: new VehicleAccess(this.driving.operations, false,
        this.driving.cabinWalk.layout?.entry === 'cargo' ? 'cargo' : 'doors') };
    } else if (this.walking.active) {
      const entry = this.driving.nearbyVehicle(this.walking.person);
      if (entry ? this.driving.prepareBoarding(entry) : this.driving.canBoard(this.walking.person))
        this.access = { car: this.driving.car, sequence: new VehicleAccess(this.driving.operations, true) };
    }
    if (this.access) this.input.clear();
  }

  private enterCargo(): void {
    if (this.access || !this.walking.active) return;
    const compartment = this.driving.nearbyCargo(this.walking.person);
    if (!compartment) return;
    this.access = { car: this.driving.car, sequence: new VehicleAccess(this.driving.operations, true, 'cargo'), compartment };
    this.input.clear();
  }

  private setError(message: string | null): void {
    if (message) runtimeLog.write('error', 'world', message);
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
    if (this.audioTestPending && !this.audio.testing) {
      this.audioTestPending = false;
      element('audio-test-status').textContent = this.audio.error || '声音测试已结束或中断。若未听到三段提示音，请检查系统输出设备与浏览器站点静音，或点击强制开启声音。';
    }
    if (this.audioPreviewPending && !this.audio.previewing) {
      this.audioPreviewPending = false;
      element('audio-preview-status').textContent = this.audio.error || '试听已结束 · 可调整混音参数后再次试听。';
    }
    element('audio-toggle').setAttribute('aria-pressed', String(this.audio.enabled));
    element('audio-toggle').textContent = this.audio.error ? '重试开启声音' : this.audio.enabled ? '静音' : '开启声音';
    element('audio-status').textContent = this.audio.error || (!this.audio.enabled ? '声音未开启' : this.audio.masterVolume <= 0 ? '总音量为零'
      : this.audio.testing ? '正在测试输出声道' : this.audio.sfxVolume <= 0 && this.audio.musicVolume <= 0 ? '音效与音乐均已静音'
        : this.paused ? '游戏已暂停 · 解除暂停后恢复声音' : document.hidden || !this.windowFocused || !document.hasFocus() ? '窗口未激活 · 返回游戏后恢复声音'
          : this.audio.awaitingActivation ? '声音设置已保留 · 点击页面或按键后开启声音'
            : this.audio.state === 'running' ? '声音已开启' : this.audio.state === 'suspended' ? '声音已暂停或等待浏览器授权 · 可点击强制开启声音' : `音频状态：${this.audio.state}`);
  }

  private refreshAudioFocus(): void {
    this.windowFocused = document.hasFocus();
    this.audio.setActive(!this.paused && !this.releaseNotes.open && !this.cabinDialogs.open && this.input.enabled && !document.hidden && this.windowFocused);
  }

  private graphicsSetting(id: string): number { return graphicsValue(id, Number(element<HTMLInputElement>(id).value)); }

  private syncGraphicsLabels(): void {
    for (const id of [...graphicsControls, 'frame-limit']) {
      const node = element<HTMLInputElement>(id), label = graphicsLabel(id, Number(node.value));
      element(`${id}-value`).textContent = label; node.setAttribute('aria-valuetext', label);
    }
  }

  private flushGraphics(): void {
    clearTimeout(this.graphicsTimer); this.graphicsTimer = undefined;
    if (!this.graphicsPending) return;
    this.graphicsPending = false;
    if (this.graphicsResources) this.applyGraphics(); else this.applyPerformance();
    this.graphicsResources = false;
  }

  private applyPerformance(): void {
    const value = (id: string) => this.graphicsSetting(id);
    this.world.pavementTextures.configure(value('road-texture'), this.renderer.capabilities.getMaxAnisotropy(), value('road-relief'), value('road-filtering'));
    this.world.modelLoads.budget = value('model-load-budget');
    this.world.trafficVehicles.preloadDistance = this.world.parkedVehicles.preloadDistance = value('model-preload-distance');
    this.world.chunks.uploadBudget = value('terrain-upload-budget');
    this.world.chunks.uploadLimit = value('terrain-upload-limit');
    this.world.chunks.setPreload(value('terrain-preload'));
    this.world.detailLevel = value('map-detail');
    this.world.detailDistance = value('detail-distance') / 100;
    this.world.chunks.vegetation.setDetailLevel(value('map-detail'));
    this.world.chunks.vegetation.configure({ distance: value('vegetation-lod'), density: value('distant-trees'), shadows: value('vegetation-shadows'), budget: value('vegetation-budget'),
      trees: value('tree-density') / 100, ground: value('ground-density') / 100, flowers: value('flower-density') / 100, rocks: value('rock-density') / 100 });
    this.world.trafficVehicles.detailDistance = this.world.parkedVehicles.detailDistance = value('vehicle-detail-distance');
    this.world.parkedVehicles.detailLimit = value('parked-detail-limit');
    this.world.garageCache = value('garage-cache');
  }

  private applyGraphics(): void {
    clearTimeout(this.graphicsTimer); this.graphicsTimer = undefined; this.graphicsPending = this.graphicsResources = false;
    this.syncGraphicsLabels(); this.loop.setFrameLimit(this.graphicsSetting('frame-limit'));
    this.applyPerformance();
    const scale = this.graphicsSetting('render-scale'), resized = scale !== this.renderScale;
    this.renderScale = scale;
    const size = Math.min(this.graphicsSetting('shadow-quality'), this.renderer.capabilities.maxTextureSize);
    this.sky.light.castShadow = size > 0;
    this.renderer.shadowMap.enabled = size > 0;
    if (size && this.sky.light.shadow.mapSize.x !== size) {
      this.sky.light.shadow.map?.dispose(); this.sky.light.shadow.map = null;
      this.sky.light.shadow.mapSize.set(size, size);
    }
    element('shadows').setAttribute('aria-pressed', String(size > 0));
    const antialias = this.graphicsSetting('antialiasing'), samples = antialias > 1 ? Math.min(antialias, this.renderer.capabilities.maxSamples) : 0;
    this.clouds.material.uniforms.antialias.value = antialias > 0;
    this.clouds.material.uniforms.cloudSteps.value = this.graphicsSetting('cloud-quality');
    if (this.clouds.target.samples !== samples) { this.clouds.target.dispose(); this.clouds.target.samples = samples; }
    this.viewRadius = this.graphicsSetting('view-distance');
    this.world.chunks.setViewRadius(this.viewRadius);
    this.camera.far = Math.max(7000, this.viewRadius * CHUNK_SIZE * 2);
    if (resized) this.resize(); else this.camera.updateProjectionMatrix();
  }

  private update(dt: number): void {
    if (this.world.chunks.error && element('error').hidden) this.setError(`地形生成失败，请重试当前世界。${this.world.chunks.error}`);
    const silent = this.paused || this.releaseNotes.open || this.cabinDialogs.open || !this.input.enabled;
    const frozen = silent || this.settings.open;
    this.trafficControls.syncWorld();
    this.world.signals.tick(!frozen && document.hasFocus() && document.activeElement === this.canvas && this.world.roadReady ? dt : 0);
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
      frozen || this.access && (!document.hasFocus() || document.activeElement !== this.canvas || !this.world.roadReady) ? 0 : dt, this.weather.fogLightsNeeded);
    this.walking.sync();
    if (this.access && !frozen && this.world.roadReady && !this.world.searching && document.hasFocus() && document.activeElement === this.canvas) {
      const sequence = this.access.sequence, step = sequence.step();
      if (step === 'complete') this.access = undefined;
      else if (step === 'transfer') {
        if (sequence.entering) {
          const { x, y, z, heading } = this.walking.person;
          this.walking.stop();
          if (this.driving.start(true)) {
            if (this.access.compartment) this.driving.enterCargo(this.access.compartment);
            sequence.close();
          }
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
    this.trafficControls.update(moving ? dt : 0, this.driving.car, this.driving.active && this.driving.cabin.driver && !this.driving.operations.accessing);
    const anchor = this.driving.active ? this.driving.car : this.walking.active ? this.walking.person
      : { x: this.camera.position.x + this.world.origin.x, y: this.camera.position.y, z: this.camera.position.z + this.world.origin.z };
    const obstacles = this.world.traffic.density ? this.world.parkedVehicles.fleet.entries.filter(e => (e.slot < 0 || !e.id.startsWith('garage:')) && Math.hypot(e.x - anchor.x, e.z - anchor.z) < 1500)
      .map(e => this.world.parkedVehicles.fleet.vehicle(e)) : [];
    if (this.driving.active || this.driving.parked) obstacles.push(this.driving.car);
    this.world.traffic.update(moving ? dt : 0, this.world.network.routes, anchor, obstacles, this.walking.active ? this.walking.person : undefined);
    this.world.trafficVehicles.update(this.world.origin, Math.max(this.sky.sun.night, this.world.shelter, this.weather.profile.far < 500 ? 1 : 0), anchor, this.weather.fogLightsNeeded);
    this.world.modelLoads.pump();
    const cameraRight = this.camera.matrixWorld.elements;
    const right = { x: cameraRight[0], y: cameraRight[1], z: cameraRight[2] };
    const listener = { x: this.camera.position.x + this.world.origin.x, y: this.camera.position.y, z: this.camera.position.z + this.world.origin.z };
    const trafficHorns = moving ? this.world.traffic.horns(listener, right) : [];
    const runningParked = this.world.parkedVehicles.fleet.runningVehicles();
    this.world.parkedVehicles.fogLamps.update(runningParked.filter(({ car }) => Math.hypot(car.x - listener.x, car.z - listener.z) < 1600).map(({ car }) => car), this.world.origin, this.weather.fogLightsNeeded);
    const nearbyEngines = moving ? [...this.world.traffic.entries, ...runningParked,
      ...this.driving.parked && !this.driving.active ? [{ id: 'player:parked', car: this.driving.car }] : []]
      .flatMap(({ id, car }) => { const sound = engineSound(id, car, listener, right); return sound ? [sound] : []; }) : [];
    this.audio.update(dt, { powertrain: this.driving.car.powertrain, regeneration: this.driving.car.regenerating, fuelCut: this.driving.car.transmission.fuelCut,
      atmosphere: this.world.options.terrain === 'moon' ? 0 : this.world.options.terrain === 'mars' ? 0.15 : 1, driving: this.driving.active && moving, speed: this.driving.active && moving ? this.driving.car.speed : 0,
      throttle: moving && this.driving.cabin.driver && this.driving.crane.stowed && this.driving.operations.driveReady ? this.driving.car.transmission.load : 0,
      shifting: this.driving.car.transmission.shifting, impact: this.driving.car.impact, scrape: this.driving.car.scrape,
      mass: this.driving.car.profile.mass, motorcycle: this.driving.car.profile.shape === 'motorcycle',
      rain: this.weather.liquidRain, shelter: this.world.shelter, cockpit: this.driving.active && this.driving.cameraRig.view === 'cockpit',
      signal: this.driving.active && (this.driving.systems.leftSignal || this.driving.systems.rightSignal), wiper: this.driving.active ? this.driving.systems.sweep : 0,
      rpm: this.driving.car.engineRpm, shifts: this.driving.car.transmission.shifts, ignition: this.driving.car.ignition,
      nearbyEngines,
      exposure: this.driving.cabinExposure, wet: this.weather.wetness, night: this.sky.sun.night,
      nature: !['moon', 'mars', 'desert', 'dunes', 'badlands', 'volcanic'].includes(this.world.options.terrain) && this.world.season.kind !== 'winter',
      horn: this.driving.active && moving && this.input.down('KeyV'), vehicle: this.driving.car.kind, trafficHorns,
      fan: this.driving.systems.hasWindows ? this.driving.systems.fan : 0,
      washer: this.driving.systems.washerSpray, motor: this.driving.systems.equipmentMotor || this.driving.operations.moving,
      supercar: this.driving.car.kind === 'supercar', braking: this.driving.car.braking, operations: this.driving.operations.events,
      tireSlip: this.driving.car.tireSlip,
      service: this.world.services.reduce((level, site) => Math.max(level, ...site.ground.pads.map(pad => Math.max(0, 1 - Math.hypot(pad.x - this.camera.position.x - this.world.origin.x, pad.y - this.camera.position.y, pad.z - this.camera.position.z - this.world.origin.z) / 160))), 0),
      walkingSpeed: !moving ? 0 : this.driving.active && this.driving.cabin.standing && this.driving.cabinWalk.person.grounded
        ? this.driving.cabinWalk.person.speed : this.walking.active && this.walking.person.grounded ? this.walking.person.speed : 0 });
    this.sky.update(this.camera, this.world.origin, this.weather.profile.sunlight, this.world.shelter, this.world.season);
    this.interior.update(this.driving.interior, this.camera.position);
    this.clouds.update(frozen ? 0 : dt, this.camera, this.world.origin, this.weather.profile, this.world.shelter, this.viewRadius * CHUNK_SIZE);
    this.world.furniture.illuminate(this.camera, this.sky.sun.night, this.world.tunnelMesh.lampPositions, this.world.origin.x, this.world.origin.z, this.world.serviceMesh.lampPositions);
    this.world.serviceMesh.windows.material.emissiveIntensity = this.sky.sun.night * 0.35;
    this.world.roadMesh.mesh.material.roughness = 0.95 - this.weather.wetness * 0.58;
    this.world.serviceMesh.pavement.material.roughness = this.world.interchangeMesh.pavement.material.roughness = this.world.roadMesh.mesh.material.roughness;
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
      const boardable = this.walking.active && (this.driving.canBoard(this.walking.person, true) || !!nearby);
      const cargo = this.walking.active ? this.driving.nearbyCargo(this.walking.person, true) : undefined;
      const locked = (nearby ? this.driving.entryVehicle(nearby) : this.driving.car).equipment.locked;
      const d = this.driving, c = d.car, ops = d.operations;
      this.shortcutDock.update({ mode: d.active ? d.cabin.standing ? 'interior' : d.cabin.selected.role : this.walking.active ? 'walking' : 'flight',
        paused: this.paused, modal: this.releaseNotes.open || this.settings.open || this.cabinDialogs.open,
        ready: this.world.roadReady && this.input.enabled && !this.world.searching, accessing: !!this.access || ops.accessing,
        stopped: c.motionSpeed <= 0.1, board: boardable && !locked, cargo: !!cargo && !c.equipment.locked,
        lock: d.active ? d.cabin.driver && !ops.moving && ops.doors < 0.001 && ops.cargo < 0.001 : boardable || !!cargo,
        leaveSeat: d.cabinWalk.layouts.some(l => l.entry === 'cabin'), sit: !!d.cabinWalk.nearestSeat(d.cabin), exit: d.nearInteriorExit,
        glass: d.systems.hasWindows, convertible: d.systems.convertible, ev: c.powertrain === 'ev', trailer: !!c.trailers.length,
        driveReady: ops.driveReady && d.crane.stowed, doors: !c.equipment.locked ? ops.label('doors') : '',
        tailgate: !c.equipment.locked ? ops.label('cargo') : '', auxiliary: ops.label('aux'), crane: c.kind === 'crane' });
      element('boarding-help').hidden = !boardable && !cargo && !this.access;
      element('boarding-help').textContent = this.access ? this.access.sequence.closing ? '车门关闭中 · 请稍候'
        : `车门打开中 · 准备${this.access.sequence.entering ? '上' : '下'}车`
        : (cargo ? c.equipment.locked : locked) ? `车辆已锁 · ${this.input.bindings.label('VehicleLock')} 解锁`
          : cargo ? `${this.input.bindings.label('CabinWalk')} · 从尾门进入${cargo.label}`
          : `${this.input.bindings.label('KeyF')} · ${nearby ? `开门驾驶${vehicleProfiles[nearby.kind].name}` : '开门回到车辆'}`;
      const speeds = this.world.traffic.entries.map(e => e.car.speed * 3.6);
      element('traffic-status').textContent = `附近 ${this.world.traffic.entries.length} 辆 / 目标 ${this.world.traffic.targetCount} 辆 · ${this.world.traffic.density ? trafficScenarios[this.world.traffic.scenario] : '交通已关闭'}`
        + (speeds.length ? ` · 当前 ${Math.round(Math.min(...speeds))}–${Math.round(Math.max(...speeds))} km/h` : '');
      this.garagePanel.update();
      this.roadbook.update();
      if (!this.driving.active) element('drive-toggle').textContent = boardable ? '回到车辆' : this.driving.parked ? '重新放置车辆' : '开始驾驶';
      const season = this.world.season, roadHeight = this.world.roadSample?.position.y ?? y;
      const snow = season.snow(roadHeight);
      const precipitation = this.weather.snowfall > 0.015 ? this.weather.liquidRain > 0.015 ? '雨夹雪' : '降雪' : this.weather.liquidRain > 0.015 ? '降雨' : '无降水';
      const condition = this.world.garages.some(g => g.shelter(x, y, z)) ? '地下车库 · 干燥路面' : this.world.shelter > 0.9 ? '隧道遮蔽' : snow > 0.15 ? '积雪路面，减速慢行' : this.weather.wetness > 0.2 ? '路面湿滑' : '路面正常';
      element('season-status').textContent = season.extraterrestrial ? `${terrainNames[season.terrain]} · 低重力 · 无雨雪，地球季节设置已保留` : `${seasonNames[season.kind]} · ${season.temperature(y).toFixed(1)} °C · ${precipitation} · ${condition}`;
      element('drive-condition').textContent = season.extraterrestrial ? `${terrainNames[season.terrain]} · ${this.driving.car.gravity.toFixed(2)} m/s² · 制动距离增加` : `${seasonNames[season.kind]} · ${season.temperature(roadHeight).toFixed(0)} °C · ${condition}`;
      element('drive-condition').dataset.snow = String(snow > 0.15 && this.world.shelter < 0.9);
      element('altitude').textContent = Math.round(y).toLocaleString();
      element('position').textContent = `${Math.round(x)} / ${Math.round(z)}`;
      element('notice').textContent = !this.input.enabled ? '探索已中止 · 请重试当前世界' : this.paused ? '已暂停 · 按 {PauseToggle} 继续' : !this.world.roadReady ? '路线生成中 · 请稍候'
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
      const landmarkSearch = this.world.landmarkSearchProgress;
      element<HTMLButtonElement>('landmark-view').disabled = !this.world.options.landmarkBridges || !this.world.roadReady || this.world.searching && landmarkSearch === null;
      element('landmark-view').textContent = landmarkSearch === null ? '下一座超级斜拉桥' : `取消大桥定位 · ${Math.round(landmarkSearch * 100)}%`;
      element('landmark-status').textContent = this.world.landmarkStatus;
      const passSearch = this.world.passSearchProgress;
      element<HTMLButtonElement>('pass-view').disabled = this.world.searching || !this.world.roadReady || this.world.options.terrain !== 'alpine' || this.world.network.active.id !== 'root';
      element('pass-view').textContent = passSearch === null ? '下一垭口' : `定位中 · ${Math.round(passSearch * 100)}%`;
      element('route-stage').textContent = this.world.routeStage;
      const junction = this.world.nextJunction;
      const signalRoad = crossroadsEnabled(this.world.options);
      const junctions = signalRoad || (this.world.options.roadType === 'highway' ? this.world.options.interchanges : this.world.options.junctions);
      const junctionSearch = this.world.junctionSearchProgress;
      element<HTMLButtonElement>('junction-view').disabled = !this.world.roadReady || this.world.searching || !junctions;
      element('junction-view').textContent = junctionSearch === null ? signalRoad ? '下一信号路口' : '下一匝道' : `定位中 · ${Math.round(junctionSearch * 100)}%`;
      element('junction-status').textContent = junction ? `${junction.kind === 'crossroads' ? '信号十字路口 · 四向连接' : junction.interchange ? '四层高速 · 四向互通 · 8 条匝道' : junction.kind === 'stack' ? '多向立交 · 左转 / 右转 / 回转' : '平面分流'} · ${Math.max(0, Math.round(((junction.ramps.find(r => r.sample.distance > (this.world.roadSample?.distance ?? 0) - 30)?.sample.distance ?? junction.distance) - (this.world.roadSample?.distance ?? 0)) / 10) * 10)} m`
        : this.world.junctionStatus || (signalRoad ? `信号路口目标间隔 ${this.world.options.crossroadInterval / 1000} km · 不适合处跳过` : junctions ? '每 20 km 寻找互通 · 隧道内顺延' : '出口关闭 · 主线双向延伸');
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
        'Model loading jobs': this.world.modelLoads.pending,
        'Model loading budget': `${this.world.modelLoads.budget} ms`,
        'Road relief': this.world.pavementTextures.uniforms.pavementDetail.value,
        'Road filtering': this.world.pavementTextures.uniforms.pavementAsphalt.value.anisotropy,
        Triangles: this.renderer.info.render.triangles, 'Draw calls': this.renderer.info.render.calls,
        'GPU textures': this.renderer.info.memory.textures,
        'Render scale': `${Math.round(this.renderScale * 100)}%`, 'Frame limit': this.graphicsSetting('frame-limit'),
        'Map detail': this.world.detailLevel,
        'Scene samples': this.clouds.target.samples,
        'FXAA': this.clouds.material.uniforms.antialias.value ? 'on' : 'off', 'Cloud steps': this.clouds.material.uniforms.cloudSteps.value,
        'Valley crossings': this.world.crossings.map(site => site.kind).join(', ') || 'none',
        'Audio state': this.audio.state,
        'Engine RPM': String(Math.round(this.driving.car.engineRpm)),
        'Engine load': this.driving.car.transmission.load.toFixed(2), 'Gear shifting': String(this.driving.car.transmission.shifting),
        'Engine response': this.driving.car.transmission.response.toFixed(2), 'Impact speed': this.driving.car.impact.toFixed(2),
        'Ignition': this.driving.car.ignition,
        'NPC vehicles': this.world.traffic.entries.length,
        'NPC density': `${this.world.traffic.density}%`,
        'Traffic scenario': this.world.traffic.scenario,
        'Interchange ramps': this.world.network.junctions.reduce((count, j) => count + (j.interchange?.ramps.length ?? 0), 0),
        'Vegetation pending': this.world.chunks.vegetation.pending,
        'NPC limit': this.world.traffic.limit,
        'NPC target': this.world.traffic.targetCount,
        'Garage floor': this.world.garages.map(g => g.floor(x, y, z)).find(floor => floor !== undefined) ?? 'outside',
        'Garage position': `${this.world.garage.position.x}, ${this.world.garage.position.y.toFixed(2)}, ${this.world.garage.position.z}`,
        'Garage loading': this.world.garage.loading, 'Garage loaded floors': this.world.garageMesh.loadedFloors,
        'Garage light': `${Math.round(this.world.garage.light * 100)}%`,
        'Garage access': this.world.garage.ground.access.length,
        'Garage vehicles': this.world.parkedVehicles.fleet.entries.filter(e => e.id.startsWith('garage:main:')).length,
        'Service garages': this.world.garages.length - 1,
        'NPC motion': this.world.traffic.entries.map(e => `${e.id}:${e.distance.toFixed(1)}`).join(', '),
        'NPC horns nearby': trafficHorns.length,
        'Nearby engine voices': Math.min(6, nearbyEngines.length),
        'NPC cruise range': `${this.world.traffic.tuning.minSpeed}–${this.world.traffic.tuning.maxSpeed} km/h`,
        'NPC lane changes': this.world.traffic.entries.filter(e => e.change).length,
        'Signal intersections': this.world.signals.junctions.length,
        'Signal time': this.world.signals.time.toFixed(2),
        'Traffic warnings': this.trafficControls.rules.count,
        'Transmission': `${this.driving.car.transmission.mode} / ${this.driving.car.transmission.gear}`,
        'Window opening': this.driving.systems.windowOpen.toFixed(2),
        'Roof opening': this.driving.systems.roofOpen.toFixed(2),
        'Washer fluid': this.driving.systems.washerFluid.toFixed(2),
        'Cabin exposure': this.driving.systems.cabinExposure.toFixed(2),
        'Cabin sealed': this.interior.uniforms.interiorActive.value ? 'yes' : 'no',
        'Vehicle locked': this.driving.car.equipment.locked ? 'yes' : 'no',
        'Reverse lights': this.driving.car.reversing ? 'on' : 'off',
        'Fridge temperature': this.driving.car.equipment.fridgeTemperature.toFixed(1),
        'Fridge cooling': this.driving.car.equipment.fridgeCooling ? 'on' : 'off',
        'Cabin seat': this.driving.cabin.selected.id,
        'Cabin walking': this.driving.cabin.standing ? this.driving.cabinWalk.layout?.id ?? 'off' : 'off',
        'Interior position': [this.driving.cabinWalk.person.x, this.driving.cabinWalk.person.y, this.driving.cabinWalk.person.z].map(v => v.toFixed(2)).join(' / '),
        'Interior floor': this.driving.cabinWalk.floor,
        'Cabin floor': this.driving.cabin.selected.floor,
        'Vehicle operations': `${this.driving.operations.doors.toFixed(2)} / ${this.driving.operations.cargo.toFixed(2)} / ${this.driving.operations.aux.toFixed(2)}`,
        'Vehicle speed limit': `${(this.driving.car.maxSpeed * 3.6).toFixed(1)} km/h`,
        'Steering assist': this.driving.car.steeringAssist ? `${Math.round(this.driving.car.steeringAssistStrength * 100)}%` : 'off',
        'Drift angle': (this.driving.car.slipAngle * 180 / Math.PI).toFixed(1),
        'Drift enabled': this.driving.car.driftEnabled ? 'on' : 'off',
        'Turning radius': this.driving.car.turningRadius === undefined ? 'factory' : String(this.driving.car.turningRadius),
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
        'Service facilities': this.world.services.map(s => s.facility ?? 'garden').join(', ') || '—',
        'Service merge lanes': this.world.services.filter(s => s.mergeEnd).length,
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
        Powertrain: this.driving.car.powertrain, 'Surface gravity': this.driving.car.gravity, 'Trailer count': this.driving.car.trailers.length,
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
        'Fog lights': this.driving.systems.fogLights ? 'on' : 'off',
        'Sprinkler pump': this.driving.car.profile.body === 'sprinkler' && this.driving.operations.target.aux && this.driving.car.ignition === 'running' ? 'on' : 'off',
        'Road reflectors': this.world.furniture.reflectors.count,
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
        'Terrain adherence': `${Math.round(this.world.options.terrainFollow * 100)}%`, 'Preferred bridge height': `${this.world.options.bridgeHeight} m`,
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
    clearTimeout(this.graphicsTimer);
    this.garagePanel.dispose();
    this.trafficControls.dispose();
    this.keyBindingPanel.dispose();
    this.presets.dispose(); this.worldSettings.dispose();
    this.cabinDialogs.dispose();
    this.roadbook.dispose();
    this.settings.dispose();
    this.audio.dispose();
    this.debug.dispose();
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
