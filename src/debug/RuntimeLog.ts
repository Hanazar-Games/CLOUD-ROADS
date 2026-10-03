export type LogLevel = 'info' | 'warn' | 'error';
export interface LogEntry { time: string; lastTime: string; level: LogLevel; source: string; message: string; count: number }

export class RuntimeLog {
  recording = true;
  revision = 0;
  private entries: LogEntry[] = [];
  private limit: number;
  constructor(capacity = 300) { this.limit = Math.max(1, Math.min(1000, Math.round(capacity) || 300)); }
  get capacity(): number { return this.limit; }
  set capacity(value: number) {
    this.limit = Math.max(1, Math.min(1000, Math.round(value) || 300));
    this.entries = this.entries.slice(-this.limit); this.revision++;
  }
  write(level: LogLevel, source: string, value: unknown): void {
    if (!this.recording) return;
    let message: string;
    try { message = value instanceof Error ? value.stack || value.message : typeof value === 'string' ? value : JSON.stringify(value); }
    catch { message = '[Unserializable diagnostic value]'; }
    message = String(message ?? '').slice(0, 2000); source = source.slice(0, 60);
    const time = new Date().toISOString(), last = this.entries.at(-1);
    if (last && last.level === level && last.source === source && last.message === message) {
      last.count++; last.lastTime = time;
    } else {
      this.entries.push({ time, lastTime: time, level, source, message, count: 1 });
      if (this.entries.length > this.limit) this.entries.shift();
    }
    this.revision++;
  }
  snapshot(): LogEntry[] { return this.entries.map(entry => ({ ...entry })); }
  clear(): void { this.entries = []; this.revision++; }
  export(context: { version: string; metrics: Record<string, string | number> }): string {
    return JSON.stringify({ format: 'cloud-roads-diagnostics', exportedAt: new Date().toISOString(), ...context,
      recording: this.recording, capacity: this.limit, entries: this.snapshot() }, null, 2);
  }
  capture(target: Window): () => void {
    const error = (event: ErrorEvent) => this.write('error', 'runtime', event.error ?? event.message);
    const rejection = (event: PromiseRejectionEvent) => this.write('error', 'promise', event.reason);
    target.addEventListener('error', error); target.addEventListener('unhandledrejection', rejection);
    return () => { target.removeEventListener('error', error); target.removeEventListener('unhandledrejection', rejection); };
  }
}

export const runtimeLog = new RuntimeLog();
