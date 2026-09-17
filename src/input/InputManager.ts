export class InputManager {
  private readonly keys = new Set<string>();
  private readonly events = new AbortController();
  private dragging = false;
  private dx = 0;
  private dy = 0;
  onAction: (code: string) => void = () => {};

  constructor(private readonly canvas: HTMLCanvasElement) {
    const options = { signal: this.events.signal };
    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      if (['Space', 'F3'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat) this.onAction(event.code);
    }, options);
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), options);
    window.addEventListener('blur', () => this.clear(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, options);
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      canvas.focus();
      this.dragging = true;
      canvas.setPointerCapture(event.pointerId);
    }, options);
    canvas.addEventListener('pointerup', () => { this.dragging = false; }, options);
    canvas.addEventListener('lostpointercapture', () => { this.dragging = false; }, options);
    canvas.addEventListener('pointermove', (event) => {
      if (this.dragging || document.pointerLockElement === canvas) {
        this.dx += event.movementX;
        this.dy += event.movementY;
      }
    }, options);
    canvas.addEventListener('dblclick', () => { void canvas.requestPointerLock()?.catch(() => {}); }, options);
  }

  down(code: string): boolean { return this.keys.has(code); }

  consumeLook(): [number, number] {
    const look: [number, number] = [this.dx, this.dy];
    this.dx = this.dy = 0;
    return look;
  }

  clear(): void {
    this.keys.clear();
    this.dragging = false;
    this.dx = this.dy = 0;
  }

  dispose(): void {
    this.events.abort();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.clear();
  }
}
