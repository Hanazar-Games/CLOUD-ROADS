import { Vector2, type Scene } from 'three';
import { TerrainChunk } from '../terrain/TerrainChunk';
import type { TerrainData } from '../terrain/TerrainGenerator';
import type { TerrainBackend } from '../terrain/TerrainWorkers';
import { CHUNK_SIZE, planChunks, VIEW_RADII, VIEW_RADIUS, type ChunkRequest, type TerrainCells } from './ChunkPlanner';
import type { RoadCorridor } from '../road/RoadCorridor';
import { VegetationMesh } from '../vegetation/VegetationMesh';
import { createTerrainMaterial } from '../terrain/TerrainMaterial';
import type { SeasonState } from '../season/SeasonState';
import { seasonMaterial } from '../season/SeasonMaterial';

const POOL_LIMITS: Record<TerrainCells, number> = { 64: 25, 16: 56, 8: 208 };
interface TerrainRequest extends ChunkRequest { signature: string }
const matches = (a: TerrainRequest | undefined, b: TerrainRequest): boolean => a?.cells === b.cells && a.signature === b.signature && (a.vegetation !== false) === (b.vegetation !== false);

export class ChunkManager {
  private readonly terrainOrigin = new Vector2();
  private readonly material = createTerrainMaterial(this.terrainOrigin);
  private readonly active = new Map<string, TerrainChunk>();
  private readonly applied = new Map<string, TerrainRequest>();
  private readonly pooled: Record<TerrainCells, TerrainChunk[]> = { 8: [], 16: [], 64: [] };
  private readonly allocated = new Set<TerrainChunk>();
  private readonly pending = new Map<string, TerrainRequest>();
  private readonly ready: { request: TerrainRequest; data: TerrainData }[] = [];
  private readonly prefetched = new Map<string, { request: TerrainRequest; data: TerrainData }>();
  private ahead = new Map<string, TerrainRequest>();
  private desired = new Map<string, TerrainRequest>();
  private plan: TerrainRequest[] = [];
  private priority = new Map<string, number>();
  private queue: TerrainRequest[] = [];
  private center = '';
  private plannedRoad: RoadCorridor | null = null;
  private direction = NaN;
  private originX = 0;
  private originZ = 0;
  private disposed = false;
  private completed = 0;
  private radius = VIEW_RADIUS;
  private preload = 1;
  private flightAhead = 0;
  private flightTurn = 0;
  private maxCells: TerrainCells = 64;
  private fineRadius = 2;
  uploadBudget = 2;
  uploadLimit = 2;
  error = '';
  readonly vegetation: VegetationMesh;

  constructor(private readonly scene: Scene, private readonly seed: string, private readonly backend: TerrainBackend) {
    this.vegetation = new VegetationMesh(scene);
  }

  get viewRadius(): number { return this.radius; }

  setFlightStreaming(altitude?: number, speed = 0, highDetail = false, trackTurnRate = 0): void {
    let cells: TerrainCells = 64;
    if (altitude !== undefined) {
      if (altitude > (this.maxCells === 8 ? 700 : 1000)) cells = 8;
      else if (altitude > (this.maxCells < 64 ? 150 : 300)) cells = 16;
    }
    const ahead = altitude === undefined ? 0 : Math.max(2, Math.min(16, Math.ceil(Math.max(0, speed) * 8 / CHUNK_SIZE)));
    // Quantize the predicted sweep to avoid rebuilding the queue for small changes in bank.
    const seconds = ahead ? Math.min(8, ahead * CHUNK_SIZE / Math.max(1, speed)) : 0;
    const turn = speed >= 40 && seconds ? Math.max(-3, Math.min(3, Math.round(trackTurnRate * seconds * 12 / Math.PI))) : 0;
    const fine = altitude === undefined || highDetail ? 2 : 1;
    if (cells !== this.maxCells || ahead !== this.flightAhead || turn !== this.flightTurn || fine !== this.fineRadius) {
      this.maxCells = cells; this.flightAhead = ahead; this.flightTurn = turn; this.fineRadius = fine; this.center = '';
    }
  }

