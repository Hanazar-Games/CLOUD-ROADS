import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { ChunkManager } from '../src/world/ChunkManager';
import { planChunks, type ChunkRequest } from '../src/world/ChunkPlanner';
import { TerrainGenerator, type TerrainData } from '../src/terrain/TerrainGenerator';
import type { TerrainBackend } from '../src/terrain/TerrainWorkers';
import { RoadCorridor } from '../src/road/RoadCorridor';

const emptyCorridor = new RoadCorridor([]);

class DeferredTerrain implements TerrainBackend {
  readonly capacity = 2;
  disposed = false;
  jobs: { request: ChunkRequest; resolve: (data: TerrainData) => void; reject: (error: Error) => void }[] = [];
  generate(request: ChunkRequest): Promise<TerrainData> {
    return new Promise((resolve, reject) => this.jobs.push({ request, resolve, reject }));
  }
  dispose(): void { this.disposed = true; }
  async complete(): Promise<void> {
    const jobs = this.jobs.splice(0);
    for (const job of jobs) job.resolve(new TerrainGenerator('test').generate(job.request.x, job.request.z, job.request.cells));
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe('ChunkManager lifecycle', () => {
  it('rejects terrain generated before a local road change, even without moving', async () => {
    const backend = new DeferredTerrain(), manager = new ChunkManager(new Scene(), 'test', backend);
    const forward = { x: 0, z: -1 };
    manager.update(128, 128, forward, emptyCorridor);
    const point = { x: 0, y: 20, z: 0, nx: 0, ny: 1, nz: 0, ground: 1 };
    const changed = new RoadCorridor([{ a: point, b: { ...point, x: 256 } }]);
    manager.update(128, 128, forward, changed);
    await backend.complete();
    manager.update(128, 128, forward, changed);
    expect(manager.stats.completed).toBe(0);
    expect(backend.jobs.some(job => job.request.key === '0,0')).toBe(true);
    manager.dispose();
  });

  it('refreshes only affected terrain and reuses equivalent corridor snapshots', async () => {
    const backend = new DeferredTerrain(), manager = new ChunkManager(new Scene(), 'test', backend);
    manager.setViewRadius(6);
    const forward = { x: 0, z: -1 };
    for (let frame = 0; frame < 220; frame++) { manager.update(128, 128, forward, emptyCorridor); await backend.complete(); }
    const completed = manager.stats.completed;
    const point = { x: 100, y: 20, z: 100, nx: 0, ny: 1, nz: 0, ground: 1 };
    const changed = new RoadCorridor([{ a: point, b: { ...point, x: 150 } }]);
    for (let frame = 0; frame < 12; frame++) { manager.update(128, 128, forward, changed); await backend.complete(); }
    expect(manager.stats.completed - completed).toBe(1);
    manager.update(128, 128, forward, new RoadCorridor([...changed.edges]));
    expect(backend.jobs).toHaveLength(0);
    manager.dispose();
  }, 20000);

  it('prepares the next view while stationary and consumes it without regenerating visible terrain', async () => {
    const backend = new DeferredTerrain(), scene = new Scene(), manager = new ChunkManager(scene, 'test', backend);
    manager.setViewRadius(6);
    const forward = { x: 0, z: -1 };
    for (let frame = 0; frame < 220; frame++) {
      manager.update(128, 128, forward, emptyCorridor);
      await backend.complete();
    }
    expect(manager.stats.active).toBe(169);
    expect(manager.stats.prefetched).toBeGreaterThan(0);
    expect(manager.stats.prefetched).toBeLessThanOrEqual(128);
    const next = new Set(planChunks(128, -1, forward, 6).map(request => `${request.key}:${request.cells}`));
    for (let frame = 0; frame < 30; frame++) {
      manager.update(128, -1, forward, emptyCorridor);
      expect(backend.jobs.filter(job => next.has(`${job.request.key}:${job.request.cells}`))).toHaveLength(0);
      await backend.complete();
    }
    expect(manager.stats.active).toBe(169);
    manager.update(100000, 100000, forward, null);
    expect(manager.stats.prefetched).toBe(0);
    manager.dispose(); expect(scene.children).toHaveLength(0);
  }, 20000);

  it('discards old results during road replay and reprioritizes newly faced terrain', async () => {
    const backend = new DeferredTerrain(), manager = new ChunkManager(new Scene(), 'test', backend);
    manager.update(0, 0, { x: 0, z: -1 }, emptyCorridor);
    await backend.complete();
    manager.update(100000, 100000, { x: 0, z: -1 }, null);
    expect(manager.stats.active).toBe(0);
    manager.update(100000, 100000, { x: 0, z: -1 }, emptyCorridor);
    expect(backend.jobs.every(job => job.request.x > 380 && job.request.z > 380)).toBe(true);
    await backend.complete();
    manager.update(100000, 100000, { x: 0, z: 1 }, emptyCorridor);
    expect(backend.jobs.some(job => job.request.x === 390 && job.request.z === 391)).toBe(true);
    manager.dispose();
  });
  it('waits for complete road coverage before issuing terrain jobs', () => {
    const backend = new DeferredTerrain();
    const manager = new ChunkManager(new Scene(), 'test', backend);
    manager.update(0, 0, { x: 0, z: -1 }, null);
    expect(backend.jobs).toHaveLength(0);
    manager.update(0, 0, { x: 0, z: -1 }, emptyCorridor);
    expect(backend.jobs).toHaveLength(2);
    manager.dispose();
  });

  it('discards stale jobs after a teleport and bounds pending work', async () => {
    const backend = new DeferredTerrain();
    const manager = new ChunkManager(new Scene(), 'test', backend);
    manager.update(0, 0, { x: 0, z: -1 }, emptyCorridor);
    expect(backend.jobs).toHaveLength(2);
    manager.update(100_000, 100_000, { x: 0, z: -1 }, emptyCorridor);
    expect(backend.jobs).toHaveLength(2);
    await backend.complete();
    manager.update(100_000, 100_000, { x: 0, z: -1 }, emptyCorridor);
    expect(manager.stats.active).toBe(0);
    expect(backend.jobs.every((job) => job.request.x > 380 && job.request.z > 380)).toBe(true);
    await backend.complete();
    manager.update(100_000, 100_000, { x: 0, z: -1 }, emptyCorridor);
    manager.update(100_000, 100_000, { x: 0, z: -1 }, emptyCorridor);
    expect(manager.stats.active).toBe(2);
    manager.dispose();
    await backend.complete();
    expect(manager.stats.active).toBe(0);
    expect(backend.disposed).toBe(true);
  });

  it('reuses geometry after leaving an area and moves visible chunks during rebasing', async () => {
    const backend = new DeferredTerrain();
    const scene = new Scene();
    const manager = new ChunkManager(scene, 'test', backend);
    manager.update(0, 0, { x: 0, z: -1 }, emptyCorridor);
    await backend.complete();
    manager.update(0, 0, { x: 0, z: -1 }, emptyCorridor);
    manager.update(0, 0, { x: 0, z: -1 }, emptyCorridor);
    const allocated = manager.stats.allocated;
    const visible = scene.children.filter((mesh) => mesh.visible);
    const xBefore = visible[0].position.x;
    manager.setOrigin(5120, -5120);
    expect(visible[0].position.x).toBe(xBefore - 5120);
    manager.update(100_000, 100_000, { x: 0, z: -1 }, emptyCorridor);
    await backend.complete();
    manager.update(100_000, 100_000, { x: 0, z: -1 }, emptyCorridor);
    await backend.complete();
    manager.update(100_000, 100_000, { x: 0, z: -1 }, emptyCorridor);
    manager.update(100_000, 100_000, { x: 0, z: -1 }, emptyCorridor);
    expect(manager.stats.allocated).toBe(allocated);
    expect(manager.stats.active).toBe(2);
    manager.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('reports worker failures and stops scheduling until the world is restarted', async () => {
    const backend = new DeferredTerrain();
    const manager = new ChunkManager(new Scene(), 'test', backend);
    manager.update(0, 0, { x: 0, z: -1 }, emptyCorridor);
    for (const job of backend.jobs.splice(0)) job.reject(new Error('worker failed'));
    await Promise.resolve();
    await Promise.resolve();
    manager.update(0, 0, { x: 0, z: -1 }, emptyCorridor);
    expect(manager.error).toContain('worker failed');
    expect(backend.jobs).toHaveLength(0);
    manager.dispose();
  });
});
