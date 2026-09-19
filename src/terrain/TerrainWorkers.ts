import type { ChunkRequest } from '../world/ChunkPlanner';
import type { TerrainData } from './TerrainGenerator';
import type { CorridorEdge } from '../road/RoadCorridor';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import type { ServiceGround } from '../service/ServiceTerrain';

export interface TerrainBackend {
  readonly capacity: number;
  generate(request: ChunkRequest, seed: string, road: readonly CorridorEdge[], services: readonly ServiceGround[]): Promise<TerrainData>;
  dispose(): void;
}
export interface TerrainJob { id: number; seed: string; request: ChunkRequest; road: readonly CorridorEdge[]; services: readonly ServiceGround[]; options: Readonly<WorldOptions> }
export type TerrainReply = { id: number; data: TerrainData } | { id: number; error: string };
interface PendingJob {
  id: number;
  resolve: (data: TerrainData) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}
interface WorkerSlot { worker: Worker; pending?: PendingJob }

export class TerrainWorkers implements TerrainBackend {
  readonly capacity = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 2));
  private readonly slots: WorkerSlot[] = [];
  private nextId = 0;
  private error: Error | undefined;

  constructor(private readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    try {
      for (let i = 0; i < this.capacity; i++) {
        const worker = new Worker(new URL('./TerrainWorker.ts', import.meta.url), { type: 'module' });
        const slot: WorkerSlot = { worker };
        worker.onmessage = (event: MessageEvent<TerrainReply>) => {
          const pending = slot.pending;
          if (!pending || pending.id !== event.data.id) return;
          if ('error' in event.data) { this.fail(new Error(event.data.error)); return; }
          clearTimeout(pending.timeout);
          slot.pending = undefined;
          pending.resolve(event.data.data);
        };
        worker.onerror = (event) => this.fail(new Error(event.message || 'Terrain worker failed'));
        worker.onmessageerror = () => this.fail(new Error('Invalid terrain worker response'));
        this.slots.push(slot);
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  generate(request: ChunkRequest, seed: string, road: readonly CorridorEdge[], services: readonly ServiceGround[] = []): Promise<TerrainData> {
    if (this.error) return Promise.reject(this.error);
    const slot = this.slots.find((candidate) => !candidate.pending);
    if (!slot) return Promise.reject(new Error('Terrain worker capacity exceeded'));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => this.fail(new Error('Terrain worker timed out')), 15_000);
      slot.pending = { id, resolve, reject, timeout };
      try { slot.worker.postMessage({ id, seed, request, road, services, options: this.options } satisfies TerrainJob); }
      catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  private fail(error: Error): void {
    this.error ??= error;
    for (const slot of this.slots) {
      slot.worker.terminate();
      if (slot.pending) {
        clearTimeout(slot.pending.timeout);
        slot.pending.reject(this.error);
        slot.pending = undefined;
      }
    }
    this.slots.length = 0;
  }

  dispose(): void { this.fail(new Error('Terrain worker stopped')); }
}
