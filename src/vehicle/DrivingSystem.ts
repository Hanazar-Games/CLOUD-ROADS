import type { PerspectiveCamera, Scene } from 'three';
import { DrivingCamera, drivingViews, type DrivingView } from '../camera/DrivingCamera';
import { element } from '../debug/DebugUI';
import type { InputManager } from '../input/InputManager';
import type { World } from '../world/World';
import { DrivingSurface } from './DrivingSurface';
import { VehicleMesh } from './VehicleMesh';
import { VehiclePhysics } from './VehiclePhysics';
import { vehicleProfiles, suspensionLevels, suspensionNames, suspensionTuning, type Suspension, type VehicleKind } from './VehicleConfig';
import { VehicleSystems, lightNames, wiperNames, signalNames, type LightMode, type WiperMode, type SignalMode } from './VehicleSystems';
import { CabinState } from './CabinState';
import { CraneSystems } from './CraneSystems';
import { radioStations } from '../audio/RadioStations';
import { VehicleOperations, operationKeys, type VehicleOperation } from './VehicleOperations';
import type { ParkedEntry } from '../service/ServiceParking';
import { Autopilot, pilotModes, type AutopilotSettings } from './Autopilot';

const driftTuning = [['road-grip', 'gripScale', 1], ['handbrake-strength', 'handbrakeStrength', 1], ['countersteer-assist', 'countersteerAssist', 0.6]] as const;

export class DrivingSystem {
  car = new VehiclePhysics();
  readonly systems = new VehicleSystems();
  readonly autopilot = new Autopilot();
  appliedThrottle = 0;
  cabin = new CabinState(this.car.profile);
  crane = new CraneSystems();
  operations = new VehicleOperations(this.car.profile);
  readonly cameraRig;
  active = false;
  parked = false;
  private fleetId: string | undefined;
  private mesh;
  private readonly events = new AbortController();
  private surface: DrivingSurface | undefined;
  private boardingSurface: { world: World; surface: DrivingSurface } | undefined;
  private collisionTime = 0;
  private exitBlockedTime = 0;
  private hudTime = 0;
  private systemsDt = 0;

