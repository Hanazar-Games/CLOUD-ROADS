import { Euler, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import type { VehiclePhysics } from '../vehicle/VehiclePhysics';
import type { DrivingSurface } from '../vehicle/DrivingSurface';

export type DrivingView = 'chase' | 'cockpit' | 'hood';
export const drivingViews: DrivingView[] = ['chase', 'cockpit', 'hood'];

export class DrivingCamera {
  view: DrivingView = 'chase';
  fov = 65;
  distance = 7;
  height = 0;
  private yaw = 0; private pitch = 0;
  private bodyPitch = 0; private bodyRoll = 0;
  private lastView: DrivingView = 'chase';
  private lastDistance = 7; private lastHeight = 0;
  private readonly position = new Vector3();
  private readonly target = new Vector3();
  private readonly offset = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private initialized = false;

  constructor(private readonly camera: PerspectiveCamera) {}
  reset(): void { this.yaw = this.pitch = 0; this.initialized = false; }

  update(dt: number, car: VehiclePhysics, surface: DrivingSurface, origin: { x: number; z: number }, look: [number, number]): void {
    if (this.view !== this.lastView || this.distance !== this.lastDistance || this.height !== this.lastHeight) {
      this.initialized = false;
      this.lastView = this.view; this.lastDistance = this.distance; this.lastHeight = this.height;
    }
    const blend = this.initialized ? 1 - Math.exp(-10 * dt) : 1;
    this.bodyPitch += (car.pitch - this.bodyPitch) * blend;
    this.bodyRoll += (car.roll * 0.3 - this.bodyRoll) * blend;
    const tunnel = surface.inTunnel(car.x, car.z, 14);
    const yawLimit = this.view === 'chase' ? Math.PI : 1.45;
    this.yaw = Math.max(-yawLimit, Math.min(yawLimit, this.yaw + look[0] * 0.0025));
    this.pitch = Math.max(-0.3, Math.min(0.5, this.pitch + look[1] * 0.002));
    if (this.view === 'chase') {
      const yaw = car.heading + (tunnel ? Math.max(-1.45, Math.min(1.45, this.yaw)) * 0.14 : this.yaw);
      const distance = tunnel ? 4.8 : this.distance;
      const height = tunnel ? 2.1 : 2.3 + this.height + this.pitch * 5;
      this.target.set(car.x - Math.sin(yaw) * distance, car.y + height - Math.sin(this.bodyPitch) * distance, car.z + Math.cos(yaw) * distance);
      this.target.y = Math.max(this.target.y, surface.sample(this.target.x, this.target.z).height + 0.65);
      if (!this.initialized || tunnel) this.position.copy(this.target);
      else this.position.lerp(this.target, 1 - Math.exp(-8 * dt));
      this.position.y = Math.max(this.position.y, surface.sample(this.position.x, this.position.z).height + 0.65);
      this.clearSightline(this.position, car, surface);
      this.camera.position.set(this.position.x - origin.x, this.position.y, this.position.z - origin.z);
      const ahead = tunnel ? 1 : 3;
      this.camera.lookAt(car.x - origin.x + Math.sin(car.heading) * ahead, car.y + 0.6 + Math.sin(this.bodyPitch) * ahead, car.z - origin.z - Math.cos(car.heading) * ahead);
    } else {
      this.euler.set(car.pitch, -car.heading, car.roll * 0.7);
      this.rotation.setFromEuler(this.euler);
      this.offset.set(this.view === 'cockpit' ? -0.43 : 0, (this.view === 'cockpit' ? 0.76 : 0.64) + this.height, this.view === 'cockpit' ? 0.2 : -1.2).applyQuaternion(this.rotation);
      this.camera.position.set(car.x - origin.x, car.y, car.z - origin.z).add(this.offset);
      this.camera.rotation.set(this.bodyPitch - this.pitch, -car.heading - this.yaw, this.bodyRoll, 'YXZ');
    }
    if (this.camera.fov !== this.fov || this.camera.near !== 0.08) {
      this.camera.fov = this.fov; this.camera.near = 0.08; this.camera.updateProjectionMatrix();
    }
    this.initialized = true;
  }

  private clearSightline(position: Vector3, car: VehiclePhysics, surface: DrivingSurface): void {
    const x = position.x - car.x, y = position.y - car.y - 0.6, z = position.z - car.z;
    for (let step = 1; step <= 12; step++) {
      const t = step / 12;
      if (surface.sample(car.x + x * t, car.z + z * t).height + 0.25 < car.y + 0.6 + y * t) continue;
      const safe = (step - 1) / 12;
      position.set(car.x + x * safe, car.y + 0.6 + y * safe, car.z + z * safe);
      break;
    }
  }
}
