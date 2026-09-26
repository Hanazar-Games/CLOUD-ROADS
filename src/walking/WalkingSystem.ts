import type { PerspectiveCamera } from 'three';
import { element } from '../debug/DebugUI';
import type { InputManager } from '../input/InputManager';
import { DrivingSurface } from '../vehicle/DrivingSurface';
import type { World } from '../world/World';
import { WalkingPhysics } from './WalkingPhysics';

export class WalkingSystem {
  readonly person = new WalkingPhysics();
  active = false;
  private surface: DrivingSurface | undefined;
  private pitch = 0;
  private stride = 0;
  private jumpRequested = false;
  private hudTime = 0;
  private readonly canvas = element('world');
  private readonly speedLabel = element('walking-speed');
  private readonly statusLabel = element('walking-status');

  constructor(private readonly camera: PerspectiveCamera, private readonly input: InputManager, private readonly getWorld: () => World) {}

  start(position?: { x: number; y: number; z: number; heading: number }): boolean {
    const world = this.getWorld();
    if (!world.roadReady || world.searching || !this.input.enabled) return false;
    this.surface = new DrivingSurface(world);
    const spawn = position ?? this.surface.spawn(this.camera.position.x + world.origin.x, this.camera.position.z + world.origin.z);
    if (!spawn) return false;
    this.person.reset(spawn.x, position?.y ?? this.surface.sample(spawn.x, spawn.z).height, spawn.z, spawn.heading);
    this.hudTime = 1;
    this.pitch = this.stride = 0; this.jumpRequested = false; this.input.clear(); this.active = true;
    this.setUI();
    element('explorer').hidden = true;
    element('controls-toggle').setAttribute('aria-expanded', 'false');
    element('controls-toggle').textContent = '展开面板';
    element('world').focus(); this.update(0, false);
    return true;
  }

  stop(): void {
    if (!this.active) return;
    this.active = false; this.surface = undefined; this.jumpRequested = false; this.input.clear(); this.person.releaseInput();
    this.camera.fov = 65; this.camera.near = 0.5; this.camera.updateProjectionMatrix();
    this.setUI();
  }

  action(code: string): void {
    if (!this.active || !this.surface || !this.getWorld().roadReady) return;
    if (code === 'Space') this.jumpRequested = true;
    if (code !== 'KeyR') return;
    const spawn = this.surface.spawn(this.person.x, this.person.z);
    if (spawn) {
      this.person.reset(spawn.x, this.surface.sample(spawn.x, spawn.z).height, spawn.z, spawn.heading);
      this.pitch = this.stride = 0; this.jumpRequested = false; this.input.clear();
    }
  }

  update(dt: number, frozen: boolean): void {
    if (!this.active || !this.surface) return;
    const world = this.getWorld(), person = this.person, look = this.input.consumeLook();
    const focused = document.activeElement === this.canvas && document.hasFocus();
    const held = frozen || !world.roadReady || !focused;
    if (held) { this.jumpRequested = false; person.releaseInput(); }
    else {
      person.heading += look[0] * 0.002;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - look[1] * 0.002));
      person.update(dt, {
        forward: Number(this.input.down('KeyW')) - Number(this.input.down('KeyS')),
        lateral: Number(this.input.down('KeyD')) - Number(this.input.down('KeyA')),
        run: this.input.down('ShiftLeft') || this.input.down('ShiftRight'),
        sprint: this.input.down('KeyE'), jump: this.jumpRequested || this.input.down('Space'),
      }, this.surface);
      this.jumpRequested = false;
      if (person.grounded) this.stride = (this.stride + person.speed * dt * 8) % (Math.PI * 2);
    }
    const bob = person.grounded && !held ? Math.sin(this.stride) * Math.min(person.speed / 2.2, 1) * 0.025 : 0;
    this.camera.position.set(person.x - world.origin.x, person.y + 1.65 + bob, person.z - world.origin.z);
    this.camera.rotation.set(this.pitch, -person.heading, 0, 'YXZ');
    if (this.camera.near !== 0.08 || this.camera.fov !== 70) {
      this.camera.near = 0.08; this.camera.fov = 70; this.camera.updateProjectionMatrix();
    }
    this.hudTime += dt;
    if (this.hudTime >= 0.1) {
      this.hudTime = 0;
      const speed = `${(person.speed * 3.6).toFixed(1)} km/h`;
      const status = frozen ? '已暂停' : !world.roadReady ? '等待地形生成' : !focused ? '点击画面继续步行'
        : !person.grounded ? '腾空' : person.speed > 5 ? '疾跑' : person.speed > 2.5 ? '跑步' : person.speed > 0.1 ? '行走' : '站立';
      if (this.speedLabel.textContent !== speed) this.speedLabel.textContent = speed;
      if (this.statusLabel.textContent !== status) this.statusLabel.textContent = status;
    }
  }

  sync(): void {
    element<HTMLButtonElement>('walk-toggle').disabled = !this.input.enabled || (!this.active && (!this.getWorld().roadReady || this.getWorld().searching));
  }

  private setUI(): void {
    document.body.classList.toggle('walking', this.active);
    element('walk-toggle').textContent = this.active ? '退出步行' : '开始步行';
    element('walk-toggle').setAttribute('aria-pressed', String(this.active));
    element('walk-hud').hidden = !this.active;
    element('walking-controls').hidden = !this.active;
    element('flight-controls').hidden = this.active;
    element('world').setAttribute('aria-label', this.active ? '步行探索；WASD 移动，Shift 跑步，E 疾跑，Space 跳跃，F 靠近驾驶室上车，R 回到道路' : '无限山地 3D 视图；拖动鼠标观察，WASD 飞行');
  }

  dispose(): void { this.stop(); }
}
