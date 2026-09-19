import { Euler, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import type { VehiclePhysics } from '../vehicle/VehiclePhysics';
import type { DrivingSurface } from '../vehicle/DrivingSurface';

export type DrivingView = 'chase' | 'cockpit' | 'hood';
export const drivingViews: DrivingView[] = ['chase', 'cockpit', 'hood'];

export class DrivingCamera {
  view: DrivingView = 'chase';
  fov = 65;
  distance = 7;
  private yaw = 0; private pitch = 0;
  private readonly position = new Vector3();
  private readonly target = new Vector3();
  private readonly offset = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private initialized = false;

  constructor(private readonly camera: PerspectiveCamera) {}
  reset(): void { this.yaw = this.pitch = 0; this.initialized = false; }

  update(dt: number, car: VehiclePhysics, surface: DrivingSurface, origin: { x: number; z: number }, look: [number, number]): void {
    const tunnel = surface.inTunnel(car.x, car.z, 14);
    const yawLimit = this.view === 'chase' ? Math.PI : 1.45;
    this.yaw = Math.max(-yawLimit, Math.min(yawLimit, this.yaw + look[0] * 0.0025));
    this.pitch = Math.max(-0.3, Math.min(0.5, this.pitch + look[1] * 0.002));
    if (this.view === 'chase') {
      const yaw = car.heading + (tunnel ? Math.max(-1.45, Math.min(1.45, this.yaw)) * 0.14 : this.yaw);
      const distance = tunnel ? 4.8 : this.distance;
      const height = tunnel ? 2.1 : 2.3 + this.pitch * 5;
      this.target.set(car.x - Math.sin(yaw) * distance, car.y + height - Math.sin(car.pitch) * distance, car.z + Math.cos(yaw) * distance);
      this.target.y = Math.max(this.target.y, surface.sample(this.target.x, this.target.z).height + 0.65);
      if (!this.initialized || tunnel) this.position.copy(this.target);
      else this.position.lerp(this.target, 1 - Math.exp(-8 * dt));
      this.position.y = Math.max(this.position.y, surface.sample(this.position.x, this.position.z).height + 0.65);
      this.camera.position.set(this.position.x - origin.x, this.position.y, this.position.z - origin.z);
      const ahead = tunnel ? 1 : 3;
      this.camera.lookAt(car.x - origin.x + Math.sin(car.heading) * ahead, car.y + 0.6 + Math.sin(car.pitch) * ahead, car.z - origin.z - Math.cos(car.heading) * ahead);
    } else {
      this.euler.set(car.pitch, -car.heading, car.roll * 0.7);
      this.rotation.setFromEuler(this.euler);
      this.offset.set(this.view === 'cockpit' ? -0.43 : 0, this.view === 'cockpit' ? 0.8 : 0.42, this.view === 'cockpit' ? 0.4 : -1.38).applyQuaternion(this.rotation);
      this.camera.position.set(car.x - origin.x, car.y, car.z - origin.z).add(this.offset);
      this.camera.rotation.set(car.pitch - this.pitch, -car.heading - this.yaw, car.roll * 0.45, 'YXZ');
    }
    if (this.camera.fov !== this.fov || this.camera.near !== 0.08) {
      this.camera.fov = this.fov; this.camera.near = 0.08; this.camera.updateProjectionMatrix();
    }
    this.initialized = true;
  }
}
