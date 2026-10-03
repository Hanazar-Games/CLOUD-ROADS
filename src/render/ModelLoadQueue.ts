interface Job { priority: number; wanted: boolean; create: () => Generator<void>; work?: Generator<void> }

export class ModelLoadQueue {
  private readonly jobs = new Map<string, Job>();
  budget = 2;
  constructor(private readonly now = () => performance.now()) {}
  get pending(): number { return this.jobs.size; }
  request(key: string, priority: number, create: () => Generator<void>): void {
    const job = this.jobs.get(key);
    if (job) { job.priority = Math.min(job.wanted ? job.priority : Infinity, priority); job.wanted = true; }
    else this.jobs.set(key, { priority, wanted: true, create });
  }
  pump(budget = this.budget): void {
    for (const [key, job] of this.jobs) if (!job.wanted) { job.work?.return(undefined); this.jobs.delete(key); }
    const started = this.now(), limit = Math.max(1, Math.min(8, Number.isFinite(budget) ? budget : 2));
    let steps = 0;
    for (const [key, job] of [...this.jobs].sort((a, b) => a[1].priority - b[1].priority)) {
      while (steps < 64 && this.now() - started < limit) {
        steps++; job.work ??= job.create();
        if (job.work.next().done) { this.jobs.delete(key); break; }
      }
      if (this.jobs.has(key)) break;
    }
    for (const job of this.jobs.values()) job.wanted = false;
  }
  dispose(): void { for (const job of this.jobs.values()) job.work?.return(undefined); this.jobs.clear(); }
}
