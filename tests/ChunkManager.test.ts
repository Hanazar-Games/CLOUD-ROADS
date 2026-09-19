import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { ChunkManager } from '../src/world/ChunkManager';
import type { ChunkRequest } from '../src/world/ChunkPlanner';
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
