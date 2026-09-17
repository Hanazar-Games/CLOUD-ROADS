export class GameLoop {
  private frame = 0;
  private previous: number | undefined;
  private running = false;

  constructor(private readonly update: (dt: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.previous = undefined;
    this.frame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.previous = undefined;
  }

  private readonly tick = (time: number): void => {
    if (!this.running) return;
    const dt = this.previous === undefined ? 0 : Math.min(Math.max((time - this.previous) / 1000, 0), 0.05);
    this.previous = time;
    this.update(dt);
    if (this.running) this.frame = requestAnimationFrame(this.tick);
  };
}
