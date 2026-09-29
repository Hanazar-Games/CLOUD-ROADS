import { Euler, Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import { WalkingPhysics, type WalkingInput, type WalkingSurface } from '../walking/WalkingPhysics';
import { cabinLayouts, type CabinLayout } from './CabinLayout';
import type { CabinState } from './CabinState';
import type { VehicleProfile } from './VehicleConfig';
export { cabinLayouts } from './CabinLayout';

export class CabinWalk implements WalkingSurface {
  readonly layouts: CabinLayout[];
  person = new WalkingPhysics(0.22, 1.6, 0.6);
  layout?: CabinLayout;
  eyeHeight = 1.5;
  private pitch = 0;
  private readonly orientation = new Quaternion();
  private readonly rotation = new Euler(0, 0, 0, 'YXZ');
  private readonly position = new Vector3();
  constructor(private readonly profile: VehicleProfile) { this.layouts = cabinLayouts(profile); }
  leaveSeat(cabin: CabinState, speed: number): boolean {
    const layout = this.layouts.find(l => l.entry === 'cabin');
    if (!layout || !Number.isFinite(speed) || Math.abs(speed) > 0.1 || cabin.selected.role === 'operator') return false;
    this.enter(layout, cabin);
    const seat = cabin.selected, floor = layout.bounds.min.y + (seat.floor - 1) * (this.profile.bus?.deckHeight ?? 0);
    this.person.reset(0, floor, Math.max(layout.bounds.min.z + 0.24, -seat.along + (seat.role === 'driver' ? 0.6 : 0)), 0);
    return true;
  }
  enter(layout: CabinLayout, cabin: CabinState): void {
    this.layout = layout; cabin.standing = true; this.pitch = 0;
    const height = Math.min(1.6, layout.bounds.max.y - layout.bounds.min.y - (layout.stairs?.rise ?? 0) - 0.08);
    this.eyeHeight = height - 0.1; this.person = new WalkingPhysics(0.22, height, 0.6, 0);
    this.person.reset(0, layout.bounds.min.y, layout.bounds.max.z - 0.55, 0);
  }
  get floor(): number { return this.layout?.stairs && this.person.y > this.layout.bounds.min.y + this.layout.stairs.rise - 0.1 ? 2 : 1; }
  nearestSeat(cabin: CabinState): string | undefined {
    if (this.layout?.entry !== 'cabin') return;
    return cabin.seats.filter(s => s.floor === this.floor && Math.hypot(s.x - this.person.x, -s.along - this.person.z) < 1.25)
      .sort((a, b) => Math.hypot(a.x - this.person.x, -a.along - this.person.z) - Math.hypot(b.x - this.person.x, -b.along - this.person.z))[0]?.id;
  }
  stop(): void { this.layout = undefined; this.person.releaseInput(); }
  update(dt: number, input: WalkingInput, look: [number, number]): void {
    if (!this.layout) return;
    if (dt <= 0) { this.person.releaseInput(); return; }
    this.person.heading += look[0] * 0.0025;
    this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch + look[1] * 0.002));
    this.person.update(dt, { ...input, run: false, sprint: false }, this);
  }
  camera(camera: PerspectiveCamera, matrix: Matrix4): void {
    this.position.set(this.person.x, this.person.y + this.eyeHeight, this.person.z).applyMatrix4(matrix);
    camera.position.copy(this.position);
    this.orientation.setFromRotationMatrix(matrix);
    this.rotation.set(-this.pitch, -this.person.heading, 0);
    camera.quaternion.setFromEuler(this.rotation).premultiply(this.orientation);
    if (camera.near !== 0.04 || camera.fov !== 70) { camera.near = 0.04; camera.fov = 70; camera.updateProjectionMatrix(); }
  }
  private inStairs(x: number, z: number): boolean {
    const s = this.layout?.stairs;
    return !!s && x >= s.x - s.width / 2 && x <= s.x + s.width / 2 && z >= s.start && z <= s.end;
  }
  private stairwell(x: number, z: number): boolean {
    const s = this.layout?.stairs;
    return !!s && x > this.profile.width * 0.04 && z > s.start && z < s.end;
  }
  sample(x: number, z: number, ceiling = this.person.y + 0.45): { height: number } {
    const l = this.layout!, s = l.stairs, floor = l.bounds.min.y;
    if (!s) return { height: floor };
    if (this.inStairs(x, z)) return { height: floor + Math.min(s.steps, Math.floor((z - s.start) / (s.end - s.start) * s.steps) + 1) * s.rise / s.steps };
    return { height: ceiling >= floor + s.rise && !this.stairwell(x, z) ? floor + s.rise : floor };
  }
  ceiling(x: number, z: number, feet: number): number {
    const l = this.layout!, s = l.stairs;
    return s && feet < l.bounds.min.y + s.rise - 0.4 && !this.stairwell(x, z) ? l.bounds.min.y + s.rise - 0.1 : l.bounds.max.y;
  }
  constrainWalker(body: { x: number; y: number; z: number }, previousX: number, previousZ: number): boolean {
    const l = this.layout!, r = this.person.radius, beforeX = body.x, beforeZ = body.z;
    body.x = Math.max(l.bounds.min.x + r, Math.min(l.bounds.max.x - r, body.x));
    body.z = Math.max(l.bounds.min.z + r, Math.min(l.bounds.max.z - r, body.z));
    for (const b of l.obstacles) {
      if (body.y >= b.max.y || body.y + this.person.height <= b.min.y || body.x <= b.min.x - r || body.x >= b.max.x + r || body.z <= b.min.z - r || body.z >= b.max.z + r) continue;
      if (previousX <= b.min.x - r) body.x = b.min.x - r;
      else if (previousX >= b.max.x + r) body.x = b.max.x + r;
      else if (previousZ <= b.min.z - r) body.z = b.min.z - r;
      else if (previousZ >= b.max.z + r) body.z = b.max.z + r;
      else { body.x = previousX; body.z = previousZ; }
    }
    return beforeX !== body.x || beforeZ !== body.z;
  }
}
