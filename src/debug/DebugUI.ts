export function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node as T;
}

export class DebugUI {
  private readonly panel = element('debug');
  private readonly values = element('debug-values');
  private readonly fields = new Map<string, HTMLElement>();
  private elapsed = 0;
  private frames = 0;
  private lastUpdate = performance.now();
  fps = 0;

  toggle(): void { this.panel.hidden = !this.panel.hidden; }

  update(sample: () => Record<string, string | number>): void {
    this.frames++;
    const now = performance.now();
    this.elapsed = now - this.lastUpdate;
    if (this.elapsed < 250) return;
    this.fps = Math.round(this.frames * 1000 / this.elapsed);
    this.frames = 0;
    this.lastUpdate = now;
    element('fps').textContent = String(this.fps);
    for (const [key, value] of Object.entries({ FPS: this.fps, ...sample() })) {
      let field = this.fields.get(key);
      if (!field) {
        const label = document.createElement('dt');
        label.textContent = key;
        field = document.createElement('dd');
        field.dataset.metric = key;
        this.fields.set(key, field);
        this.values.append(label, field);
      }
      field.textContent = String(value);
    }
  }
}