  constructor(private readonly scene: Scene, private readonly camera: PerspectiveCamera, private readonly input: InputManager, private readonly getWorld: () => World) {
    this.mesh = new VehicleMesh(scene);
    this.cameraRig = new DrivingCamera(camera);
    const options = { signal: this.events.signal };
    try { const data = localStorage.getItem('cloud-roads.autopilot.v1'); if (data) this.autopilot.configure(JSON.parse(data)); }
    catch { element('autopilot-settings-status').textContent = '无法读取本机辅助设置，使用默认参数。'; }
    this.syncPilotOptions();
    for (const id of ['autopilot-toggle', 'hud-autopilot']) element(id).addEventListener('click', () => {
      this.toggleAutopilot(); if (id === 'hud-autopilot') element('world').focus();
    }, options);
    element('autopilot-options').addEventListener('submit', event => {
      event.preventDefault();
      try {
        this.autopilot.configure({ mode: element<HTMLSelectElement>('autopilot-mode').value as AutopilotSettings['mode'],
          comfort: Number(element<HTMLSelectElement>('autopilot-comfort').value), minKmh: Number(element<HTMLInputElement>('autopilot-min').value), maxKmh: Number(element<HTMLInputElement>('autopilot-max').value) });
        element('autopilot-settings-status').textContent = '参数已应用并保存；关闭设置后继续。';
        try { localStorage.setItem('cloud-roads.autopilot.v1', JSON.stringify(this.autopilot.settings)); }
        catch { element('autopilot-settings-status').textContent = '参数已应用，但浏览器不允许本机保存。'; }
      } catch (error) { element('autopilot-settings-status').textContent = (error as Error).message; }
    }, options);
    for (const id of ['vehicle-ignition', 'panel-ignition']) element(id).addEventListener('click', () => this.ignite(), options);
    const selector = element<HTMLSelectElement>('vehicle-kind');
    selector.replaceChildren(...Object.entries(vehicleProfiles).map(([kind, profile]) => new Option(profile.name, kind)));
    selector.value = this.car.kind;
    element<HTMLSelectElement>('suspension').replaceChildren(...suspensionLevels.map(level => new Option(suspensionNames[level], String(level), level === 3, level === 3)));
    selector.addEventListener('change', () => {
      if (Object.hasOwn(vehicleProfiles, selector.value)) this.selectVehicle(selector.value as VehicleKind);
    }, options);
    this.describeVehicle();
    element('hud-style').addEventListener('change', () => {
      const style = element<HTMLSelectElement>('hud-style').value;
      if (['digital', 'dial', 'minimal'].includes(style)) element('drive-hud').dataset.style = style;
    }, options);
    this.systems.configure(this.car.profile.shape);
    element('transmission-mode').addEventListener('change', () => {
      this.autopilot.cancel('变速箱模式改变，请重新开启');
      this.car.transmission.mode = element<HTMLSelectElement>('transmission-mode').value === 'manual' ? 'manual' : 'auto';
    }, options);
    element('vehicle-windows').addEventListener('input', () => { this.systems.windowTarget = Number(element<HTMLInputElement>('vehicle-windows').value) / 100; this.describeEquipment(); }, options);
    element('vehicle-roof').addEventListener('click', () => { this.systems.toggleRoof(this.car.motionSpeed); this.describeEquipment(); }, options);
    element('washer').addEventListener('click', () => { this.systems.wash(); this.describeEquipment(); }, options);
    element('washer-refill').addEventListener('click', () => { this.systems.refill(this.car.motionSpeed); this.describeEquipment(); }, options);
    element('cabin-light').addEventListener('click', () => { this.systems.cabinLight = !this.systems.cabinLight; this.describeEquipment(); }, options);
    element('ambient-light').addEventListener('click', () => { this.systems.ambientLight = !this.systems.ambientLight; this.describeEquipment(); }, options);
    element('crane-power').addEventListener('click', () => this.crane.toggle(this.active && this.cabin.selected.role === 'operator', this.car.motionSpeed), options);
    for (const action of ['doors', 'cargo', 'aux'] as const) for (const prefix of ['vehicle', 'panel'])
      element(`${prefix}-${action}`).addEventListener('click', () => this.operate(action), options);
    element('seat-reset').addEventListener('click', () => { this.cabin.resetAdjustment(); this.cameraRig.reset(); }, options);
    element('cabin-fan').addEventListener('change', () => { this.systems.fan = Number(element<HTMLSelectElement>('cabin-fan').value); }, options);
    element('vehicle-max-speed').addEventListener('input', () => {
      this.car.setSpeedLimit(Number(element<HTMLInputElement>('vehicle-max-speed').value)); this.describeTuning();
    }, options);
    element('steering-assist').addEventListener('change', () => {
      this.car.steeringAssist = element<HTMLInputElement>('steering-assist').checked; this.describeTuning();
    }, options);
    element('steering-assist-strength').addEventListener('input', () => {
      this.car.steeringAssistStrength = Number(element<HTMLInputElement>('steering-assist-strength').value) / 100; this.describeTuning();
    }, options);
    const tuning = [['vehicle-power', 'powerScale'], ['vehicle-brake', 'brakeScale'], ['vehicle-steering', 'steeringScale']] as const;
    for (const [id, field] of tuning) element(id).addEventListener('input', () => {
      this.car[field] = Number(element<HTMLInputElement>(id).value) / 100;
      element(`${id}-value`).textContent = `${Math.round(this.car[field] * 100)}%`;
      this.describeVehicle();
    }, options);
    element('vehicle-tuning-reset').addEventListener('click', () => {
      this.car.setSpeedLimit(); this.car.steeringAssist = true; this.car.steeringAssistStrength = 1;
      for (const [id, field] of tuning) {
        this.car[field] = 1; element<HTMLInputElement>(id).value = '100'; element(`${id}-value`).textContent = '100%';
      }
      this.describeVehicle();
    }, options);
    element('vehicle-paint').addEventListener('change', () => this.applyPaint(), options);
    for (const [id, field] of driftTuning) element(id).addEventListener('input', () => {
      this.car[field] = Number(element<HTMLInputElement>(id).value) / 100; this.describeTuning();
    }, options);
    element('drift-reset').addEventListener('click', () => {
      for (const [, field, value] of driftTuning) this.car[field] = value;
      this.describeTuning();
    }, options);
    element('driving-view').addEventListener('change', () => {
      const view = element<HTMLSelectElement>('driving-view').value as DrivingView;
      if (drivingViews.includes(view)) { this.cameraRig.view = view; this.cameraRig.reset(); }
    }, options);
    element('driving-fov').addEventListener('input', () => {
      this.cameraRig.fov = Number(element<HTMLInputElement>('driving-fov').value);
      element('driving-fov-value').textContent = `${this.cameraRig.fov}°`;
    }, options);
    element('camera-distance').addEventListener('input', () => {
      this.cameraRig.distance = Number(element<HTMLInputElement>('camera-distance').value);
      this.describeVehicle();
    }, options);
    element('camera-height').addEventListener('input', () => {
      this.cameraRig.height = Number(element<HTMLInputElement>('camera-height').value);
      element('camera-height-value').textContent = `${this.cameraRig.height > 0 ? '+' : ''}${Math.round(this.cameraRig.height * 100)} cm`;
    }, options);
    element('suspension').addEventListener('change', () => {
      const value = Number(element<HTMLSelectElement>('suspension').value) as Suspension;
      if (suspensionLevels.includes(value)) { this.car.suspension = value; this.describeSuspension(); }
    }, options);
    element('suspension-damping').addEventListener('input', () => {
      this.car.damping = Number(element<HTMLInputElement>('suspension-damping').value) / 100;
      this.describeSuspension();
    }, options);
    const lights = element<HTMLSelectElement>('vehicle-lights'), wipers = element<HTMLSelectElement>('vehicle-wipers');
    lights.replaceChildren(...Object.entries(lightNames).map(([value, name]) => new Option(name, value)));
    wipers.replaceChildren(...Object.entries(wiperNames).map(([value, name]) => new Option(name, value)));
    lights.addEventListener('change', () => { if (Object.hasOwn(lightNames, lights.value)) this.systems.lights = lights.value as LightMode; }, options);
    wipers.addEventListener('change', () => { if (Object.hasOwn(wiperNames, wipers.value)) this.systems.wipers = wipers.value as WiperMode; }, options);
    const signals = element<HTMLSelectElement>('vehicle-signals');
    signals.replaceChildren(...Object.entries(signalNames).map(([value, name]) => new Option(name, value)));
    signals.addEventListener('change', () => { if (Object.hasOwn(signalNames, signals.value)) this.systems.signal = signals.value as SignalMode; }, options);
    for (const [id, field, unit, scale] of [['light-power', 'lightPower', '%', 0.01], ['light-range', 'lightRange', ' m', 1]] as const)
      element(id).addEventListener('input', () => {
        const value = Number(element<HTMLInputElement>(id).value); this.systems[field] = value * scale;
        element(`${id}-value`).textContent = `${value}${unit}`;
      }, options);
    element('vehicle-reset').addEventListener('click', () => { this.reset(); element('world').focus(); }, options);
    element('view-reset').addEventListener('click', () => { this.cameraRig.reset(); element('world').focus(); }, options);
  }

