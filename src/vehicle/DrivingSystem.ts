import type { PerspectiveCamera, Scene } from 'three';
import { DrivingCamera, drivingViews, type DrivingView } from '../camera/DrivingCamera';
import { element } from '../debug/DebugUI';
import type { InputManager } from '../input/InputManager';
import type { World } from '../world/World';
import { DrivingSurface } from './DrivingSurface';
import { VehicleMesh } from './VehicleMesh';
import { VehiclePhysics, type Suspension } from './VehiclePhysics';

export class DrivingSystem {
  readonly car = new VehiclePhysics();
  readonly cameraRig;
  active = false;
  private readonly mesh;
  private readonly events = new AbortController();
  private surface: DrivingSurface | undefined;
  private collisionTime = 0;
  private hudTime = 0;

  constructor(scene: Scene, private readonly camera: PerspectiveCamera, private readonly input: InputManager, private readonly getWorld: () => World) {
    this.mesh = new VehicleMesh(scene);
    this.cameraRig = new DrivingCamera(camera);
    const options = { signal: this.events.signal };
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
      element('camera-distance-value').textContent = `${this.cameraRig.distance} m`;
    }, options);
    element('camera-height').addEventListener('input', () => {
      this.cameraRig.height = Number(element<HTMLInputElement>('camera-height').value);
      element('camera-height-value').textContent = `${this.cameraRig.height > 0 ? '+' : ''}${Math.round(this.cameraRig.height * 100)} cm`;
    }, options);
    element('suspension').addEventListener('change', () => {
      const value = element<HTMLSelectElement>('suspension').value as Suspension;
      if (['soft', 'balanced', 'firm'].includes(value)) this.car.suspension = value;
    }, options);
    element('vehicle-reset').addEventListener('click', () => { this.reset(); element('world').focus(); }, options);
    element('view-reset').addEventListener('click', () => { this.cameraRig.reset(); element('world').focus(); }, options);
  }

  start(): boolean {
    const world = this.getWorld();
    if (!world.roadReady || world.searching || !this.input.enabled) return false;
    this.surface = new DrivingSurface(world);
    const spawn = this.surface.spawn(this.camera.position.x + world.origin.x, this.camera.position.z + world.origin.z);
    if (!spawn) return false;
    this.car.reset(spawn.x, spawn.z, spawn.heading, this.surface.sample);
    this.cameraRig.reset(); this.input.clear(); this.active = true;
    this.setUI();
    element('explorer').hidden = true;
    element('controls-toggle').setAttribute('aria-expanded', 'false');
    element('controls-toggle').textContent = '展开面板';
    element('world').focus();
    this.cameraRig.update(0, this.car, this.surface, world.origin, [0, 0]);
    return true;
  }

  stop(): void {
    if (!this.active) return;
    this.active = false; this.input.clear(); this.surface = undefined;
    this.camera.fov = 65; this.camera.near = 0.5; this.camera.updateProjectionMatrix();
    this.mesh.root.visible = false; this.setUI();
  }

  reset(): void {
    if (!this.active || !this.surface || !this.getWorld().roadReady) return;
    const spawn = this.surface.spawn(this.car.x, this.car.z);
    if (!spawn) return;
    this.car.reset(spawn.x, spawn.z, spawn.heading, this.surface.sample, true);
    this.cameraRig.reset(); this.input.clear(); this.collisionTime = 0;
  }

  action(code: string): void {
    if (!this.active) return;
    if (code === 'KeyR') this.reset();
    if (code === 'KeyC') {
      this.cameraRig.view = drivingViews[(drivingViews.indexOf(this.cameraRig.view) + 1) % drivingViews.length];
      element<HTMLSelectElement>('driving-view').value = this.cameraRig.view; this.cameraRig.reset();
    }
  }

  update(dt: number, frozen: boolean, wet: boolean): void {
    if (!this.active || !this.surface) return;
    const look = this.input.consumeLook(), world = this.getWorld();
    const focused = document.activeElement === element('world') && document.hasFocus();
    const waiting = !world.roadReady;
    const held = frozen || waiting || !focused;
    this.surface.wet = wet;
    if (!held) {
      const x = this.car.x, z = this.car.z, trip = this.car.trip;
      this.car.update(dt, { throttle: Number(this.input.down('KeyW')) - Number(this.input.down('KeyS')),
        steer: Number(this.input.down('KeyD')) - Number(this.input.down('KeyA')), handbrake: this.input.down('Space') }, this.surface.sample);
      this.collisionTime = Math.max(0, this.collisionTime - dt);
      if (this.surface.constrain(this.car, x, z)) {
        this.collisionTime = 1.2;
        this.car.trip = trip + Math.min(this.car.trip - trip, Math.hypot(this.car.x - x, this.car.z - z));
      }
    }
    this.cameraRig.update(held ? 0 : dt, this.car, this.surface, world.origin, held ? [0, 0] : look);
    this.hudTime += dt;
    if (this.hudTime >= 0.1) {
      this.hudTime = 0;
      element('vehicle-speed').textContent = String(Math.round(Math.abs(this.car.speed) * 3.6));
      element('vehicle-gear').textContent = this.car.parked ? 'P' : this.car.speed < -0.1 ? 'R' : this.car.speed > 0.1 ? 'D' : 'N';
      element('vehicle-trip').textContent = (this.car.trip / 1000).toFixed(2);
      element('vehicle-status').textContent = frozen ? '已暂停' : waiting ? '等待道路生成' : !focused ? '点击画面继续驾驶'
        : this.collisionTime > 0 ? '注意路边 · R 回正' : this.car.braking ? '制动' : this.car.parked ? 'W 起步 · S 倒车'
          : this.cameraRig.view === 'chase' ? '跟车视角' : this.cameraRig.view === 'cockpit' ? '驾驶舱' : '引擎盖视角';
      element('speed-line').style.transform = `scaleX(${Math.min(1, Math.abs(this.car.speed) / 48)})`;
      element('drive-hud').classList.toggle('braking', this.car.braking);
    }
  }

  sync(night: number): void {
    element<HTMLButtonElement>('drive-toggle').disabled = !this.input.enabled || (!this.active && (!this.getWorld().roadReady || this.getWorld().searching));
    if (this.active) { this.mesh.root.visible = true; this.mesh.sync(this.car, this.getWorld().origin, night); }
  }

  private setUI(): void {
    document.body.classList.toggle('driving', this.active);
    element('drive-toggle').textContent = this.active ? '退出驾驶' : '开始驾驶';
    element('drive-toggle').setAttribute('aria-pressed', String(this.active));
    element('drive-hud').hidden = !this.active;
    element('flight-controls').hidden = this.active;
    element('driving-controls').hidden = !this.active;
    element<HTMLButtonElement>('vehicle-reset').disabled = !this.active;
    element('world').setAttribute('aria-label', this.active ? '山路驾驶；W 加速，S 刹车倒车，A D 转向，Space 手刹，C 切换视角，R 回到道路' : '无限山地 3D 视图；拖动鼠标观察，WASD 飞行');
  }

  dispose(): void { this.events.abort(); this.mesh.dispose(); document.body.classList.remove('driving'); }
}
