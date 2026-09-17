import { PerspectiveCamera, Vector3 } from 'three';
import type { InputManager } from '../input/InputManager';

export class FreeCamera {
  speed = 120;
  private yaw = 0;
  private pitch = -0.25;
  private readonly movement = new Vector3();

  constructor(readonly camera: PerspectiveCamera, private readonly input: InputManager) {
    this.camera.rotation.order = 'YXZ';
  }

  reset(heading = 0, pitch = -0.25): void { this.yaw = -heading; this.pitch = pitch; }

  update(dt: number, paused: boolean): void {
    const [dx, dy] = this.input.consumeLook();
    if (paused) return;
    this.yaw -= dx * 0.002;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch - dy * 0.002));
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    const lateral = Number(this.input.down('KeyD')) - Number(this.input.down('KeyA'));
    const forward = Number(this.input.down('KeyW')) - Number(this.input.down('KeyS'));
    const vertical = Number(this.input.down('Space')) - Number(this.input.down('ShiftLeft') || this.input.down('ShiftRight'));
    this.movement.set(lateral, 0, -forward).applyQuaternion(this.camera.quaternion);
    this.movement.y += vertical;
    if (this.movement.lengthSq() > 0) this.movement.normalize();
    const boost = this.input.down('ControlLeft') || this.input.down('ControlRight') ? 4 : 1;
    this.camera.position.addScaledVector(this.movement, this.speed * boost * dt);
  }
}