  start(resume = false): boolean {
    const world = this.getWorld();
    if (!world.roadReady || world.searching || !this.input.enabled) return false;
    if (resume && !this.parked) return false;
    this.surface = new DrivingSurface(world);
    if (!resume) {
      const spawn = this.surface.spawn(this.camera.position.x + world.origin.x, this.camera.position.z + world.origin.z, this.car.profile);
      if (!spawn) { this.explainSpace(); return false; }
      this.car.reset(spawn.x, spawn.z, spawn.heading, this.surface.sample, false, spawn.trailerHeading);
      this.cabin = new CabinState(this.car.profile); this.crane = new CraneSystems();
      this.operations = new VehicleOperations(this.car.profile);
      this.fleetId = undefined;
    }
    this.parked = false; this.exitBlockedTime = 0; this.hudTime = 0.1;
    this.cameraRig.reset(); this.input.clear(); this.active = true;
    this.updateSeatCamera();
    this.setUI();
    element<HTMLDialogElement>('explorer').close();
    element('world').focus();
    this.cameraRig.update(0, this.car, this.surface, world.origin, [0, 0]);
    return true;
  }

  stop(park = false): void {
    this.autopilot.cancel(); this.appliedThrottle = 0;
    this.boardingSurface = undefined;
    if (!this.active && !this.parked) return;
    this.parked = park;
    if (park) this.car.park();
    element('vehicle-trip').textContent = (this.car.trip / 1000).toFixed(2);
    this.active = false; this.input.clear();
    if (!park) this.surface = undefined;
    this.camera.fov = 65; this.camera.near = 0.5; this.camera.updateProjectionMatrix();
    this.mesh.root.visible = park; this.setUI();
  }

  exitLocation() {
    if (!this.active || !this.getWorld().roadReady || this.getWorld().searching) return undefined;
    if (this.car.motionSpeed > 0.1) { this.exitBlockedTime = 3; return undefined; }
    const point = this.surface?.exit(this.car);
    if (!point) this.exitBlockedTime = 3;
    return point;
  }

  canBoard(person: { x: number; y: number; z: number }): boolean {
    return this.parked && this.getWorld().roadReady && !this.getWorld().searching
      && Math.hypot(person.x - this.car.x, person.z - this.car.z) < this.car.profile.chassisLength / 2 + 4
      && !!this.surface?.canBoard(this.car, person);
  }

  nearbyVehicle(person: { x: number; y: number; z: number }): ParkedEntry | undefined {
    const world = this.getWorld();
    if (!world.roadReady || world.searching) return;
    if (this.boardingSurface?.world !== world) this.boardingSurface = { world, surface: new DrivingSurface(world) };
    const surface = this.boardingSurface.surface, fleet = world.parkedVehicles.fleet;
    let best: ParkedEntry | undefined, distance = this.parked ? Math.min(2.2, surface.boardingDistance(this.car, person)) : 2.2;
    const traffic = world.traffic.entries.filter(e => e.car.motionSpeed <= 0.1).map(e => ({ id: e.id, kind: e.car.kind, paint: e.car.paint,
      x: e.car.x, y: e.car.y, z: e.car.z, heading: e.car.heading, slot: -1, grade: 0, padHeading: e.car.heading }));
    for (const entry of [...fleet.entries, ...traffic]) {
      const gap = Math.hypot(entry.x - person.x, entry.z - person.z);
      if (gap > vehicleProfiles[entry.kind].chassisLength / 2 + 4) continue;
      const car = world.traffic.entries.find(e => e.id === entry.id)?.car ?? fleet.vehicle(entry);
      const doorDistance = surface.boardingDistance(car, person);
      if (doorDistance < distance) { best = entry; distance = doorDistance; }
    }
    return best;
  }

  prepareBoarding(entry: ParkedEntry): boolean {
    const world = this.getWorld();
    if (this.active || !world.roadReady || world.searching || !this.input.enabled) return false;
    const car = world.traffic.take(entry.id) ?? world.parkedVehicles.fleet.take(entry.id); if (!car) return false;
    for (const [, field] of driftTuning) car[field] = this.car[field];
    if (this.parked) world.parkedVehicles.fleet.park(this.car, this.fleetId);
    this.mesh.dispose(); this.car = car; this.fleetId = entry.id; this.mesh = new VehicleMesh(this.scene, car.profile);
    this.surface = new DrivingSurface(world); this.cabin = new CabinState(car.profile); this.crane = new CraneSystems();
    this.operations = new VehicleOperations(car.profile); this.systems.configure(car.profile.shape);
    if (car.profile.shape === 'roadster') this.systems.roofOpen = this.systems.roofTarget = car.roofOpen;
    this.parked = true; element<HTMLSelectElement>('vehicle-kind').value = car.kind;
    element<HTMLSelectElement>('suspension').value = String(car.suspension);
    element<HTMLSelectElement>('transmission-mode').value = car.transmission.mode;
    for (const [id, value] of [['suspension-damping', car.damping], ['vehicle-power', car.powerScale], ['vehicle-brake', car.brakeScale], ['vehicle-steering', car.steeringScale]] as const) {
      element<HTMLInputElement>(id).value = String(Math.round(value * 100)); element(`${id}-value`).textContent = `${Math.round(value * 100)}%`;
    }
    const paint = element<HTMLSelectElement>('vehicle-paint');
    paint.value = car.paint === car.profile.paint ? 'default' : car.paint.toString(16).padStart(6, '0');
    this.mesh.setPaint(car.paint);
    this.describeVehicle(); this.updateSeatCamera();
    return true;
  }

  get glassWater(): number { return this.mesh.glassWater; }
  get sweptWater(): number { return this.mesh.sweptWater; }

