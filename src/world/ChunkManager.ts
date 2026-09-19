import { MeshStandardMaterial, type Scene } from 'three';
import { TerrainChunk } from '../terrain/TerrainChunk';
import type { TerrainData } from '../terrain/TerrainGenerator';
import type { TerrainBackend } from '../terrain/TerrainWorkers';
import { CHUNK_SIZE, planChunks, VIEW_RADII, VIEW_RADIUS, type ChunkRequest, type TerrainCells } from './ChunkPlanner';
import type { RoadCorridor } from '../road/RoadCorridor';
import { VegetationMesh } from '../vegetation/VegetationMesh';

const POOL_LIMITS: Record<TerrainCells, number> = { 64: 25, 16: 56, 8: 208 };

export class ChunkManager {
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  private readonly active = new Map<string, TerrainChunk>();
  private readonly pooled: Record<TerrainCells, TerrainChunk[]> = { 8: [], 16: [], 64: [] };
  private readonly allocated = new Set<TerrainChunk>();
  private readonly pending = new Map<string, TerrainCells>();
  private readonly ready: { request: ChunkRequest; data: TerrainData }[] = [];
  private desired = new Map<string, ChunkRequest>();
  private plan: ChunkRequest[] = [];
  private center = '';
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
    return { active: this.active.size, target: (this.viewRadius * 2 + 1) ** 2, allocated: this.allocated.size, pooled: this.allocated.size - this.active.size,
      pending: this.pending.size + this.ready.length, queued: this.plan.filter((request) => this.active.get(request.key)?.cells !== request.cells).length,
      completed: this.completed, high, medium, low };
  }

  update(x: number, z: number, forward: { x: number; z: number }, corridor: RoadCorridor | null): void {
    if (this.disposed) return;
    const center = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
    if (corridor && center !== this.center) {
      this.center = center;
      this.plan = planChunks(x, z, forward, this.viewRadius);
      for (const request of this.plan) if (corridor.needsDetail(request.x, request.z)) request.cells = 64;
      this.desired = new Map(this.plan.map((request) => [request.key, request]));
      for (const [key, chunk] of this.active) {
        if (!this.desired.has(key)) { this.active.delete(key); this.vegetation.removeChunk(key); this.release(chunk); }
      }
    }
    const started = performance.now();
    let uploaded = 0;
    while (this.ready.length && uploaded < 2 && performance.now() - started < 2) {
      const result = this.ready.shift()!;
      if (this.desired.get(result.request.key)?.cells !== result.request.cells) continue;
      const previous = this.active.get(result.request.key);
      if (previous) this.release(previous);
      const chunk = this.acquire(result.request.cells);
      chunk.apply(result.request, result.data, this.originX, this.originZ);
      this.active.set(result.request.key, chunk);
      this.vegetation.setChunk(result.request.key, result.request.x, result.request.z, result.data.vegetation);
      this.completed++;
      uploaded++;
    }
    this.vegetation.setViewCenter(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    this.vegetation.update(this.originX, this.originZ);
    if (this.error || !corridor) return;
    for (const request of this.plan) {
      if (this.pending.size + this.ready.length >= this.backend.capacity) break;
      if (this.active.get(request.key)?.cells === request.cells || this.pending.has(request.key) || this.ready.some((result) => result.request.key === request.key)) continue;
      this.pending.set(request.key, request.cells);
      void this.backend.generate(request, this.seed, corridor.forChunk(request.x, request.z), corridor.services.forChunk(request.x, request.z)).then((data) => {
        this.pending.delete(request.key);
        if (!this.disposed && this.desired.get(request.key)?.cells === request.cells) this.ready.push({ request, data });
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
    this.allocated.clear();
    this.pending.clear();
    this.ready.length = 0;
    for (const chunks of Object.values(this.pooled)) chunks.length = 0;
    this.material.dispose();
  }
}