  readyAt(x: number, z: number) {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    let completed = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const key = `${cx + dx},${cz + dz}`, desired = this.desired.get(key);
      if (desired && matches(this.applied.get(key), desired)) completed++;
    }
    return { ready: completed === 9, completed, total: 9, error: this.error };
  }

  setSeason(season: SeasonState): void {
    seasonMaterial(this.material, season, 'terrain');
    this.vegetation.setSeason(season);
  }

  get stats() {
    let high = 0, medium = 0, low = 0;
    for (const chunk of this.active.values()) {
      if (chunk.cells === 64) high++;
      else if (chunk.cells === 16) medium++;
      else low++;
    }
    const visiblePending = [...this.pending].filter(([key, request]) => matches(this.desired.get(key), request)).length;
    return { active: this.active.size, target: (this.viewRadius * 2 + 1) ** 2, allocated: this.allocated.size, pooled: this.allocated.size - this.active.size,
      pending: visiblePending + this.ready.length, queued: this.plan.filter((request) => !matches(this.applied.get(request.key), request)).length,
      prefetched: this.prefetched.size, preloading: this.pending.size - visiblePending,
      completed: this.completed, high, medium, low };
  }

  update(x: number, z: number, forward: { x: number; z: number }, corridor: RoadCorridor | null): void {
    if (this.disposed) return;
    const center = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
    const bearings = this.flightAhead ? 16 : 8;
    const direction = (Math.round(Math.atan2(forward.x, -forward.z) * bearings / (2 * Math.PI)) + bearings) % bearings;
    if (center !== this.center || direction !== this.direction || corridor !== this.plannedRoad) {
      this.center = center;
      this.direction = direction; this.plannedRoad = corridor;
      const prepare = (requests: ChunkRequest[]): TerrainRequest[] => requests.map(request => ({ ...request, vegetation: this.maxCells === 64,
        cells: this.maxCells === 64 && corridor?.needsDetail(request.x, request.z) ? 64 : request.cells, signature: corridor?.signature(request.x, request.z) ?? '' }));
      this.plan = prepare(planChunks(x, z, forward, this.viewRadius, this.maxCells, this.fineRadius));
      this.desired = new Map(this.plan.map((request) => [request.key, request]));
      this.priority = new Map(this.plan.map((request, index) => [request.key, index]));
      const angle = direction * 2 * Math.PI / bearings;
      const next = new Map<string, TerrainRequest>();
      if (corridor) for (let step = 1; step <= (this.flightAhead || this.preload); step++) {
        const halfSweep = this.flightTurn ? this.flightTurn * Math.PI / 24 * step / this.flightAhead : 0;
        const distance = CHUNK_SIZE * step * (halfSweep ? Math.sin(halfSweep) / halfSweep : 1);
        const dx = Math.sin(angle + halfSweep), dz = -Math.cos(angle + halfSweep);
        const targetX = x + distance * (this.flightAhead ? dx : Math.round(dx));
        const targetZ = z + distance * (this.flightAhead ? dz : Math.round(dz));
        for (const request of prepare(planChunks(targetX, targetZ, forward, this.flightAhead ? 1 : this.viewRadius, this.maxCells, this.fineRadius)))
          if (!matches(this.desired.get(request.key), request) && !next.has(request.key) && next.size < 128) next.set(request.key, request);
      }
      this.ahead = next;
      if (this.flightAhead) {
        const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
        const core: TerrainRequest[] = [], remaining: TerrainRequest[] = [];
        for (const request of this.plan) {
          const ring = Math.max(Math.abs(request.x - cx), Math.abs(request.z - cz));
          (ring <= 2 ? core : remaining).push(request);
        }
        const ahead = [...this.ahead.values()];
        this.queue = [...core, ...ahead.slice(0, 18), ...remaining, ...ahead.slice(18)];
      } else this.queue = [...this.plan, ...this.ahead.values()];
      for (let i = this.ready.length - 1; i >= 0; i--) if (!matches(this.desired.get(this.ready[i].request.key), this.ready[i].request)) this.ready.splice(i, 1);
      for (const [key, result] of this.prefetched) {
        if (matches(this.desired.get(key), result.request)) { this.ready.push(result); this.prefetched.delete(key); }
        else if (!matches(this.ahead.get(key), result.request)) this.prefetched.delete(key);
      }
      for (const [key, chunk] of this.active) {
        if (!this.desired.has(key)) { this.active.delete(key); this.applied.delete(key); this.vegetation.removeChunk(key); this.release(chunk); }
      }
      this.vegetation.setViewCenter(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    }
    this.pump();
  }

  pump(): void {
    if (this.disposed) return;
    const started = performance.now();
    if (this.ready.length > 1) {
      this.ready.sort((a, b) => this.priority.get(a.request.key)! - this.priority.get(b.request.key)!);
    }
    let uploaded = 0;
    while (this.ready.length && uploaded < this.uploadLimit && performance.now() - started < this.uploadBudget) {
      const result = this.ready.shift()!;
      if (!matches(this.desired.get(result.request.key), result.request)) continue;
      const previous = this.active.get(result.request.key);
      if (previous) this.release(previous);
      const chunk = this.acquire(result.request.cells);
      chunk.apply(result.request, result.data, this.originX, this.originZ);
      this.active.set(result.request.key, chunk);
      this.applied.set(result.request.key, result.request);
      this.vegetation.setChunk(result.request.key, result.request.x, result.request.z, result.data.vegetation);
      this.completed++;
      uploaded++;
    }
    this.vegetation.update(this.originX, this.originZ);
    const corridor = this.plannedRoad;
    if (this.error || !corridor) return;
    for (const request of this.queue) {
      if (this.pending.size + this.ready.length >= this.backend.capacity) break;
      if (matches(this.applied.get(request.key), request) || this.pending.has(request.key) || matches(this.prefetched.get(request.key)?.request, request)
        || this.ready.some((result) => result.request.key === request.key)) continue;
      this.pending.set(request.key, request);
      const chunkRequest: ChunkRequest = { key: request.key, x: request.x, z: request.z, cells: request.cells, vegetation: request.vegetation };
      void this.backend.generate(chunkRequest, this.seed, corridor.forChunk(request.x, request.z), corridor.services.forChunk(request.x, request.z)).then((data) => {
        this.pending.delete(request.key);
        if (this.disposed) return;
        if (matches(this.desired.get(request.key), request)) this.ready.push({ request, data });
        else if (matches(this.ahead.get(request.key), request) && this.prefetched.size < 128) this.prefetched.set(request.key, { request, data });
      }, (error: unknown) => {
        this.pending.delete(request.key);
        if (!this.disposed) this.error = error instanceof Error ? error.message : String(error);
      });
    }
  }

  private acquire(cells: TerrainCells): TerrainChunk {
    const reusable = this.pooled[cells].pop();
    if (reusable) return reusable;
    const chunk = new TerrainChunk(cells, this.material);
    this.allocated.add(chunk);
    this.scene.add(chunk.mesh);
    return chunk;
  }

  setViewRadius(radius: number): void {
    if (!VIEW_RADII.some(value => value === radius)) throw new Error('Invalid view distance');
    if (this.radius !== radius) { this.radius = radius; this.center = ''; }
  }

  setPreload(distance: number): void {
    const value = Number.isFinite(distance) ? Math.max(0, Math.min(3, Math.round(distance))) : 1;
    if (value !== this.preload) { this.preload = value; this.center = ''; }
  }

  private release(chunk: TerrainChunk): void {
    chunk.mesh.visible = false;
    if (this.pooled[chunk.cells].length < POOL_LIMITS[chunk.cells]) this.pooled[chunk.cells].push(chunk);
    else { this.allocated.delete(chunk); chunk.dispose(); }
  }

  setOrigin(x: number, z: number): void {
    this.originX = x;
    this.originZ = z;
    this.terrainOrigin.set(x % 4096, z % 4096);
    for (const chunk of this.active.values()) chunk.setOrigin(x, z);
    this.vegetation.update(x, z);
  }

  setWireframe(enabled: boolean): void { this.material.wireframe = enabled; }

  dispose(): void {
    this.disposed = true;
    this.backend.dispose();
    this.vegetation.dispose();
    for (const chunk of this.allocated) chunk.dispose();
    this.active.clear();
    this.applied.clear(); this.desired.clear(); this.priority.clear(); this.plan = []; this.queue = []; this.plannedRoad = null;
    this.allocated.clear();
    this.pending.clear();
    this.ready.length = 0;
    this.prefetched.clear(); this.ahead.clear();
    for (const chunks of Object.values(this.pooled)) chunks.length = 0;
    this.material.dispose();
  }
}
