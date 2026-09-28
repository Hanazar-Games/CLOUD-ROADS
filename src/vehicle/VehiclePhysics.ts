import { suspensionTuning, vehicleOffset, vehicleProfiles, type Suspension, type VehicleKind, type VehicleProfile, type WheelPoint } from './VehicleConfig';
import { Transmission } from './Transmission';
export interface VehicleInput { throttle: number; steer: number; handbrake: boolean }
export interface SurfaceContact { height: number; grip: number }
export type SurfaceSampler = (x: number, z: number) => SurfaceContact;
export type MotionConstraint = (car: VehiclePhysics, previousX: number, previousZ: number, dt: number) => boolean;
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
  lateralSpeed = 0; yawRate = 0; tireSlip = 0; handbrake = 0; rearWheelAngle = 0;
  paint: number;
  roofOpen = 1;
  ignition: 'off' | 'starting' | 'running' = 'off';
  private ignitionTime = 0;
  braking = false; parked = true; jackknifed = false;
  suspension: Suspension = 3;
  damping = 1;
  powerScale = 1; brakeScale = 1; steeringScale = 1;
  gripScale = 1; handbrakeStrength = 1; countersteerAssist = 0.6;
  speedLimit?: number;
  steeringAssist = true;
  steeringAssistStrength = 1;
  readonly wheels: WheelState[];
  readonly trailer?: TrailerState;
  private vy = 0; private pitchVelocity = 0; private rollVelocity = 0; private accumulator = 0;
  private readonly pitchInertia: number;
  private readonly rollInertia: number;
  readonly wheelbase: number;
  private readonly rearAxle: number;
  private readonly frontAxle: number;
  private readonly yawInertia: number;
  private longitudinalAcceleration = 0;
  private previousHeading = 0;
  private previousPose = { y: 0, pitch: 0, roll: 0 };
  private previousTrailer?: Omit<TrailerState, 'wheels'>;

  constructor(readonly kind: VehicleKind = 'roadster') {
    this.profile = vehicleProfiles[kind]; this.wheels = this.profile.wheels.map(wheel);
    this.paint = this.profile.paint;
    this.transmission = new Transmission(this.profile);
    this.pitchInertia = this.profile.wheels.reduce((sum, p) => sum + p.along ** 2, 0) / this.wheels.length;
    this.rollInertia = Math.max(0.3, this.profile.wheels.reduce((sum, p) => sum + p.x ** 2, 0) / this.wheels.length);
    const front = this.profile.wheels.filter(p => p.steer), rear = this.profile.wheels.filter(p => !p.steer);
    this.rearAxle = rear.reduce((s, p) => s + p.along, 0) / rear.length;
    this.frontAxle = front.reduce((s, p) => s + p.along, 0) / front.length;
    this.wheelbase = this.frontAxle - this.rearAxle;
    this.yawInertia = (this.profile.chassisLength ** 2 + this.profile.width ** 2) / 7
      + (this.profile.trailer ? this.profile.trailer.wheelbase * 0.35 : 0);
    if (this.profile.trailer) this.trailer = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, wheels: this.profile.trailer.wheels.map(wheel) };
  }

  get articulation(): number { return this.trailer ? angle(this.heading - this.trailer.heading) : 0; }
  get motionSpeed(): number { return Math.hypot(this.speed, this.lateralSpeed); }
  get slipAngle(): number { return Math.atan2(this.lateralSpeed, Math.max(0.5, Math.abs(this.speed))); }
  get drifting(): boolean { return this.motionSpeed > 3 && Math.abs(this.slipAngle) > 0.08 && this.tireSlip > 0.1; }
  get engineRpm(): number { return this.ignition === 'off' ? 0 : this.ignition === 'starting' ? 240 : this.transmission.rpm; }
  toggleIgnition(): void {
    this.ignition = this.ignition === 'off' ? 'starting' : 'off';
    this.ignitionTime = this.profile.mass > 4000 ? 1.25 : 0.75;
  }
  get maxSpeed(): number { return this.speedLimit ?? this.profile.maxSpeed; }
  get steeringLock(): number {
    const config = this.profile, stability = this.kind === 'motorcycle' ? 8 : Math.min(8, GRAVITY * config.width / (2 * config.cg) * 0.7);
    const speed = this.motionSpeed * Math.sqrt(clamp(this.steeringAssistStrength, 0.25, 2));
    const blend = clamp((speed - 12) / 16, 0, 1), smooth = blend * blend * (3 - 2 * blend);
    const low = Math.min(0.8, config.steer * clamp(this.steeringScale, 0.6, 1.4)) / (1 + speed / 28);
    const high = Math.min(low, Math.atan(this.wheelbase * stability * 1.15 / Math.max(1, speed * speed)));
    return this.steeringAssist ? low + (high - low) * smooth : Math.min(0.8, config.steer * clamp(this.steeringScale, 0.6, 1.4));
  }
  setSpeedLimit(kmh?: number): void {
    if (kmh !== undefined && !Number.isFinite(kmh)) return;
    this.speedLimit = kmh === undefined ? undefined : clamp(kmh, 20, 400) / 3.6;
    this.transmission.maxSpeed = this.maxSpeed;
  }
  park(): void {
    this.speed = this.lateralSpeed = this.vy = this.pitchVelocity = this.rollVelocity = this.accumulator = 0;
    this.yawRate = this.handbrake = this.tireSlip = this.longitudinalAcceleration = 0;
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
    this.speed = this.lateralSpeed = this.steering = this.pitch = this.roll = this.wheelAngle = this.rearWheelAngle = 0;
    this.yawRate = this.handbrake = this.tireSlip = this.longitudinalAcceleration = 0;
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

  update(dt: number, input: VehicleInput, surface: SurfaceSampler, constrain?: MotionConstraint): boolean {
    if (!Number.isFinite(dt) || dt <= 0) return false;
    let hit = false;
    if (!constrain) this.saveMotion();
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator + 1e-10 >= STEP) {
      const x = this.x, z = this.z, trip = this.trip;
      if (constrain) this.saveMotion();
      this.step(input, surface); this.accumulator = Math.max(0, this.accumulator - STEP);
      if (constrain?.(this, x, z, STEP)) {
        hit = true;
        this.trip = trip + Math.min(this.trip - trip, Math.hypot(this.x - x, this.z - z));
      }
    }
    return hit;
  }

  restoreHeading(surface: SurfaceSampler): void {
    const vx = Math.sin(this.heading) * this.speed + Math.cos(this.heading) * this.lateralSpeed;
    const vz = -Math.cos(this.heading) * this.speed + Math.sin(this.heading) * this.lateralSpeed;
    this.heading = this.previousHeading;
    this.yawRate = 0;
    this.speed = vx * Math.sin(this.heading) - vz * Math.cos(this.heading);
    this.lateralSpeed = vx * Math.cos(this.heading) + vz * Math.sin(this.heading);
    if (this.trailer && this.previousTrailer) { this.trailer.heading = this.previousTrailer.heading; Object.assign(this.trailer, this.hitch()); }
    this.syncWheels(this.contacts(surface)); this.updateTrailer(0, surface);
  }

  slideMotion(dx: number, dz: number, nx: number, nz: number, dt: number, surface: SurfaceSampler): void {
    const sin = Math.sin(this.heading), cos = Math.cos(this.heading);
    let vx = sin * this.speed + cos * this.lateralSpeed, vz = -cos * this.speed + sin * this.lateralSpeed;
    const inward = Math.min(0, vx * nx + vz * nz);
    vx -= nx * inward; vz -= nz * inward;
    const length = Math.hypot(vx, vz), friction = Math.max(0, 1 - Math.abs(inward) * 0.04 / Math.max(0.01, length));
    vx *= friction; vz *= friction;
    if (inward < 0 && length > 0.1) {
      const target = Math.atan2(vx * Math.sign(this.speed || 1), -vz * Math.sign(this.speed || 1));
      this.heading += clamp(angle(target - this.heading), -1.5 * dt, 1.5 * dt);
      this.yawRate *= Math.exp(-8 * dt);
    }
    this.x += dx; this.z += dz;
    this.speed = vx * Math.sin(this.heading) - vz * Math.cos(this.heading);
    this.lateralSpeed = vx * Math.cos(this.heading) + vz * Math.sin(this.heading);
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
    this.previousPose = { y: this.y, pitch: this.pitch, roll: this.roll };
    if (this.trailer) {
      const { x, y, z, heading, pitch, roll } = this.trailer;
      this.previousTrailer = { x, y, z, heading, pitch, roll };
    }
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
    if (this.ignition === 'starting') {
      this.ignitionTime -= STEP;
      if (this.ignitionTime <= 0) this.ignition = 'running';
    }
    const contacts = this.contacts(surface), { spring, damping } = suspensionTuning(this.suspension, this.profile, this.damping), config = this.profile;
    const throttle = clamp(input.throttle, -1, 1), count = this.wheels.length;
    if (throttle && !input.handbrake && this.ignition === 'running') this.parked = false;
    const gripScale = clamp(this.gripScale, 0.25, 1.5);
    const grip = contacts.reduce((sum, c, i) => sum + c.grip * Number(this.wheels[i].grounded), 0) / count * gripScale;
    const trailerContacts = this.trailerContacts(surface);
    const brakingGrip = (grip * count + trailerContacts.reduce((sum, c, i) => sum + c.grip * Number(this.trailer!.wheels[i].grounded) * gripScale, 0)) / (count + trailerContacts.length);
    const grade = this.slope(contacts, 'along'), oldSpeed = this.speed;
    const slopeForce = GRAVITY * grade / Math.hypot(1, grade);
    this.handbrake = approach(this.handbrake, input.handbrake ? clamp(this.handbrakeStrength, 0.4, 1) : 0, STEP * (input.handbrake ? 6 : 3));
    const rearLoad = clamp(this.frontAxle / this.wheelbase + this.longitudinalAcceleration * Math.sign(this.speed || 1) * config.cg / (GRAVITY * this.wheelbase), 0.18, 0.8);
    const parking = this.parked || input.handbrake && this.motionSpeed < 1;
    const rearOnly = this.handbrake > 0 && !parking && throttle * this.speed >= 0;
    this.braking = input.handbrake || this.handbrake > 0.01 || throttle * this.speed < 0;
    this.transmission.update(STEP, this.speed, this.parked || this.ignition !== 'running' ? 0 : throttle);
    if (parking || this.braking) {
      const service = throttle * this.speed < 0 ? Math.abs(throttle) : 0;
      const rearProjection = Math.abs(this.speed) / Math.max(0.1, Math.hypot(this.speed, this.lateralSpeed + this.yawRate * this.rearAxle));
      const deceleration = parking ? Math.min(config.brake * 1.2, GRAVITY * 0.94) * brakingGrip
        : Math.max(Math.min(GRAVITY * 0.94, config.brake * clamp(this.brakeScale, 0.5, 1.5)) * brakingGrip * service,
          GRAVITY * 0.78 * this.axleGrip(contacts, false) * rearLoad * this.handbrake * rearProjection);
      this.speed = approach(this.speed - slopeForce * STEP, 0, deceleration * STEP);
    } else {
      const engine = Math.min(config.force, config.power / Math.max(2, Math.abs(this.speed))) * clamp(this.powerScale, 0.5, 1.5) / config.mass;
      const drive = (this.ignition === 'running' ? throttle : 0) * Math.min(engine, GRAVITY * 0.94) * grip * (throttle < 0 ? 0.55 : this.transmission.driveScale);
      this.speed += (drive - slopeForce) * STEP;
      this.speed = approach(this.speed, 0, (0.14 + config.drag * this.speed ** 2 / config.mass + Math.max(0, 1 - grip) * 0.5) * STEP);
    }
    this.speed = clamp(this.speed, -config.reverseSpeed, this.maxSpeed);
    const steeringLock = this.steeringLock;
    const slide = Math.sign(this.slipAngle) * Math.max(0, Math.abs(this.slipAngle) - 0.08);
    const correction = this.motionSpeed > 3 ? slide * clamp(this.countersteerAssist, 0, 1) * Math.sign(this.speed || 1) : 0;
    const countersteering = input.steer * slide * Math.sign(this.speed || 1) > 0;
    const mechanicalLock = Math.min(0.8, config.steer * clamp(this.steeringScale, 0.6, 1.4));
    const targetSteer = clamp(clamp(input.steer, -1, 1) * (countersteering ? mechanicalLock : steeringLock) + correction, -mechanicalLock, mechanicalLock);
    this.steering = approach(this.steering, targetSteer,
      config.steerRate * (countersteering ? 1 : Math.max(0.08, Math.min(1, (steeringLock + Math.abs(correction)) / config.steer))) * STEP);
    this.longitudinalAcceleration = (this.speed - oldSpeed) / STEP + slopeForce;
    const lateralAcceleration = this.updateTires(contacts, rearLoad, brakingGrip, parking, rearOnly);
    this.x += (Math.sin(this.heading) * this.speed + Math.cos(this.heading) * this.lateralSpeed) * STEP;
    this.z += (-Math.cos(this.heading) * this.speed + Math.sin(this.heading) * this.lateralSpeed) * STEP;
    this.trip += Math.hypot(this.speed, this.lateralSpeed) * STEP;
    this.wheelAngle = (this.wheelAngle + this.speed * STEP / config.radius) % (Math.PI * 2);
    this.rearWheelAngle = (this.rearWheelAngle + this.speed * (1 - this.handbrake) * STEP / config.radius) % (Math.PI * 2);
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
    this.pitchVelocity += (pitchForce / this.pitchInertia + (this.longitudinalAcceleration - slopeForce) * config.cg * 0.22 / Math.max(1, this.pitchInertia) - this.pitchVelocity * 2) * STEP;
    if (this.kind === 'motorcycle') {
      const lean = -Math.atan(lateralAcceleration / GRAVITY);
      this.rollVelocity += ((lean - this.roll) * 45 - this.rollVelocity * 13) * STEP;
    } else this.rollVelocity += (rollForce / this.rollInertia + lateralAcceleration * config.cg * 0.3 - this.rollVelocity * 3) * STEP;
    this.pitch = clamp(this.pitch + this.pitchVelocity * STEP, -0.65, 0.65);
    this.roll = clamp(this.roll + this.rollVelocity * STEP, -0.7, 0.7);
    const floor = Math.max(...next.map((c, i) => c.height + config.radius + config.rest - config.travel
      - vehicleOffset(config.wheels[i].x, config.wheels[i].along, this.pitch, this.roll).y));
    if (this.y < floor) { this.y = floor; this.vy = Math.max(0, this.vy); }
    this.syncWheels(next); this.updateTrailer(STEP, surface);
  }

  private axleGrip(contacts: SurfaceContact[], front: boolean): number {
    let grip = 0, count = 0;
    for (let i = 0; i < this.wheels.length; i++) if (this.profile.wheels[i].steer === front) {
      grip += contacts[i].grip * Number(this.wheels[i].grounded); count++;
    }
    return grip / count * clamp(this.gripScale, 0.25, 1.5);
  }

  private updateTires(contacts: SurfaceContact[], rearLoad: number, brakingGrip: number, parking: boolean, rearOnly: boolean): number {
    let lateral = 0, longitudinal = 0, torque = 0, slip = 0;
    const inertia = this.yawInertia;
    for (const front of [true, false]) {
      const along = front ? this.frontAxle : this.rearAxle, load = front ? 1 - rearLoad : rearLoad;
      let grip = this.axleGrip(contacts, front);
      if (!rearOnly && (this.braking || parking)) grip = Math.min(grip, brakingGrip);
      const steer = front ? this.steering : 0, sin = Math.sin(steer), cos = Math.cos(steer);
      const sideways = (this.lateralSpeed + this.yawRate * along) * cos - this.speed * sin;
      const speed = this.speed * cos + (this.lateralSpeed + this.yawRate * along) * sin;
      const slipAngle = Math.atan2(sideways, Math.max(3, Math.abs(speed)));
      const capacity = grip * GRAVITY * load;
      const demand = Math.abs(this.longitudinalAcceleration) * (rearOnly ? Number(!front) : load);
      const limit = Math.sqrt(Math.max(0, capacity ** 2 - demand ** 2));
      const stiffness = GRAVITY * load * 12;
      const rollingForce = clamp(-slipAngle * stiffness, -limit, limit);
      const lockedForce = -sideways / Math.max(0.5, Math.hypot(speed, sideways)) * capacity * 0.78;
      const force = !front && rearOnly ? rollingForce * (1 - this.handbrake) + lockedForce * this.handbrake : rollingForce;
      lateral += force * cos; longitudinal -= force * sin; torque += force * cos * along;
      if (grip > 0) slip = Math.max(slip, Math.abs(sideways) / 6, !front ? this.handbrake * Math.abs(speed) / 20 : 0);
    }
    const energy = this.speed ** 2 + this.lateralSpeed ** 2 + inertia * this.yawRate ** 2;
    this.longitudinalAcceleration += longitudinal;
    this.speed += longitudinal * STEP; this.lateralSpeed += lateral * STEP; this.yawRate += torque / inertia * STEP;
    // Tire friction dissipates total planar energy, including body rotation.
    const nextEnergy = this.speed ** 2 + this.lateralSpeed ** 2 + inertia * this.yawRate ** 2;
    const damping = nextEnergy > energy ? Math.sqrt(energy / nextEnergy) : 1;
    this.speed *= damping; this.lateralSpeed *= damping; this.yawRate *= damping;
    const turn = this.yawRate * STEP, speed = this.speed, sideways = this.lateralSpeed;
    this.heading += turn;
    this.speed = speed * Math.cos(turn) + sideways * Math.sin(turn);
    this.lateralSpeed = sideways * Math.cos(turn) - speed * Math.sin(turn);
    this.tireSlip = clamp(slip, 0, 1);
    if (parking && this.motionSpeed < 0.05 && Math.abs(this.yawRate) < 0.05) {
      this.speed = this.lateralSpeed = this.yawRate = this.tireSlip = 0;
    }
    return lateral;
  }

  private updateTrailer(dt: number, surface: SurfaceSampler, reset = false): void {
    const trailer = this.trailer, config = this.profile.trailer;
    if (!trailer || !config) return;
    const hitch = this.hitch(), dx = hitch.x - trailer.x, dz = hitch.z - trailer.z;
    if (!reset) trailer.heading += (Math.cos(trailer.heading) * dx + Math.sin(trailer.heading) * dz) / (config.wheelbase * Math.cos(trailer.pitch));
    const articulation = angle(this.heading - trailer.heading), limit = Math.PI * 0.43;
    this.jackknifed = Math.abs(articulation) > limit;
    if (this.jackknifed) { trailer.heading = this.heading - clamp(articulation, -limit, limit); this.speed = this.lateralSpeed = this.yawRate = 0; }
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
