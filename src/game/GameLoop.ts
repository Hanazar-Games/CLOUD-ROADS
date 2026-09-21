export class GameLoop {
  private frame = 0;
  private previous: number | undefined;
  private running = false;
  private interval = 0;
  private next = 0;

  setFrameLimit(fps: number): void {
    if (![0, 30, 60, 90, 120, 144, 165, 240].includes(fps)) throw new Error('Invalid frame limit');
    this.interval = fps ? 1000 / fps : 0;
    this.next = 0;
  }

  constructor(private readonly update: (dt: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.previous = undefined;
    this.next = 0;
    this.frame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.previous = undefined;
  }

  private readonly tick = (time: number): void => {
    if (!this.running) return;
    if (time + 0.1 < this.next) { this.frame = requestAnimationFrame(this.tick); return; }
    const dt = this.previous === undefined ? 0 : Math.min(Math.max((time - this.previous) / 1000, 0), 0.05);
    this.previous = time;
    this.next = this.interval ? time + this.interval - (this.next ? Math.max(0, time - this.next) % this.interval : 0) : 0;
    this.update(dt);
    if (this.running) this.frame = requestAnimationFrame(this.tick);
  };
}