  reset(): void {
    this.autopilot.cancel();
    if (!this.active || !this.surface || !this.getWorld().roadReady || !this.cabin.driver || !this.crane.stowed) return;
    const spawn = this.surface.spawn(this.car.x, this.car.z, this.car.profile);
    if (!spawn) { this.explainSpace(); return; }
    this.car.reset(spawn.x, spawn.z, spawn.heading, this.surface.sample, true, spawn.trailerHeading);
    this.cameraRig.reset(); this.input.clear(); this.collisionTime = 0;
  }

  operate(action: VehicleOperation): void {
    const label = this.operations.label(action);
    if (!label) return;
    const ok = this.operations.toggle(action, this.car.motionSpeed, this.active && this.cabin.driver);
    element('operation-status').textContent = ok ? `${label}已${this.operations.target[action] ? '开启' : '关闭'}，关闭弹窗后继续动画。`
      : '请先进入驾驶位；车门、舱门与驻车支架需要停车后操作。';
    this.describeEquipment();
  }

  ignite(): void {
    if (!this.active || !this.cabin.driver) return;
    this.autopilot.cancel(); this.car.toggleIgnition(); this.describeEquipment();
  }

  private syncPilotOptions(): void {
    const settings = this.autopilot.settings;
    for (const [id, value] of [['mode', settings.mode], ['comfort', settings.comfort], ['min', settings.minKmh], ['max', settings.maxKmh]] as const)
      element<HTMLInputElement>(`autopilot-${id}`).value = String(value);
  }

  private toggleAutopilot(): void {
    if (this.autopilot.active) this.autopilot.cancel();
    else if (!this.active || !this.cabin.driver || !this.crane.stowed || !this.operations.driveReady || !this.getWorld().roadReady)
      this.autopilot.cancel('请在驾驶位收妥设备，并等待道路就绪');
    else if (this.autopilot.engage(this.car, this.getWorld().network.routes, this.getWorld().options) && this.autopilot.settings.mode !== 'steering') {
      this.car.transmission.mode = 'auto'; element<HTMLSelectElement>('transmission-mode').value = 'auto';
    }
    element('autopilot-settings-status').textContent = this.autopilot.status;
    this.describePilot();
  }

  private describePilot(): void {
    const pilot = this.autopilot, label = this.input.bindings.label('Autopilot');
    for (const id of ['autopilot-toggle', 'hud-autopilot']) {
      const button = element(id); button.setAttribute('aria-pressed', String(pilot.active));
      button.textContent = `${pilot.active ? '退出' : '开启'}自动驾驶 · ${label}${id === 'hud-autopilot' ? ` · ${pilotModes[pilot.settings.mode]} · ${pilot.active ? `${Math.round(pilot.targetKmh)} km/h · ` : ''}${pilot.status}` : ''}`;
    }
  }

  action(code: string): void {
    if (!this.active) return;
    if (this.autopilot.active && (['KeyS', 'Space', 'BracketLeft', 'BracketRight', 'Transmission'].includes(code)
      || code === 'KeyW' && this.autopilot.settings.mode !== 'steering'
      || ['KeyA', 'KeyD'].includes(code) && this.autopilot.settings.mode !== 'speed')) this.autopilot.cancel('驾驶员已接管');
    if (code === 'Autopilot') this.toggleAutopilot();
    if (code === 'AutoMode') {
      const modes = Object.keys(pilotModes) as AutopilotSettings['mode'][];
      this.autopilot.configure({ ...this.autopilot.settings, mode: modes[(modes.indexOf(this.autopilot.settings.mode) + 1) % modes.length] }); this.syncPilotOptions();
    }
    if (code === 'AutoSlower' || code === 'AutoFaster') {
      const s = this.autopilot.settings, maxKmh = Math.max(10, Math.min(160, s.maxKmh + (code === 'AutoFaster' ? 5 : -5)));
      this.autopilot.configure({ ...s, maxKmh, minKmh: Math.min(s.minKmh, maxKmh) }); this.syncPilotOptions();
    }
    if (code === 'Refill') this.systems.refill(this.car.motionSpeed);
    if (code === 'ViewReset') this.cameraRig.reset();
    if (code === 'Transmission' && this.cabin.driver) {
      this.car.transmission.mode = this.car.transmission.mode === 'auto' ? 'manual' : 'auto';
      element<HTMLSelectElement>('transmission-mode').value = this.car.transmission.mode;
    }
    for (const [action, id, step] of [['LightPower', 'light-power', 25], ['LightRange', 'light-range', 80]] as const) if (code === action) {
      const input = element<HTMLInputElement>(id), next = Number(input.value) + step;
      input.value = String(next > Number(input.max) ? Number(input.min) : next); input.dispatchEvent(new Event('input'));
    }
    if (code === 'F2') this.ignite();
    for (const action of ['doors', 'cargo', 'aux'] as const) if (code === operationKeys[action]) this.operate(action);
    if (code === 'KeyN') this.systems.cycleFan();
    if (code === 'KeyK' && this.systems.hasWindows) this.systems.ambientLight = !this.systems.ambientLight;
    if (code === 'KeyU' && this.systems.hasWindows) this.systems.cabinLight = !this.systems.cabinLight;
    if (code === 'KeyO' && this.car.kind === 'crane') this.crane.toggle(this.cabin.selected.role === 'operator', this.car.motionSpeed);
    if (code === 'Backspace') { this.cabin.resetAdjustment(); this.cameraRig.reset(); }
    if (this.cabin.driver && (code === 'BracketLeft' || code === 'BracketRight')) {
      this.car.transmission.mode = 'manual'; element<HTMLSelectElement>('transmission-mode').value = 'manual';
      this.car.transmission.shift(code === 'BracketRight' ? 1 : -1, this.car.speed);
    }
    if (code === 'KeyG') this.systems.wash();
    if (code === 'KeyT') this.systems.toggleRoof(this.car.motionSpeed);
    if (code === 'KeyR') this.reset();
    const signal: SignalMode | undefined = !this.cabin.driver ? undefined : code === 'KeyQ' ? 'left' : code === 'KeyE' ? 'right' : code === 'KeyH' ? 'hazard' : undefined;
    if (signal) this.systems.signal = this.systems.signal === signal ? 'off' : signal;
    if (code === 'KeyL') {
      const modes = Object.keys(lightNames) as LightMode[];
      this.systems.lights = modes[(modes.indexOf(this.systems.lights) + 1) % modes.length];
      element<HTMLSelectElement>('vehicle-lights').value = this.systems.lights;
    }
    if (code === 'KeyB' && this.systems.hasWindshield) {
      const modes = Object.keys(wiperNames) as WiperMode[];
      this.systems.wipers = modes[(modes.indexOf(this.systems.wipers) + 1) % modes.length];
      element<HTMLSelectElement>('vehicle-wipers').value = this.systems.wipers;
    }
    if (code === 'KeyC') {
      this.cameraRig.view = drivingViews[(drivingViews.indexOf(this.cameraRig.view) + 1) % drivingViews.length];
      element<HTMLSelectElement>('driving-view').value = this.cameraRig.view; this.cameraRig.reset();
    }
  }

