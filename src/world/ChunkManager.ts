import { Vector2, type Scene } from 'three';
import { TerrainChunk } from '../terrain/TerrainChunk';
import type { TerrainData } from '../terrain/TerrainGenerator';
import type { TerrainBackend } from '../terrain/TerrainWorkers';
import { CHUNK_SIZE, planChunks, VIEW_RADII, VIEW_RADIUS, type ChunkRequest, type TerrainCells } from './ChunkPlanner';
import type { RoadCorridor } from '../road/RoadCorridor';
import { VegetationMesh } from '../vegetation/VegetationMesh';
import { createTerrainMaterial } from '../terrain/TerrainMaterial';

const POOL_LIMITS: Record<TerrainCells, number> = { 64: 25, 16: 56, 8: 208 };
interface TerrainRequest extends ChunkRequest { signature: string }
const matches = (a: TerrainRequest | undefined, b: TerrainRequest): boolean => a?.cells === b.cells && a.signature === b.signature;

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
  private queue: TerrainRequest[] = [];
  private center = '';
  private plannedRoad: RoadCorridor | null = null;
  private direction = NaN;
  private originX = 0;
  private originZ = 0;
  private disposed = false;
  private completed = 0;
  private radius = VIEW_RADIUS;
  error = '';
  readonly vegetation: VegetationMesh;

  constructor(private readonly scene: Scene, private readonly seed: string, private readonly backend: TerrainBackend) {
    this.vegetation = new VegetationMesh(scene);
  }

  get viewRadius(): number { return this.radius; }

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
    const direction = Math.round(Math.atan2(forward.x, -forward.z) * 4 / Math.PI);
    if (center !== this.center || direction !== this.direction || corridor !== this.plannedRoad) {
      this.center = center;
      this.direction = direction; this.plannedRoad = corridor;
      const prepare = (requests: ChunkRequest[]): TerrainRequest[] => requests.map(request => ({ ...request,
        cells: corridor?.needsDetail(request.x, request.z) ? 64 : request.cells, signature: corridor?.signature(request.x, request.z) ?? '' }));
      this.plan = prepare(planChunks(x, z, forward, this.viewRadius));
      this.desired = new Map(this.plan.map((request) => [request.key, request]));
      const angle = direction * Math.PI / 4;
      const next = corridor ? prepare(planChunks(x + Math.round(Math.sin(angle)) * CHUNK_SIZE, z - Math.round(Math.cos(angle)) * CHUNK_SIZE, forward, this.viewRadius)) : [];
      this.ahead = new Map(next.filter(request => !matches(this.desired.get(request.key), request)).slice(0, 128).map(request => [request.key, request]));
      this.queue = [...this.plan, ...this.ahead.values()];
      for (let i = this.ready.length - 1; i >= 0; i--) if (!matches(this.desired.get(this.ready[i].request.key), this.ready[i].request)) this.ready.splice(i, 1);
      for (const [key, result] of this.prefetched) {
        if (matches(this.desired.get(key), result.request)) { this.ready.push(result); this.prefetched.delete(key); }
        else if (!matches(this.ahead.get(key), result.request)) this.prefetched.delete(key);
      }
      for (const [key, chunk] of this.active) {
        if (!this.desired.has(key)) { this.active.delete(key); this.applied.delete(key); this.vegetation.removeChunk(key); this.release(chunk); }
      }
    }
    const started = performance.now();
    let uploaded = 0;
    while (this.ready.length && uploaded < 2 && performance.now() - started < 2) {
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
    this.vegetation.setViewCenter(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    this.vegetation.update(this.originX, this.originZ);
    if (this.error || !corridor) return;
    for (const request of this.queue) {
      if (this.pending.size + this.ready.length >= this.backend.capacity) break;
      if (matches(this.applied.get(request.key), request) || this.pending.has(request.key) || matches(this.prefetched.get(request.key)?.request, request)
        || this.ready.some((result) => result.request.key === request.key)) continue;
      this.pending.set(request.key, request);
      const chunkRequest: ChunkRequest = { key: request.key, x: request.x, z: request.z, cells: request.cells };
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
    this.applied.clear(); this.desired.clear(); this.plan = []; this.queue = []; this.plannedRoad = null;
    this.allocated.clear();
    this.pending.clear();
    this.ready.length = 0;
    this.prefetched.clear(); this.ahead.clear();
    for (const chunks of Object.values(this.pooled)) chunks.length = 0;
    this.material.dispose();
  }
}
