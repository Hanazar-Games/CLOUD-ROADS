import { runtimeLog, type LogLevel } from './RuntimeLog';
import { version } from '../../package.json';
import { sourceText } from '../i18n/DomLocalizer';

export function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node as T;
}

export function exportRuntimeLog(metrics: Record<string, string | number> = {}): void {
  const url = URL.createObjectURL(new Blob([runtimeLog.export({ version, metrics })], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `cloud-roads-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class DebugUI {
  private readonly panel = element('debug');
  private readonly values = element('debug-values');
  private readonly fields = new Map<string, HTMLElement>();
  private elapsed = 0;
  private frames = 0;
  private lastUpdate = performance.now();
  private readonly events = new AbortController();
  private logRevision = -1;
  private metrics: Record<string, string | number> = {};
  fps = 0;

  constructor() {
    const options = { signal: this.events.signal };
    element('log-filter').addEventListener('change', () => { this.logRevision = -1; this.renderLogs(); }, options);
    element('log-clear').addEventListener('click', () => { runtimeLog.clear(); this.renderLogs(); }, options);
    for (const id of ['log-export', 'diagnostics-export']) element(id).addEventListener('click', () => exportRuntimeLog(this.metrics), options);
    element('log-recording').addEventListener('change', () => {
      runtimeLog.recording = element<HTMLInputElement>('log-recording').checked; this.renderLogs();
    }, options);
    element('log-capacity').addEventListener('input', () => {
      runtimeLog.capacity = Number(element<HTMLInputElement>('log-capacity').value);
      element('log-capacity-value').textContent = `${runtimeLog.capacity} 条`; this.renderLogs();
    }, options);
  }
  toggle(): void { this.panel.hidden = !this.panel.hidden; this.renderLogs(); }
  show(): void { this.panel.hidden = false; this.renderLogs(); element('log-filter').focus(); }
  hide(): void { this.panel.hidden = true; }

  private renderLogs(): void {
    if (this.panel.hidden) return;
    const entries = runtimeLog.snapshot(), filter = element<HTMLSelectElement>('log-filter').value as LogLevel | 'all';
    const status = `${runtimeLog.recording ? '正在记录' : '已暂停记录'} · ${entries.length} / ${runtimeLog.capacity} 条 · 列表显示最后 80 条`;
    if (sourceText(element('log-status')) !== status) element('log-status').textContent = status;
    if (this.logRevision === runtimeLog.revision) return;
    this.logRevision = runtimeLog.revision;
    const list = element('log-entries');
    list.replaceChildren(...entries.filter(e => filter === 'all' || e.level === filter).slice(-80).reverse().map(entry => {
      const row = document.createElement('li'); row.dataset.level = entry.level; row.translate = false;
      const label = document.createElement('small'), message = document.createElement('p');
      label.textContent = `${entry.lastTime.slice(11, 19)} UTC · ${entry.level.toUpperCase()} · ${entry.source}${entry.count > 1 ? ` ×${entry.count}` : ''}`;
      message.textContent = entry.message; row.append(label, message); return row;
    }));
    if (!list.childElementCount) { const empty = document.createElement('li'); empty.textContent = '当前筛选下没有日志。'; list.append(empty); }
  }

  dispose(): void { this.events.abort(); }

  update(sample: () => Record<string, string | number>): void {
    this.frames++;
    const now = performance.now();
    this.elapsed = now - this.lastUpdate;
    if (this.elapsed < 250) return;
    this.fps = Math.round(this.frames * 1000 / this.elapsed);
    this.frames = 0;
    this.lastUpdate = now;
    element('fps').textContent = String(this.fps);
    this.metrics = { FPS: this.fps, ...sample() };
    this.renderLogs();
    for (const [key, value] of Object.entries(this.metrics)) {
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