  update(dt: number, frozen: boolean, wet: number): void {
    if (!this.active || !this.surface) return;
    const look = this.input.consumeLook(), world = this.getWorld();
    const focused = document.activeElement === element('world') && document.hasFocus();
    const waiting = !world.roadReady;
    const held = frozen || waiting || !focused;
    this.systemsDt = held ? 0 : dt;
    const axis = (positive: string, negative: string) => Number(this.input.down(positive)) - Number(this.input.down(negative));
    const operator = this.cabin.selected.role === 'operator';
    if (!held) {
      this.systems.moveWindow(axis('Period', 'Comma'), dt);
      this.cabin.adjust(axis('ArrowRight', 'ArrowLeft') * dt * 0.1, axis('ArrowUp', 'ArrowDown') * dt * 0.12,
        axis('PageUp', 'PageDown') * dt * 0.08, axis('End', 'Home') * dt * 0.2);
      if (this.car.kind === 'crane') this.crane.update(dt, { slew: axis('KeyD', 'KeyA'), lift: axis('KeyW', 'KeyS'),
        extend: axis('KeyE', 'KeyQ'), hoist: axis('KeyX', 'KeyZ') }, operator, this.car.motionSpeed);
      this.operations.update(dt);
      if (!this.cabin.driver || !this.crane.stowed || !this.operations.driveReady) this.car.park();
    }
    this.surface.wet = wet;
    this.surface.level = this.car.y - this.car.profile.radius - this.car.profile.rest;
    if (!held) {
      const canDrive = this.cabin.driver && this.crane.stowed && this.operations.driveReady;
      if (!canDrive) this.autopilot.cancel('设备或座位状态改变');
      const manual = { throttle: canDrive ? axis('KeyW', 'KeyS') : 0, steer: canDrive ? axis('KeyD', 'KeyA') : 0, handbrake: !canDrive || this.input.down('Space') };
      const obstacles = this.autopilot.active ? [...world.traffic.entries.map(e => e.car), ...world.parkedVehicles.fleet.entries
        .filter(e => Math.hypot(e.x - this.car.x, e.z - this.car.z) < 300).map(e => world.parkedVehicles.fleet.vehicle(e))] : [];
      const controls = this.autopilot.update(dt, this.car, world.network.routes, obstacles, manual, this.surface.sample(this.car.x, this.car.z).grip * this.car.gripScale);
      this.appliedThrottle = controls.throttle;
      const hit = this.car.update(dt, controls, this.surface.sample, this.surface.constrain);
      this.collisionTime = Math.max(0, this.collisionTime - dt);
      this.exitBlockedTime = Math.max(0, this.exitBlockedTime - dt);
      if (hit) { this.collisionTime = 1.2; if (this.autopilot.active) { this.autopilot.cancel('发生接触，请接管'); this.car.park(); } }
    }
    this.cameraRig.enclosed = this.car.kind === 'roadster' && this.systems.roofOpen < 0.95;
    this.updateSeatCamera();
    this.cameraRig.update(held ? 0 : dt, this.car, this.surface, world.origin, held ? [0, 0] : look);
    document.body.classList.toggle('in-cabin', this.cameraRig.view === 'cockpit');
    this.hudTime += dt;
    if (this.hudTime >= 0.1) {
      this.hudTime = 0;
      element('vehicle-speed').textContent = String(Math.round(this.car.motionSpeed * 3.6));
      element('vehicle-gear').textContent = this.car.parked ? 'P' : this.car.speed < -0.1 ? 'R' : this.car.speed > 0.1 ? 'D' : 'N';
      element('vehicle-trip').textContent = (this.car.trip / 1000).toFixed(2);
      element('transmission-status').textContent = `${this.car.transmission.mode === 'auto' ? 'AT' : 'MT'} · ${this.car.transmission.gear} 挡`;
      element('engine-rpm').textContent = String(Math.round(this.car.engineRpm / 10) * 10);
      this.describeEquipment();
      element('vehicle-status').textContent = frozen ? '已暂停' : waiting ? '等待道路生成' : !focused ? '点击画面继续旅程'
        : !this.cabin.driver ? `${this.cabin.selected.label} · P 换座${operator ? ' · O 操作吊车' : ' · 不能驾驶'}`
        : !this.crane.stowed ? '吊车未收妥 · 请回操作席按 O 收车'
        : !this.operations.driveReady ? '车门 / 舱门 / 支架未收妥 · J / Y / I 关闭'
        : this.exitBlockedTime > 0 ? '请停稳车辆，并在车旁有空位时下车'
        : this.car.ignition === 'off' ? '发动机已熄火 · F2 点火'
        : this.car.ignition === 'starting' ? '点火中 · 请稍候'
        : this.car.jackknifed ? '铰接角过大 · 向前回正' : this.collisionTime > 0 ? '注意整车转弯空间 · R 回正'
        : this.car.drifting ? `漂移 ${Math.round(Math.abs(this.car.slipAngle) * 180 / Math.PI)}° · 松开 Space，反打方向回正`
        : this.car.handbrake > 0.05 ? this.car.motionSpeed > 0.5 ? '手刹 · 转向可甩尾' : '手刹驻车'
        : this.car.braking ? '制动' : this.car.parked ? 'W 起步 · S 倒车'
          : this.cameraRig.view === 'chase' ? '跟车视角' : this.cameraRig.view === 'cockpit' ? '驾驶舱' : '引擎盖视角';
      element('vehicle-status').textContent = this.input.bindings.format(element('vehicle-status').textContent!);
      this.describePilot();
      const speedRatio = Math.min(1, this.car.motionSpeed / this.car.maxSpeed);
      element('speed-line').style.transform = `scaleX(${speedRatio})`;
      element('dial-progress').style.strokeDasharray = `${speedRatio * 100} 100`;
      element('dial-needle').setAttribute('transform', `rotate(${speedRatio * 240} 100 83)`);
      element('hud-mode').textContent = operator ? 'CRANE' : this.cabin.driver ? 'DRIVE' : 'PASSENGER';
      element('drive-hud').classList.toggle('braking', this.car.braking);
      element('suspension-compression').textContent = `轮端压缩 ${this.car.wheels.map(w => Math.round(w.compression * 100)).join(' / ')} cm`
        + (this.car.trailer ? ` · 挂车 ${this.car.trailer.wheels.map(w => Math.round(w.compression * 100)).join(' / ')} cm` : '');
    }
  }

