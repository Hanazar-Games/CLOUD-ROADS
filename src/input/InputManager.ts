export class InputManager {
  private readonly keys = new Set<string>();
  private readonly events = new AbortController();
  private dragging = false;
  private dx = 0;
  private dy = 0;
  onAction: (code: string) => void = () => {};
  enabled = true;
  pointerLockFailed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const options = { signal: this.events.signal };
    window.addEventListener('keydown', (event) => {
      if (!this.enabled || event.isComposing || event.metaKey || event.altKey || event.defaultPrevented) return;
      const action = event.code === 'KeyP' || event.code === 'F3';
      if (event.target !== canvas && event.target !== document.body
        && (!action || !(event.target instanceof HTMLElement) || event.target.closest('input, textarea, select, [contenteditable], dialog'))) return;
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyR', 'KeyE', 'KeyL', 'KeyB', 'KeyQ', 'KeyH', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyP', 'F3'].includes(event.code)) return;
      event.preventDefault();
      if (event.repeat && !this.keys.has(event.code)) return;
      this.keys.add(event.code);
      if (!event.repeat) this.onAction(event.code);
    }, options);
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), options);
    window.addEventListener('blur', () => this.clear(), options);
    document.addEventListener('focusin', (event) => { if (event.target !== canvas) this.clear(); }, options);
    document.addEventListener('pointerlockchange', () => {
      this.clear();
      if (document.pointerLockElement === canvas) this.pointerLockFailed = false;
    }, options);
    document.addEventListener('pointerlockerror', () => { this.pointerLockFailed = true; }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, options);
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.enabled || event.button !== 0) return;
      canvas.focus();
      this.dragging = true;
      canvas.setPointerCapture(event.pointerId);
    }, options);
    canvas.addEventListener('pointerup', () => { this.dragging = false; }, options);
    canvas.addEventListener('pointercancel', () => this.clear(), options);
    canvas.addEventListener('lostpointercapture', () => { this.dragging = false; }, options);
    canvas.addEventListener('pointermove', (event) => {
      if (this.enabled && (this.dragging || document.pointerLockElement === canvas)) {
        this.dx += event.movementX;
        this.dy += event.movementY;
      }
    }, options);
    canvas.addEventListener('dblclick', () => {
      if (!this.enabled) return;
      try { void canvas.requestPointerLock()?.catch(() => { this.pointerLockFailed = true; }); }
      catch { this.pointerLockFailed = true; }
    }, options);
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
