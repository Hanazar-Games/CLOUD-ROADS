import { suspensionTuning, vehicleOffset, vehicleProfiles, type Suspension, type VehicleKind, type VehicleProfile, type WheelPoint } from './VehicleConfig';
import { Transmission } from './Transmission';
export interface VehicleInput { throttle: number; steer: number; handbrake: boolean }
export interface SurfaceContact { height: number; grip: number }
export type SurfaceSampler = (x: number, z: number) => SurfaceContact;
export interface WheelState { height: number; compression: number; grounded: boolean }
export interface TrailerState { x: number; y: number; z: number; heading: number; pitch: number; roll: number; wheels: WheelState[] }
export interface VehicleBody { x: number; y: number; z: number; heading: number; pitch: number; roll: number; front: number; rear: number }
const STEP = 1 / 120, GRAVITY = 9.81;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const approach = (value: number, target: number, delta: number) => value + clamp(target - value, -delta, delta);
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
const wheel = (): WheelState => ({ height: 0, compression: 0, grounded: true });

export class VehiclePhysics {
  readonly profile: Readonly<VehicleProfile>;
  readonly transmission: Transmission;
  x = 0; y = 0; z = 0; heading = 0;
  speed = 0; steering = 0; pitch = 0; roll = 0; trip = 0; wheelAngle = 0;
  braking = false; parked = true; jackknifed = false;
  suspension: Suspension = 3;
  damping = 1;
  powerScale = 1; brakeScale = 1; steeringScale = 1;
  readonly wheels: WheelState[];
  readonly trailer?: TrailerState;
  private vy = 0; private pitchVelocity = 0; private rollVelocity = 0; private accumulator = 0;
  private readonly pitchInertia: number;
  private readonly rollInertia: number;
  readonly wheelbase: number;
  private readonly rearAxle: number;
  private previousHeading = 0;
  private previousPose = { y: 0, pitch: 0, roll: 0, wheelAngle: 0 };
  private previousWheels: WheelState[] = [];
  private previousTrailer?: TrailerState;