  sync(night: number, rain: number, dt = 0): void {
    this.car.roofOpen = this.systems.roofOpen;
    element<HTMLButtonElement>('drive-toggle').disabled = !this.input.enabled || (!this.active && (!this.getWorld().roadReady || this.getWorld().searching));
    if (this.parked) {
      const world = this.getWorld();
      this.mesh.root.visible = Math.hypot(this.car.x - world.origin.x - this.camera.position.x, this.car.z - world.origin.z - this.camera.position.z) < 250;
      if (this.mesh.root.visible) {
        const sheltered = this.surface?.inTunnel(this.car.x, this.car.z, 0) ? 1 : 0;
        this.systems.update(dt, Math.max(night, sheltered), rain, sheltered, this.car.steering, this.car.motionSpeed);
        this.operations.update(dt);
        if (this.car.kind === 'crane') this.crane.update(dt, { slew: 0, lift: 0, extend: 0, hoist: 0 }, false, 0);
        this.mesh.sync(this.car, world.origin, this.systems, dt, this.crane, this.operations);
      }
    }
    if (this.active) {
      const sheltered = this.surface?.inTunnel(this.car.x, this.car.z, 0) ? 1 : 0;
      this.systems.update(this.systemsDt, Math.max(night, sheltered), rain, sheltered, this.car.steering, this.car.motionSpeed);
      element<HTMLSelectElement>('vehicle-signals').value = this.systems.signal;
      element('turn-left').classList.toggle('lit', this.systems.leftSignal);
      element('turn-right').classList.toggle('lit', this.systems.rightSignal);
      element('turn-left').setAttribute('aria-label', this.systems.leftSignal ? '左转灯亮' : '左转灯灭');
      element('turn-right').setAttribute('aria-label', this.systems.rightSignal ? '右转灯亮' : '右转灯灭');
      this.mesh.root.visible = true; this.mesh.sync(this.car, this.getWorld().origin, this.systems, this.systemsDt, this.crane, this.operations);
      element('vehicle-lights-status').textContent = `${this.systems.lights === 'auto' ? '自动 · ' : ''}${lightNames[this.systems.beam]}灯`;
      element('vehicle-lights-status').classList.toggle('high-beam', this.systems.beam === 'high');
      element('vehicle-wipers-status').textContent = this.systems.hasWindshield ? `雨刮 · ${wiperNames[this.systems.wipers]}` : '无雨刮';
    }
  }

  private selectVehicle(kind: VehicleKind): void {
    if (kind === this.car.kind) return;
    const next = new VehiclePhysics(kind);
    next.suspension = this.car.suspension; next.damping = this.car.damping; next.trip = this.car.trip;
    next.powerScale = this.car.powerScale; next.brakeScale = this.car.brakeScale; next.steeringScale = this.car.steeringScale;
    for (const [, field] of driftTuning) next[field] = this.car[field];
    next.setSpeedLimit(this.car.speedLimit === undefined ? undefined : this.car.maxSpeed * 3.6);
    next.steeringAssist = this.car.steeringAssist; next.steeringAssistStrength = this.car.steeringAssistStrength;
    next.transmission.mode = this.car.transmission.mode;
    if (this.active && this.surface) {
      const spawn = this.getWorld().roadReady ? this.surface.spawn(this.car.x, this.car.z, next.profile) : undefined;
      if (!spawn) {
        element<HTMLSelectElement>('vehicle-kind').value = this.car.kind;
        element('vehicle-summary').textContent = '当前路段尚未就绪或容不下这辆车，请选择更宽的道路后重试。'; return;
      }
      next.reset(spawn.x, spawn.z, spawn.heading, this.surface.sample, true, spawn.trailerHeading);
    }
    this.autopilot.cancel(); this.parked = false;
    this.fleetId = undefined;
    this.mesh.dispose(); this.car = next; this.mesh = new VehicleMesh(this.scene, next.profile);
    this.cabin = new CabinState(next.profile); this.crane = new CraneSystems(); this.updateSeatCamera();
    this.operations = new VehicleOperations(next.profile);
    this.systems.configure(next.profile.shape);
    this.applyPaint();
    this.cameraRig.reset(); this.input.clear(); this.collisionTime = 0; this.describeVehicle();
  }

