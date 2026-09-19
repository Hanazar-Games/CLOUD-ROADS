export interface VehicleInput { throttle: number; steer: number; handbrake: boolean }
export interface SurfaceContact { height: number; grip: number }
export type SurfaceSampler = (x: number, z: number) => SurfaceContact;
export type Suspension = 'soft' | 'balanced' | 'firm';
export const WHEEL_RADIUS = 0.34;
export const WHEEL_POINTS = [{ x: -0.82, along: 1.35 }, { x: 0.82, along: 1.35 }, { x: -0.82, along: -1.35 }, { x: 0.82, along: -1.35 }];
const STEP = 1 / 120, GRAVITY = 9.81, REST = 0.6;
const tuning = { soft: [80, 13], balanced: [120, 18], firm: [180, 23] } as const;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const approach = (value: number, target: number, delta: number) => value + clamp(target - value, -delta, delta);

/** Four spring contacts and a planar bicycle model, in logical world coordinates. */
export class VehiclePhysics {
  x = 0; y = 0; z = 0; heading = 0;
  speed = 0; steering = 0; pitch = 0; roll = 0; trip = 0; wheelAngle = 0;
  braking = false; parked = true;
  suspension: Suspension = 'balanced';
  readonly wheels = WHEEL_POINTS.map(() => ({ height: 0, compression: 0, grounded: true }));
  private vy = 0; private pitchVelocity = 0; private rollVelocity = 0; private accumulator = 0;

  reset(x: number, z: number, heading: number, surface: SurfaceSampler, preserveTrip = false): void {
    this.x = x; this.z = z; this.heading = heading;
    this.speed = this.steering = this.pitch = this.roll = this.wheelAngle = 0;
    this.vy = this.pitchVelocity = this.rollVelocity = this.accumulator = 0;
    this.parked = true; this.braking = false;
    if (!preserveTrip) this.trip = 0;
    const contacts = this.contacts(surface);
    this.y = contacts.reduce((sum, contact) => sum + contact.height, 0) / 4 + WHEEL_RADIUS + REST - GRAVITY / tuning[this.suspension][0];
    this.pitch = Math.atan((contacts[0].height + contacts[1].height - contacts[2].height - contacts[3].height) / 5.4);
    this.roll = Math.atan((contacts[1].height + contacts[3].height - contacts[0].height - contacts[2].height) / 3.28);
    this.syncWheels(contacts);
  }

  update(dt: number, input: VehicleInput, surface: SurfaceSampler): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator + 1e-10 >= STEP) {
      this.step(input, surface);
      this.accumulator = Math.max(0, this.accumulator - STEP);
    }
  }

  private contacts(surface: SurfaceSampler): SurfaceContact[] {
    const sin = Math.sin(this.heading), cos = Math.cos(this.heading);
    return WHEEL_POINTS.map(p => surface(this.x + cos * p.x + sin * p.along, this.z + sin * p.x - cos * p.along));
  }

  private syncWheels(contacts: SurfaceContact[]): void {
    for (let i = 0; i < 4; i++) {
      const p = WHEEL_POINTS[i], wheel = this.wheels[i];
      const mount = this.y + Math.sin(this.pitch) * p.along + Math.sin(this.roll) * p.x;
      const ground = contacts[i].height + WHEEL_RADIUS;
      wheel.height = Math.max(ground, mount - REST);
      wheel.compression = clamp(REST - (mount - ground), 0, REST);
      wheel.grounded = mount - ground < REST + 0.02;
    }
  }

  private step(input: VehicleInput, surface: SurfaceSampler): void {
    const contacts = this.contacts(surface), [spring, damping] = tuning[this.suspension];
    const throttle = clamp(input.throttle, -1, 1);
    if (throttle && !input.handbrake) this.parked = false;
    const grip = contacts.reduce((sum, c, i) => sum + c.grip * Number(this.wheels[i].grounded), 0) / 4;
    const grade = (contacts[0].height + contacts[1].height - contacts[2].height - contacts[3].height) / 5.4;
    const oldSpeed = this.speed;
    this.braking = input.handbrake || (throttle !== 0 && throttle * this.speed < -0.1);
    if (input.handbrake || this.parked) {
      this.speed = approach(this.speed, 0, 15 * STEP);
    } else if (this.braking) {
      this.speed = approach(this.speed, 0, 10 * Math.max(0.4, grip) * STEP);
    } else {
      this.speed += (throttle * (throttle < 0 ? 3 : 5.8) * grip - GRAVITY * grade / Math.hypot(1, grade)) * STEP;
      this.speed = approach(this.speed, 0, (0.16 + 0.004 * this.speed ** 2 + (1 - grip) * 1.5) * STEP);
    }
    this.speed = clamp(this.speed, -8, 48);
    this.steering = approach(this.steering, clamp(input.steer, -1, 1) * 0.52 / (1 + Math.abs(this.speed) / 28), 1.8 * STEP);
    const yawLimit = Math.max(0.1, grip * (input.handbrake ? 3.2 : 7.5)) / Math.max(1, Math.abs(this.speed));
    const yawRate = clamp(this.speed * Math.tan(this.steering) / 2.7, -yawLimit, yawLimit);
    this.heading += yawRate * STEP;
    this.x += Math.sin(this.heading) * this.speed * STEP;
    this.z -= Math.cos(this.heading) * this.speed * STEP;
    this.trip += Math.abs(this.speed) * STEP;
    this.wheelAngle = (this.wheelAngle + this.speed * STEP / WHEEL_RADIUS) % (Math.PI * 2);
    let lift = -GRAVITY, pitchForce = 0, rollForce = 0;
    const next = this.contacts(surface);
    for (let i = 0; i < 4; i++) {
      const p = WHEEL_POINTS[i];
      const extension = this.y + Math.sin(this.pitch) * p.along + Math.sin(this.roll) * p.x - next[i].height - WHEEL_RADIUS;
      const velocity = this.vy + this.pitchVelocity * p.along + this.rollVelocity * p.x;
      const force = extension < REST ? clamp((REST - extension) * spring - velocity * damping, 0, 100) / 4 : 0;
      lift += force; pitchForce += force * p.along; rollForce += force * p.x;
    }
    this.vy += lift * STEP;
    this.y += this.vy * STEP;
    this.pitchVelocity += (pitchForce / 1.8 + (this.speed - oldSpeed) / STEP * 0.16 - this.pitchVelocity * 2) * STEP;
    this.rollVelocity += (rollForce / 0.8 + this.speed * yawRate * 0.2 - this.rollVelocity * 2) * STEP;
    this.pitch = clamp(this.pitch + this.pitchVelocity * STEP, -0.55, 0.55);
    this.roll = clamp(this.roll + this.rollVelocity * STEP, -0.5, 0.5);
    const floor = Math.max(...next.map(c => c.height)) + 0.38;
    if (this.y < floor) { this.y = floor; this.vy = Math.max(0, this.vy); }
    this.syncWheels(next);
  }
}
