export interface CraneInput { slew: number; lift: number; extend: number; hoist: number }
export class CraneSystems {
  enabled = false;
  deployment = 0;
  yaw = 0;
  angle = 0;
  extension = 0;
  rope = 0.4;
  get stowed(): boolean { return !this.enabled && this.deployment === 0 && this.yaw === 0 && this.angle === 0 && this.extension === 0 && this.rope === 0.4; }
  toggle(operator: boolean, speed: number): boolean {
    if (!operator || !Number.isFinite(speed) || Math.abs(speed) > 0.1) return false;
    this.enabled = !this.enabled; return true;
  }
  update(dt: number, input: CraneInput, operator: boolean, speed: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || Math.abs(speed) > 0.1) return;
    dt = Math.min(dt, 0.1);
    const move = (value: number, target: number, rate: number) => value + Math.max(-rate * dt, Math.min(rate * dt, target - value));
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    if (!this.enabled) {
      this.yaw = move(this.yaw, 0, 0.6); this.angle = move(this.angle, 0, 0.3);
      this.extension = move(this.extension, 0, 1.5); this.rope = move(this.rope, 0.4, 2);
      if (this.yaw === 0 && this.angle === 0 && this.extension === 0 && this.rope === 0.4) this.deployment = move(this.deployment, 0, 0.5);
      return;
    }
    this.deployment = move(this.deployment, 1, 0.4);
    if (this.deployment < 1 || !operator) return;
    this.yaw = clamp(this.yaw + input.slew * dt * 0.3, -Math.PI, Math.PI);
    this.angle = clamp(this.angle + input.lift * dt * 0.18, 0, 1.2);
    this.extension = clamp(this.extension + input.extend * dt * 0.8, 0, 6);
    this.rope = clamp(this.rope + input.hoist * dt, 0.4, Math.min(8, 0.4 + Math.sin(this.angle) * (8 + this.extension)));
  }
}