  private describeVehicle(): void {
    const p = this.car.profile;
    element('hud-vehicle-name').textContent = p.name;
    this.describeTuning();
    this.systems.hasWindshield = p.shape !== 'motorcycle';
    this.describeEquipment();
    element<HTMLSelectElement>('vehicle-wipers').disabled = !this.systems.hasWindshield;
    element('vehicle-wipers-help').textContent = this.systems.hasWindshield ? '自动按雨量调速；间歇每次刮动后停顿。关闭后完成当前刮动并归位。' : '此摩托车没有挡风玻璃，不提供雨刮。';
    this.describeSuspension();
    const power = p.power * this.car.powerScale;
    element('vehicle-summary').textContent = `${p.length} m · ${(p.mass / 1000).toLocaleString('zh-CN')} 吨 · ${p.wheels.length + (p.trailer?.wheels.length ?? 0)} 轮 · ${Math.round(power / 1000)} kW / ${Math.round(power / 735.5)} 马力。`
      + (p.shape === 'crane' ? '五轴底盘、双前轴转向；停车按 P 进入后部操作席，O 展开或收车，收妥才能驾驶。'
        : p.shape === 'flatbed' ? '四轴底盘、双前轴转向，开放货台与折叠坡板，窄弯留足车尾空间。'
          : p.trailer ? '半挂有内轮差和倒车折叠，窄弯请放慢并留足外侧空间。' : p.shape === 'motorcycle' ? '两轮独立悬挂，转弯自动侧倾，低速自动平衡。' : p.mass > 4000 ? '重车加速较慢，陡坡与湿路请提前减速。' : '五档弹簧与阻尼按车型匹配。');
    element('camera-distance-value').textContent = `${Number(this.cameraRig.distanceFor(this.car).toFixed(1))} m`;
  }

  private applyPaint(): void {
    const value = element<HTMLSelectElement>('vehicle-paint').value;
    this.car.paint = value === 'default' ? this.car.profile.paint : parseInt(value, 16);
    this.mesh.setPaint(this.car.paint);
  }

  describeTuning(): void {
    const kmh = Math.round(this.car.maxSpeed * 3.6);
    element('dial-max').textContent = String(kmh);
    element<HTMLInputElement>('vehicle-max-speed').value = String(kmh);
    element('vehicle-max-speed-value').textContent = `${kmh} km/h${this.car.speedLimit === undefined ? ' · 车型默认' : ''}`;
    element<HTMLInputElement>('steering-assist').checked = this.car.steeringAssist;
    const strength = element<HTMLInputElement>('steering-assist-strength');
    strength.value = String(Math.round(this.car.steeringAssistStrength * 100)); strength.disabled = !this.car.steeringAssist;
    element('steering-assist-strength-value').textContent = `${strength.value}%${this.car.steeringAssist ? '' : ' · 已关闭'}`;
    for (const [id, field] of driftTuning) {
      const value = String(Math.round(this.car[field] * 100));
      element<HTMLInputElement>(id).value = value; element(`${id}-value`).textContent = `${value}%`;
    }
  }