  constructor(readonly kind: VehicleKind = 'roadster') {
    this.profile = vehicleProfiles[kind]; this.wheels = this.profile.wheels.map(wheel);
    this.transmission = new Transmission(this.profile);
    this.pitchInertia = this.profile.wheels.reduce((sum, p) => sum + p.along ** 2, 0) / this.wheels.length;
    this.rollInertia = Math.max(0.3, this.profile.wheels.reduce((sum, p) => sum + p.x ** 2, 0) / this.wheels.length);
    const front = this.profile.wheels.filter(p => p.steer), rear = this.profile.wheels.filter(p => !p.steer);
    this.rearAxle = rear.reduce((s, p) => s + p.along, 0) / rear.length;
    this.wheelbase = front.reduce((s, p) => s + p.along, 0) / front.length - this.rearAxle;
    if (this.profile.trailer) this.trailer = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, wheels: this.profile.trailer.wheels.map(wheel) };
  }

  get articulation(): number { return this.trailer ? angle(this.heading - this.trailer.heading) : 0; }
  park(): void {
    this.speed = this.vy = this.pitchVelocity = this.rollVelocity = this.accumulator = 0;
    this.transmission.reset();
    this.parked = true; this.braking = false; this.saveMotion();
  }
  wheelSteering(point: WheelPoint): number {
    const curvature = Math.tan(this.steering) / this.wheelbase;
    return point.steer ? Math.atan((point.along - this.rearAxle) * curvature / (1 - point.x * curvature)) : 0;
  }
  hitch(): { x: number; y: number; z: number } {
    const along = this.profile.trailer?.hitchAlong ?? 0;
    const offset = vehicleOffset(0, along, this.pitch, this.roll);
    return { x: this.x - Math.sin(this.heading) * offset.z, y: this.y + offset.y,
      z: this.z + Math.cos(this.heading) * offset.z };
  }

  reset(x: number, z: number, heading: number, surface: SurfaceSampler, preserveTrip = false, trailerHeading = heading): void {
    this.x = x; this.z = z; this.heading = this.previousHeading = heading;
    this.speed = this.steering = this.pitch = this.roll = this.wheelAngle = 0;
    this.vy = this.pitchVelocity = this.rollVelocity = this.accumulator = 0;
    this.parked = true; this.braking = this.jackknifed = false;
    this.transmission.reset();
    if (!preserveTrip) this.trip = 0;
    const contacts = this.contacts(surface), grade = this.slope(contacts, 'along'), bank = this.slope(contacts, 'x');
    this.pitch = Math.atan(grade); this.roll = this.kind === 'motorcycle' ? 0 : Math.atan(bank * Math.cos(this.pitch));
    const settled = this.contacts(surface);
    this.y = settled.reduce((sum, contact) => sum + contact.height, 0) / settled.length
      + this.profile.radius + this.profile.rest - GRAVITY / suspensionTuning(this.suspension, this.profile).spring;
    this.syncWheels(settled);
    if (this.trailer) { this.trailer.heading = trailerHeading; this.trailer.pitch = this.pitch; this.trailer.roll = this.roll; this.updateTrailer(0, surface, true); }
    this.saveMotion();
  }

  update(dt: number, input: VehicleInput, surface: SurfaceSampler): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.saveMotion(); this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator + 1e-10 >= STEP) {
      this.step(input, surface); this.accumulator = Math.max(0, this.accumulator - STEP);
    }
  }

  restoreMotion(x: number, z: number): void {
    this.x = x; this.z = z; this.heading = this.previousHeading;
    Object.assign(this, this.previousPose);
    this.previousWheels.forEach((wheel, i) => Object.assign(this.wheels[i], wheel));
    if (this.trailer && this.previousTrailer) Object.assign(this.trailer, this.previousTrailer, { wheels: this.previousTrailer.wheels.map(w => ({ ...w })) });
    this.speed = this.vy = this.pitchVelocity = this.rollVelocity = 0;
  }

  slideMotion(x: number, z: number, heading: number, speed: number, surface: SurfaceSampler): void {
    this.x = x; this.z = z; this.heading = heading; this.speed = speed;
    this.syncWheels(this.contacts(surface)); this.updateTrailer(0, surface);
  }

  bodies(x = this.x, z = this.z, previous = false): VehicleBody[] {
    const body = previous ? { ...this.previousPose, heading: this.previousHeading } : this;
    const bodies: VehicleBody[] = [{ x, z, y: body.y, heading: body.heading, pitch: body.pitch, roll: body.roll,
      front: this.profile.chassisLength / 2, rear: -this.profile.chassisLength / 2 }];
    const trailer = previous ? this.previousTrailer : this.trailer, config = this.profile.trailer;
    if (trailer && config) bodies.push({ ...trailer, front: config.front, rear: config.front - config.length });
    return bodies;
  }

  private saveMotion(): void {
    this.previousHeading = this.heading;
    this.previousPose = { y: this.y, pitch: this.pitch, roll: this.roll, wheelAngle: this.wheelAngle };
    this.previousWheels = this.wheels.map(w => ({ ...w }));
    if (this.trailer) this.previousTrailer = { ...this.trailer, wheels: this.trailer.wheels.map(w => ({ ...w })) };
  }

  private contacts(surface: SurfaceSampler): SurfaceContact[] {
    const sin = Math.sin(this.heading), cos = Math.cos(this.heading);
    return this.profile.wheels.map(p => {
      const offset = vehicleOffset(p.x, p.along, this.pitch, this.roll);
      return surface(this.x + cos * offset.x - sin * offset.z, this.z + sin * offset.x + cos * offset.z);
    });
  }

  private slope(contacts: SurfaceContact[], axis: 'x' | 'along'): number {
    const points = this.profile.wheels;
    const slope = points.reduce((sum, p, i) => sum + p[axis] * contacts[i].height, 0) / Math.max(0.001, points.reduce((sum, p) => sum + p[axis] ** 2, 0));
    return axis === 'along' ? slope / Math.cos(this.pitch)
      : (slope + this.slope(contacts, 'along') * Math.sin(this.roll) * Math.sin(this.pitch)) / Math.cos(this.roll);
  }

  private syncWheels(contacts: SurfaceContact[]): void {
    const { radius, rest, travel } = this.profile;
    for (let i = 0; i < this.wheels.length; i++) {
      const p = this.profile.wheels[i], wheel = this.wheels[i];
      const mount = this.y + vehicleOffset(p.x, p.along, this.pitch, this.roll).y, ground = contacts[i].height + radius;
      wheel.height = Math.max(ground, mount - rest);
      wheel.compression = clamp(rest - (mount - ground), 0, travel);
      wheel.grounded = mount - ground < rest + 0.02;
    }
  }

  private step(input: VehicleInput, surface: SurfaceSampler): void {
    const contacts = this.contacts(surface), { spring, damping } = suspensionTuning(this.suspension, this.profile, this.damping), config = this.profile;
    const throttle = clamp(input.throttle, -1, 1), count = this.wheels.length;
    if (throttle && !input.handbrake) this.parked = false;
    const grip = contacts.reduce((sum, c, i) => sum + c.grip * Number(this.wheels[i].grounded), 0) / count;
    const trailerContacts = this.trailerContacts(surface);
    const brakingGrip = (grip * count + trailerContacts.reduce((sum, c, i) => sum + c.grip * Number(this.trailer!.wheels[i].grounded), 0)) / (count + trailerContacts.length);
    const grade = this.slope(contacts, 'along'), oldSpeed = this.speed;
    const slopeForce = GRAVITY * grade / Math.hypot(1, grade);
    this.braking = input.handbrake || throttle * this.speed < 0;
    this.transmission.update(STEP, this.speed, this.parked ? 0 : throttle);
    if (input.handbrake || this.parked || this.braking) {
      const deceleration = Math.min(config.brake * (input.handbrake || this.parked ? 1.2 : clamp(this.brakeScale, 0.5, 1.5)), GRAVITY * 0.94) * brakingGrip;
      this.speed = approach(this.speed - slopeForce * STEP, 0, deceleration * STEP);
    } else {
      const engine = Math.min(config.force, config.power / Math.max(2, Math.abs(this.speed))) * clamp(this.powerScale, 0.5, 1.5) / config.mass;
      const drive = throttle * Math.min(engine, GRAVITY * 0.94) * grip * (throttle < 0 ? 0.55 : this.transmission.driveScale);
      this.speed += (drive - slopeForce) * STEP;
      this.speed = approach(this.speed, 0, (0.14 + config.drag * this.speed ** 2 / config.mass + (1 - grip) * 0.5) * STEP);
    }
    this.speed = clamp(this.speed, -config.reverseSpeed, config.maxSpeed);
    const stability = this.kind === 'motorcycle' ? 8 : Math.min(8, GRAVITY * config.width / (2 * config.cg) * 0.7);
    const speed = Math.abs(this.speed), blend = clamp((speed - 12) / 16, 0, 1), smooth = blend * blend * (3 - 2 * blend);
    const lowSpeedLock = Math.min(0.8, config.steer * clamp(this.steeringScale, 0.6, 1.4)) / (1 + speed / 28);
    const highSpeedLock = Math.min(lowSpeedLock, Math.atan(this.wheelbase * stability * 1.15 / Math.max(1, speed * speed)));
    const steeringLock = lowSpeedLock + (highSpeedLock - lowSpeedLock) * smooth;
    this.steering = approach(this.steering, clamp(input.steer, -1, 1) * steeringLock,
      config.steerRate * Math.max(0.08, steeringLock / config.steer) * STEP);
    const tireAcceleration = (this.speed - oldSpeed) / STEP + slopeForce;
    const availableGrip = this.braking || this.parked ? Math.min(grip, brakingGrip) : grip;
    const lateral = Math.sqrt(Math.max(0, (availableGrip * GRAVITY) ** 2 - tireAcceleration ** 2));
    const yawLimit = Math.min(lateral, availableGrip * (input.handbrake ? 3 : stability)) / Math.max(1, Math.abs(this.speed));
    const yawRate = clamp(this.speed * Math.tan(this.steering) / this.wheelbase, -yawLimit, yawLimit);
    this.heading += yawRate * STEP;
    this.x += Math.sin(this.heading) * this.speed * STEP; this.z -= Math.cos(this.heading) * this.speed * STEP;
    this.trip += Math.abs(this.speed) * STEP;
    this.wheelAngle = (this.wheelAngle + this.speed * STEP / config.radius) % (Math.PI * 2);
    let lift = -GRAVITY, pitchForce = 0, rollForce = 0;
    const next = this.contacts(surface);
    for (let i = 0; i < count; i++) {
      const p = config.wheels[i];
      const extension = this.y + vehicleOffset(p.x, p.along, this.pitch, this.roll).y - next[i].height - config.radius;
      const velocity = this.vy + this.pitchVelocity * p.along + this.rollVelocity * p.x;
      const force = extension < config.rest ? clamp((config.rest - extension) * spring - velocity * damping, 0, 80) / count : 0;
      lift += force; pitchForce += force * p.along; rollForce += force * p.x;
    }
    this.vy += lift * STEP; this.y += this.vy * STEP;
    this.pitchVelocity += (pitchForce / this.pitchInertia + (this.speed - oldSpeed) / STEP * config.cg * 0.22 / Math.max(1, this.pitchInertia) - this.pitchVelocity * 2) * STEP;
    if (this.kind === 'motorcycle') {
      const lean = -Math.atan(this.speed * yawRate / GRAVITY);
      this.rollVelocity += ((lean - this.roll) * 45 - this.rollVelocity * 13) * STEP;
    } else this.rollVelocity += (rollForce / this.rollInertia + this.speed * yawRate * config.cg * 0.3 - this.rollVelocity * 3) * STEP;
    this.pitch = clamp(this.pitch + this.pitchVelocity * STEP, -0.65, 0.65);
    this.roll = clamp(this.roll + this.rollVelocity * STEP, -0.7, 0.7);
    const floor = Math.max(...next.map((c, i) => c.height + config.radius + config.rest - config.travel
      - vehicleOffset(config.wheels[i].x, config.wheels[i].along, this.pitch, this.roll).y));
    if (this.y < floor) { this.y = floor; this.vy = Math.max(0, this.vy); }
    this.syncWheels(next); this.updateTrailer(STEP, surface);
  }

  private updateTrailer(dt: number, surface: SurfaceSampler, reset = false): void {
    const trailer = this.trailer, config = this.profile.trailer;
    if (!trailer || !config) return;
    const hitch = this.hitch(), dx = hitch.x - trailer.x, dz = hitch.z - trailer.z;
    if (!reset) trailer.heading += (Math.cos(trailer.heading) * dx + Math.sin(trailer.heading) * dz) / (config.wheelbase * Math.cos(trailer.pitch));
    const articulation = angle(this.heading - trailer.heading), limit = Math.PI * 0.43;
    this.jackknifed = Math.abs(articulation) > limit;
    if (this.jackknifed) { trailer.heading = this.heading - clamp(articulation, -limit, limit); this.speed = 0; }
    Object.assign(trailer, hitch);
    const contacts = this.trailerContacts(surface);
    const ground = contacts.reduce((sum, c) => sum + c.height, 0) / contacts.length;
    const ride = this.profile.radius + this.profile.rest - GRAVITY / suspensionTuning(this.suspension, this.profile).spring;
    const target = clamp(Math.atan2(trailer.y - ground - ride, config.wheelbase * Math.cos(trailer.pitch)), -0.65, 0.65);
    const blend = reset ? 1 : 1 - Math.exp(-Math.sqrt(suspensionTuning(this.suspension, this.profile).spring) * dt);
    const bank = config.wheels.reduce((s, p, i) => s + p.x * contacts[i].height, 0) / config.wheels.reduce((s, p) => s + p.x ** 2, 0);
    const sideSlope = (bank + Math.tan(target) * Math.sin(trailer.roll) * Math.sin(trailer.pitch)) / Math.cos(trailer.roll);
    trailer.roll += (clamp(Math.atan(sideSlope * Math.cos(target)), -0.5, 0.5) - trailer.roll) * blend;
    trailer.pitch += (target - trailer.pitch) * blend;
    config.wheels.forEach((p, i) => {
      const mount = trailer.y + vehicleOffset(p.x, p.along, trailer.pitch, trailer.roll).y, wheel = trailer.wheels[i];
      const ground = contacts[i].height + this.profile.radius;
      wheel.height = Math.max(ground, mount - this.profile.rest);
      wheel.compression = clamp(this.profile.rest - mount + ground, 0, this.profile.travel);
      wheel.grounded = mount - ground < this.profile.rest + 0.03;
    });
  }

  private trailerContacts(surface: SurfaceSampler): SurfaceContact[] {
    const trailer = this.trailer, config = this.profile.trailer;
    if (!trailer || !config) return [];
    return config.wheels.map(p => {
      const offset = vehicleOffset(p.x, p.along, trailer.pitch, trailer.roll);
      return surface(trailer.x + Math.cos(trailer.heading) * offset.x - Math.sin(trailer.heading) * offset.z,
        trailer.z + Math.sin(trailer.heading) * offset.x + Math.cos(trailer.heading) * offset.z);
    });
  }
}
