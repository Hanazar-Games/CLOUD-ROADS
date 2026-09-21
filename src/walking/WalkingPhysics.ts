export interface WalkingInput { forward: number; lateral: number; run: boolean; sprint: boolean; jump: boolean }
export interface WalkingSurface {
  sample(x: number, z: number, ceiling?: number): { height: number };
  constrainWalker(body: { x: number; y: number; z: number }, previousX: number, previousZ: number): boolean;
  ceiling?(x: number, z: number, feet: number): number;
}
const STEP = 1 / 120, RADIUS = 0.32;
const FOOTPRINT = [[0, 0], [-RADIUS, 0], [RADIUS, 0], [0, -RADIUS], [0, RADIUS]];

export class WalkingPhysics {
  x = 0; y = 0; z = 0; heading = 0;
  grounded = true;
  private vx = 0; private vz = 0; private vy = 0;
  private accumulator = 0;
  private jumpHeld = false; private jumpQueued = false;
  private floorX = NaN; private floorZ = NaN; private floorCeiling = NaN; private floorHeight = 0;
  get speed(): number { return Math.hypot(this.vx, this.vz); }

  reset(x: number, y: number, z: number, heading: number): void {
    this.x = x; this.y = y; this.z = z; this.heading = heading;
    this.vx = this.vz = this.vy = this.accumulator = 0;
    this.grounded = true; this.releaseInput();
  }

  releaseInput(): void { this.jumpHeld = this.jumpQueued = false; this.vx = this.vz = 0; }

  update(dt: number, input: WalkingInput, surface: WalkingSurface): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.floorX = NaN;
    this.jumpQueued ||= input.jump && !this.jumpHeld;
    this.jumpHeld = input.jump;
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator + 1e-10 >= STEP) {
      this.step(input, surface);
      this.accumulator = Math.max(0, this.accumulator - STEP);
    }
  }

  private floor(surface: WalkingSurface, x: number, z: number): number {
    const ceiling = this.y + 0.45;
    if (x === this.floorX && z === this.floorZ && ceiling === this.floorCeiling) return this.floorHeight;
    let height = -Infinity;
    for (const [dx, dz] of FOOTPRINT) {
      height = Math.max(height, surface.sample(x + dx, z + dz, ceiling).height);
    }
    this.floorX = x; this.floorZ = z; this.floorCeiling = ceiling; this.floorHeight = height;
    return height;
  }

  private step(input: WalkingInput, surface: WalkingSurface): void {
    const scale = Math.max(1, Math.hypot(input.lateral, input.forward));
    const speed = input.sprint ? 8 : input.run ? 4.8 : 2.2;
    const cos = Math.cos(this.heading), sin = Math.sin(this.heading);
    const targetX = (cos * input.lateral + sin * input.forward) / scale * speed;
    const targetZ = (sin * input.lateral - cos * input.forward) / scale * speed;
    const acceleration = this.grounded ? 18 : 5;
    const blend = Math.min(1, acceleration * STEP / Math.hypot(targetX - this.vx, targetZ - this.vz));
    this.vx += (targetX - this.vx) * blend;
    this.vz += (targetZ - this.vz) * blend;
    if (this.jumpQueued && this.grounded) { this.vy = 6.4; this.grounded = false; }
    this.jumpQueued = false;
    for (const axis of ['x', 'z'] as const) {
      if ((axis === 'x' ? this.vx : this.vz) === 0) continue;
      const beforeX = this.x, beforeZ = this.z;
      this[axis] += (axis === 'x' ? this.vx : this.vz) * STEP;
      if (this.floor(surface, this.x, this.z) > this.y + (this.grounded ? 0.42 : 0.05)
        || (surface.ceiling?.(this.x, this.z, this.y) ?? Infinity) < this.y + 1.75 - 1e-6) {
        this.x = beforeX; this.z = beforeZ;
        if (axis === 'x') this.vx = 0; else this.vz = 0;
      }
      if (surface.constrainWalker(this, beforeX, beforeZ)) {
        if (axis === 'x') this.vx = 0; else this.vz = 0;
      }
    }
    const floor = this.floor(surface, this.x, this.z);
    if (this.grounded && floor >= this.y - 0.42) { this.y = floor; this.vy = 0; }
    else {
      this.grounded = false;
      this.vy -= 18 * STEP;
      const ceiling = surface.ceiling?.(this.x, this.z, this.y) ?? Infinity;
      this.y += this.vy * STEP;
      if (this.vy > 0 && this.y + 1.75 > ceiling) { this.y = ceiling - 1.75; this.vy = 0; }
      if (this.vy <= 0 && this.y <= floor) { this.y = floor; this.vy = 0; this.grounded = true; }
    }
  }
}
