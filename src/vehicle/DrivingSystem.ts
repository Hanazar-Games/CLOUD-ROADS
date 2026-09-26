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

export class DrivingSystem {
  car = new VehiclePhysics();
  readonly systems = new VehicleSystems();
  readonly cameraRig;
  active = false;
  parked = false;
  private mesh;
  private readonly events = new AbortController();
  private surface: DrivingSurface | undefined;
  private collisionTime = 0;
  private exitBlockedTime = 0;
  private hudTime = 0;
  private systemsDt = 0;

  constructor(private readonly scene: Scene, private readonly camera: PerspectiveCamera, private readonly input: InputManager, private readonly getWorld: () => World) {
    this.mesh = new VehicleMesh(scene);
    this.cameraRig = new DrivingCamera(camera);
    const options = { signal: this.events.signal };
    const selector = element<HTMLSelectElement>('vehicle-kind');
    selector.replaceChildren(...Object.entries(vehicleProfiles).map(([kind, profile]) => new Option(profile.name, kind)));
    element<HTMLSelectElement>('suspension').replaceChildren(...suspensionLevels.map(level => new Option(suspensionNames[level], String(level), level === 3, level === 3)));
    selector.addEventListener('change', () => {
      if (Object.hasOwn(vehicleProfiles, selector.value)) this.selectVehicle(selector.value as VehicleKind);
    }, options);
    this.describeVehicle();
    this.systems.configure(this.car.profile.shape);
    element('transmission-mode').addEventListener('change', () => {
      this.car.transmission.mode = element<HTMLSelectElement>('transmission-mode').value === 'manual' ? 'manual' : 'auto';
    }, options);
    element('vehicle-windows').addEventListener('input', () => { this.systems.windowTarget = Number(element<HTMLInputElement>('vehicle-windows').value) / 100; this.describeEquipment(); }, options);
    element('vehicle-roof').addEventListener('click', () => { this.systems.toggleRoof(this.car.speed); this.describeEquipment(); }, options);
    element('washer').addEventListener('click', () => { this.systems.wash(); this.describeEquipment(); }, options);
    element('washer-refill').addEventListener('click', () => { this.systems.refill(this.car.speed); this.describeEquipment(); }, options);
    element('cabin-light').addEventListener('click', () => { this.systems.cabinLight = !this.systems.cabinLight; this.describeEquipment(); }, options);
    element('cabin-fan').addEventListener('change', () => { this.systems.fan = Number(element<HTMLSelectElement>('cabin-fan').value); }, options);
    const tuning = [['vehicle-power', 'powerScale'], ['vehicle-brake', 'brakeScale'], ['vehicle-steering', 'steeringScale']] as const;
    for (const [id, field] of tuning) element(id).addEventListener('input', () => {
      this.car[field] = Number(element<HTMLInputElement>(id).value) / 100;
      element(`${id}-value`).textContent = `${Math.round(this.car[field] * 100)}%`;
      this.describeVehicle();
    }, options);
    element('vehicle-tuning-reset').addEventListener('click', () => {
      for (const [id, field] of tuning) {
        this.car[field] = 1; element<HTMLInputElement>(id).value = '100'; element(`${id}-value`).textContent = '100%';
      }
      this.describeVehicle();
    }, options);
    element('vehicle-paint').addEventListener('change', () => this.applyPaint(), options);
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
    }
    this.parked = false; this.exitBlockedTime = 0; this.hudTime = 0.1;
    this.cameraRig.reset(); this.input.clear(); this.active = true;
    this.setUI();
    element<HTMLDialogElement>('explorer').close();
    element('world').focus();
    this.cameraRig.update(0, this.car, this.surface, world.origin, [0, 0]);
    return true;
  }

  stop(park = false): void {
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
    const point = this.surface?.exit(this.car);
    if (!point) this.exitBlockedTime = 3;
    return point;
  }

  canBoard(person: { x: number; y: number; z: number }): boolean {
    return this.parked && this.getWorld().roadReady && !this.getWorld().searching
      && Math.hypot(person.x - this.car.x, person.z - this.car.z) < this.car.profile.chassisLength / 2 + 4
      && !!this.surface?.canBoard(this.car, person);
  }

  get glassWater(): number { return this.mesh.glassWater; }
  get sweptWater(): number { return this.mesh.sweptWater; }

  reset(): void {
    if (!this.active || !this.surface || !this.getWorld().roadReady) return;
    const spawn = this.surface.spawn(this.car.x, this.car.z, this.car.profile);
    if (!spawn) { this.explainSpace(); return; }
    this.car.reset(spawn.x, spawn.z, spawn.heading, this.surface.sample, true, spawn.trailerHeading);
    this.cameraRig.reset(); this.input.clear(); this.collisionTime = 0;
  }

  action(code: string): void {
    if (!this.active) return;
    if (code === 'BracketLeft' || code === 'BracketRight') {
      this.car.transmission.mode = 'manual'; element<HTMLSelectElement>('transmission-mode').value = 'manual';
      this.car.transmission.shift(code === 'BracketRight' ? 1 : -1, this.car.speed);
    }
    if (code === 'KeyG') this.systems.wash();
    if (code === 'KeyT') this.systems.toggleRoof(this.car.speed);
    if (code === 'KeyJ' && this.systems.hasWindows) {
      this.systems.windowTarget = this.systems.windowTarget > 0.5 ? 0 : 1;
      element<HTMLInputElement>('vehicle-windows').value = String(this.systems.windowTarget * 100);
    }
    if (code === 'KeyR') this.reset();
    const signal: SignalMode | undefined = code === 'KeyQ' ? 'left' : code === 'KeyE' ? 'right' : code === 'KeyH' ? 'hazard' : undefined;
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
    this.surface.wet = wet;
    this.surface.level = this.car.y - this.car.profile.radius - this.car.profile.rest;
    if (!held) {
      const x = this.car.x, z = this.car.z, trip = this.car.trip;
      this.car.update(dt, { throttle: Number(this.input.down('KeyW')) - Number(this.input.down('KeyS')),
        steer: Number(this.input.down('KeyD')) - Number(this.input.down('KeyA')), handbrake: this.input.down('Space') }, this.surface.sample);
      this.collisionTime = Math.max(0, this.collisionTime - dt);
      this.exitBlockedTime = Math.max(0, this.exitBlockedTime - dt);
      if (this.surface.constrain(this.car, x, z, dt)) {
        this.collisionTime = 1.2;
        this.car.trip = trip + Math.min(this.car.trip - trip, Math.hypot(this.car.x - x, this.car.z - z));
      }
    }
    this.cameraRig.enclosed = this.car.kind === 'roadster' && this.systems.roofOpen < 0.95;
    this.cameraRig.update(held ? 0 : dt, this.car, this.surface, world.origin, held ? [0, 0] : look);
    this.hudTime += dt;
    if (this.hudTime >= 0.1) {
      this.hudTime = 0;
      element('vehicle-speed').textContent = String(Math.round(Math.abs(this.car.speed) * 3.6));
      element('vehicle-gear').textContent = this.car.parked ? 'P' : this.car.speed < -0.1 ? 'R' : this.car.speed > 0.1 ? 'D' : 'N';
      element('vehicle-trip').textContent = (this.car.trip / 1000).toFixed(2);
      element('transmission-status').textContent = `${this.car.transmission.mode === 'auto' ? 'AT' : 'MT'} · ${this.car.transmission.gear} 挡`;
      element('engine-rpm').textContent = String(Math.round(this.car.transmission.rpm / 10) * 10);
      this.describeEquipment();
      element('vehicle-status').textContent = frozen ? '已暂停' : waiting ? '等待道路生成' : !focused ? '点击画面继续驾驶'
        : this.exitBlockedTime > 0 ? '车旁空间不足，请移到平缓路段再下车'
        : this.car.jackknifed ? '铰接角过大 · 向前回正' : this.collisionTime > 0 ? '注意整车转弯空间 · R 回正' : this.car.braking ? '制动' : this.car.parked ? 'W 起步 · S 倒车'
          : this.cameraRig.view === 'chase' ? '跟车视角' : this.cameraRig.view === 'cockpit' ? '驾驶舱' : '引擎盖视角';
      element('speed-line').style.transform = `scaleX(${Math.min(1, Math.abs(this.car.speed) / this.car.profile.maxSpeed)})`;
      element('drive-hud').classList.toggle('braking', this.car.braking);
      element('suspension-compression').textContent = `轮端压缩 ${this.car.wheels.map(w => Math.round(w.compression * 100)).join(' / ')} cm`
        + (this.car.trailer ? ` · 挂车 ${this.car.trailer.wheels.map(w => Math.round(w.compression * 100)).join(' / ')} cm` : '');
    }
  }

  sync(night: number, rain: number, dt = 0): void {
    element<HTMLButtonElement>('drive-toggle').disabled = !this.input.enabled || (!this.active && (!this.getWorld().roadReady || this.getWorld().searching));
    if (this.parked) {
      const world = this.getWorld();
      this.mesh.root.visible = Math.hypot(this.car.x - world.origin.x - this.camera.position.x, this.car.z - world.origin.z - this.camera.position.z) < 250;
      if (this.mesh.root.visible) {
        const sheltered = this.surface?.inTunnel(this.car.x, this.car.z, 0) ? 1 : 0;
        this.systems.update(dt, Math.max(night, sheltered), rain, sheltered, this.car.steering, this.car.speed);
        this.mesh.sync(this.car, world.origin, this.systems, dt);
      }
    }
    if (this.active) {
      const sheltered = this.surface?.inTunnel(this.car.x, this.car.z, 0) ? 1 : 0;
      this.systems.update(this.systemsDt, Math.max(night, sheltered), rain, sheltered, this.car.steering, this.car.speed);
      element<HTMLSelectElement>('vehicle-signals').value = this.systems.signal;
      element('turn-left').classList.toggle('lit', this.systems.leftSignal);
      element('turn-right').classList.toggle('lit', this.systems.rightSignal);
      element('turn-left').setAttribute('aria-label', this.systems.leftSignal ? '左转灯亮' : '左转灯灭');
      element('turn-right').setAttribute('aria-label', this.systems.rightSignal ? '右转灯亮' : '右转灯灭');
      this.mesh.root.visible = true; this.mesh.sync(this.car, this.getWorld().origin, this.systems, this.systemsDt);
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
    next.transmission.mode = this.car.transmission.mode;
    if (this.active && this.surface) {
      const spawn = this.getWorld().roadReady ? this.surface.spawn(this.car.x, this.car.z, next.profile) : undefined;
      if (!spawn) {
        element<HTMLSelectElement>('vehicle-kind').value = this.car.kind;
        element('vehicle-summary').textContent = '当前路段尚未就绪或容不下这辆车，请选择更宽的道路后重试。'; return;
      }
      next.reset(spawn.x, spawn.z, spawn.heading, this.surface.sample, true, spawn.trailerHeading);
    }
    this.parked = false;
    this.mesh.dispose(); this.car = next; this.mesh = new VehicleMesh(this.scene, next.profile);
    this.systems.configure(next.profile.shape);
    this.applyPaint();
    this.cameraRig.reset(); this.input.clear(); this.collisionTime = 0; this.describeVehicle();
  }

  private describeVehicle(): void {
    const p = this.car.profile;
    this.systems.hasWindshield = p.shape !== 'motorcycle';
    this.describeEquipment();
    element<HTMLSelectElement>('vehicle-wipers').disabled = !this.systems.hasWindshield;
    element('vehicle-wipers-help').textContent = this.systems.hasWindshield ? '自动按雨量调速；间歇每次刮动后停顿。关闭后完成当前刮动并归位。' : '此摩托车没有挡风玻璃，不提供雨刮。';
    this.describeSuspension();
    const power = p.power * this.car.powerScale;
    element('vehicle-summary').textContent = `${p.length} m · ${(p.mass / 1000).toLocaleString('zh-CN')} 吨 · ${p.wheels.length + (p.trailer?.wheels.length ?? 0)} 轮 · ${Math.round(power / 1000)} kW / ${Math.round(power / 735.5)} 马力。`
      + (p.shape === 'crane' ? '五轴底盘、双前轴转向，吊臂与支腿收拢行驶；当前不支持吊装操作。'
        : p.shape === 'flatbed' ? '四轴底盘、双前轴转向，开放货台与折叠坡板，窄弯留足车尾空间。'
          : p.trailer ? '半挂有内轮差和倒车折叠，窄弯请放慢并留足外侧空间。' : p.shape === 'motorcycle' ? '两轮独立悬挂，转弯自动侧倾，低速自动平衡。' : p.mass > 4000 ? '重车加速较慢，陡坡与湿路请提前减速。' : '五档弹簧与阻尼按车型匹配。');
    element('camera-distance-value').textContent = `${Number(this.cameraRig.distanceFor(this.car).toFixed(1))} m`;
  }

  private applyPaint(): void {
    const value = element<HTMLSelectElement>('vehicle-paint').value;
    this.mesh.setPaint(value === 'default' ? this.car.profile.paint : parseInt(value, 16));
  }

  describeEquipment(): void {
    const s = this.systems, glass = this.car.kind !== 'motorcycle', roof = this.car.kind === 'roadster';
    element<HTMLInputElement>('vehicle-windows').disabled = !glass;
    element<HTMLButtonElement>('vehicle-roof').disabled = !roof || Math.abs(this.car.speed) > 1.4;
    element<HTMLButtonElement>('washer').disabled = !glass || s.washerFluid <= 0;
    element<HTMLButtonElement>('washer-refill').disabled = !glass || Math.abs(this.car.speed) > 0.1;
    element<HTMLButtonElement>('cabin-light').disabled = !glass;
    element<HTMLSelectElement>('cabin-fan').disabled = !glass;
    element('vehicle-windows-value').textContent = !glass ? '无车窗' : s.windowTarget === 0 ? '关闭' : `开启 ${Math.round(s.windowTarget * 100)}%`;
    element('vehicle-roof').textContent = roof ? s.roofTarget > 0.5 ? '关闭敞篷 · T' : '打开敞篷 · T' : '当前车型无敞篷';
    element('vehicle-roof').setAttribute('aria-pressed', String(roof && s.roofTarget === 0));
    element('cabin-light').textContent = `阅读灯 · ${s.cabinLight ? '开启' : '关闭'}`;
    element('cabin-light').setAttribute('aria-pressed', String(s.cabinLight));
    element('washer-status').textContent = glass ? `玻璃水 ${s.washerFluid.toFixed(2)} L / 3 L${s.washerFluid < 0.2 ? ' · 请停车补液' : ''}` : '无挡风玻璃，无需玻璃水';
    const status = !glass ? '摩托车 · 开放座舱' : `${roof ? s.roofOpen > 0.99 ? '敞篷开启' : s.roofOpen < 0.01 ? '车顶关闭' : '车顶收合中' : '封闭车身'} · 车窗开启 ${Math.round(s.windowOpen * 100)}%`;
    element('equipment-status').textContent = `${status}${s.equipmentMoving ? ' · 关闭设置后继续动画' : ''}`;
    element('cabin-status').textContent = `${status}${glass ? ` · 玻璃水 ${s.washerFluid.toFixed(1)} L` : ''}`;
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
    element('drive-toggle').textContent = this.active ? '退出驾驶' : '开始驾驶';
    element('drive-toggle').setAttribute('aria-pressed', String(this.active));
    element('drive-hud').hidden = !this.active;
    element('flight-controls').hidden = this.active;
    element('driving-controls').hidden = !this.active;
    element<HTMLButtonElement>('vehicle-reset').disabled = !this.active;
    element('world').setAttribute('aria-label', this.active ? '山路驾驶；W 加速，S 刹车倒车，A D 转向，Space 手刹，C 切换视角，F 下车，L 车灯，B 雨刮，R 回到道路' : '无限山地 3D 视图；拖动鼠标观察，WASD 飞行');
  }

  dispose(): void { this.events.abort(); this.mesh.dispose(); document.body.classList.remove('driving'); }
}