  describeEquipment(): void {
    const ignition = this.car.ignition;
    for (const id of ['vehicle-ignition', 'panel-ignition']) {
      const button = element<HTMLButtonElement>(id); button.disabled = !this.active || !this.cabin.driver;
      button.textContent = `${ignition === 'off' ? '点火' : ignition === 'starting' ? '取消点火' : '熄火'} · F2`;
      button.setAttribute('aria-pressed', String(ignition !== 'off'));
    }
    element('ignition-status').textContent = ignition === 'running' ? '发动机运转' : ignition === 'starting' ? '正在点火' : '发动机关闭';
    const s = this.systems, glass = this.car.kind !== 'motorcycle', roof = this.car.kind === 'roadster';
    for (const action of ['doors', 'cargo', 'aux'] as const) for (const prefix of ['vehicle', 'panel']) {
      const node = element<HTMLButtonElement>(`${prefix}-${action}`), label = this.operations.label(action);
      node.hidden = !label; node.disabled = !this.active || !this.cabin.driver || this.operations.accessing
        || (action !== 'aux' || this.car.kind === 'motorcycle') && this.car.motionSpeed > 0.1;
      node.textContent = `${label} · ${this.operations.target[action] ? '收起 / 关闭' : '展开 / 开启'} · ${this.input.bindings.label(operationKeys[action])}`;
      node.setAttribute('aria-pressed', String(!!this.operations.target[action]));
    }
    element<HTMLButtonElement>('vehicle-reset').disabled = !this.active || !this.cabin.driver || !this.crane.stowed;
    element<HTMLInputElement>('vehicle-windows').disabled = !glass;
    element<HTMLButtonElement>('vehicle-roof').disabled = !roof || this.car.motionSpeed > 1.4;
    element<HTMLButtonElement>('washer').disabled = !glass || s.washerFluid <= 0;
    element<HTMLButtonElement>('washer-refill').disabled = !glass || this.car.motionSpeed > 0.1;
    element<HTMLButtonElement>('cabin-light').disabled = !glass;
    element<HTMLButtonElement>('ambient-light').disabled = !glass;
    element<HTMLSelectElement>('cabin-fan').disabled = !glass;
    element<HTMLSelectElement>('cabin-fan').value = String(s.fan);
    element<HTMLInputElement>('vehicle-windows').value = String(Math.round(s.windowTarget * 100));
    element('ambient-light').setAttribute('aria-pressed', String(s.ambientLight));
    element('ambient-light').textContent = `氛围描边灯 · ${s.ambientLight ? '开启' : '关闭'} · K`;
    element('vehicle-windows-value').textContent = !glass ? '无车窗' : s.windowTarget === 0 ? '关闭' : `开启 ${Math.round(s.windowTarget * 100)}%`;
    element('vehicle-roof').textContent = roof ? s.roofTarget > 0.5 ? '关闭敞篷 · T' : '打开敞篷 · T' : '当前车型无敞篷';
    element('vehicle-roof').setAttribute('aria-pressed', String(roof && s.roofTarget === 0));
    element('cabin-light').textContent = `阅读灯 · ${s.cabinLight ? '开启' : '关闭'} · U`;
    element('cabin-light').setAttribute('aria-pressed', String(s.cabinLight));
    element('washer-status').textContent = glass ? `玻璃水 ${s.washerFluid.toFixed(2)} L / 3 L${s.washerFluid < 0.2 ? ' · 请停车补液' : ''}` : '无挡风玻璃，无需玻璃水';
    const status = !glass ? '摩托车 · 开放座舱' : `${roof ? s.roofOpen > 0.99 ? '敞篷开启' : s.roofOpen < 0.01 ? '车顶关闭' : '车顶收合中' : '封闭车身'} · 车窗开启 ${Math.round(s.windowOpen * 100)}%`;
    element('equipment-status').textContent = `${status}${s.equipmentMoving ? ' · 关闭设置后继续动画' : ''}`;
    element('cabin-status').textContent = `${status}${glass ? ` · 玻璃水 ${s.washerFluid.toFixed(1)} L` : ''}`;
    element('seat-reading').textContent = `${this.cabin.selected.label} · ${this.cabin.driver ? '驾驶权限' : '乘坐模式'} · 风速 ${glass ? s.fan : 0} / 6`;
    element('radio-reading').textContent = `CH ${s.radioChannel} · ${radioStations[s.radioChannel - 1].name}${s.radioPlaying ? '' : ' · 静音'}`;
    const a = this.cabin.adjustment;
    element('seat-adjustment').textContent = `横移 ${Math.round(a.x * 100)} cm · 前后 ${Math.round(a.along * 100)} cm · 高度 ${Math.round(a.height * 100)} cm · 靠背 ${Math.round(a.recline * 180 / Math.PI)}°`;
    element('crane-controls').hidden = this.car.kind !== 'crane';
    element<HTMLButtonElement>('crane-power').disabled = !this.active || this.cabin.selected.role !== 'operator' || this.car.motionSpeed > 0.1;
    element('crane-power').textContent = this.crane.enabled ? '收回吊臂与支腿 · O' : '展开支腿并启动 · O';
    element('crane-status').textContent = this.crane.stowed ? '收妥 · 可以驾驶' : `${this.crane.enabled ? '操作中' : '自动收车中'} · 支腿 ${Math.round(this.crane.deployment * 100)}% · 仰角 ${Math.round(this.crane.angle * 180 / Math.PI)}° · 伸出 ${this.crane.extension.toFixed(1)} m`;
    for (const id of ['vehicle-ignition', 'panel-ignition', 'ambient-light', 'vehicle-roof', 'cabin-light', 'crane-power'])
      element(id).textContent = this.input.bindings.format(element(id).textContent!);
  }

  selectSeat(id: string): boolean {
    if (!this.active || !this.cabin.select(id, this.car.motionSpeed)) return false;
    this.autopilot.cancel(); this.car.park(); this.cameraRig.view = 'cockpit'; this.cameraRig.reset(); this.input.clear();
    element<HTMLSelectElement>('driving-view').value = 'cockpit'; this.updateSeatCamera(); return true;
  }

  private updateSeatCamera(): void {
    this.cameraRig.seat = this.cabin.selected; this.cameraRig.adjustment = this.cabin.adjustment;
    this.cameraRig.seatYaw = this.cabin.selected.role === 'operator' ? this.crane.yaw : 0;
  }

  private describeSuspension(): void {
    const p = this.car.profile, tuning = suspensionTuning(this.car.suspension, p, this.car.damping);
    element('suspension-damping-value').textContent = `${Math.round(this.car.damping * 100)}%`;
    element('suspension-summary').textContent = `${(Math.sqrt(tuning.spring) / (Math.PI * 2)).toFixed(2)} Hz · 行程 ${Math.round(p.travel * 100)} cm。阻尼越高，回弹越慢；100% 为车型推荐值。`;
  }

  private explainSpace(): void {
    element<HTMLDialogElement>('explorer').showModal();
    element('vehicle-summary').textContent = '附近道路容不下这辆车，请选择较小载具或更宽的道路。';
    element('vehicle-kind').closest<HTMLDetailsElement>('details')!.open = true;
    this.input.clear(); element('vehicle-kind').focus();
  }

  private setUI(): void {
    document.body.classList.toggle('driving', this.active);
    document.body.classList.toggle('in-cabin', this.active && this.cameraRig.view === 'cockpit');
    element('drive-toggle').textContent = this.active ? '退出驾驶' : '开始驾驶';
    element('drive-toggle').setAttribute('aria-pressed', String(this.active));
    element('drive-hud').hidden = !this.active;
    element('flight-controls').hidden = this.active;
    element('driving-controls').hidden = !this.active;
    element<HTMLButtonElement>('vehicle-reset').disabled = !this.active || !this.cabin.driver || !this.crane.stowed;
    element('world').setAttribute('aria-label', this.active ? '山路驾驶；W 加速，S 刹车倒车，A D 转向，Space 手刹，C 切换视角，F 下车，L 车灯，B 雨刮，R 回到道路' : '无限山地 3D 视图；拖动鼠标观察，WASD 飞行');
  }

  dispose(): void { this.events.abort(); this.mesh.dispose(); document.body.classList.remove('driving', 'in-cabin'); }
}
