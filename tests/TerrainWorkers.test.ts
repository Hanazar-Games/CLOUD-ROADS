import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TerrainWorkers } from '../src/terrain/TerrainWorkers';

class FakeWorker {
  static instances: FakeWorker[] = [];
  static failAt = -1;
  onmessage?: (event: MessageEvent) => void;
  onerror?: (event: ErrorEvent) => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    if (FakeWorker.instances.length === FakeWorker.failAt) throw new Error('Worker unavailable');
    FakeWorker.instances.push(this);
  }
}
const request = { key: '0,0', x: 0, z: 0, cells: 8 as const };

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.failAt = -1;
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('navigator', { hardwareConcurrency: 4 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('ignores mismatched replies, resolves the correct job and clears its timer', async () => {
  const workers = new TerrainWorkers();
  const data = { positions: new Float32Array(), normals: new Float32Array(), colors: new Float32Array() };
  const result = workers.generate(request, 'test', []);
  const worker = FakeWorker.instances[0];
  worker.onmessage!({ data: { id: 99, data } } as MessageEvent);
  expect(vi.getTimerCount()).toBe(1);
  worker.onmessage!({ data: { id: 0, data } } as MessageEvent);
  await expect(result).resolves.toBe(data);
  expect(vi.getTimerCount()).toBe(0);
  workers.dispose();
});

it('terminates failed workers and rejects all pending jobs on timeout', async () => {
  const workers = new TerrainWorkers();
  const first = expect(workers.generate(request, 'test', [])).rejects.toThrow('timed out');
  const second = expect(workers.generate(request, 'test', [])).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(15_000);
  await Promise.all([first, second]);
  expect(FakeWorker.instances.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await expect(workers.generate(request, 'test', [])).rejects.toThrow('timed out');
  workers.dispose();
});

it('cleans up synchronous message failures instead of leaking a pending timer', async () => {
  const workers = new TerrainWorkers();
  FakeWorker.instances[0].postMessage.mockImplementation(() => { throw new Error('Cannot clone payload'); });
  await expect(workers.generate(request, 'test', [])).rejects.toThrow('Cannot clone payload');
  expect(vi.getTimerCount()).toBe(0);
  expect(FakeWorker.instances.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
  workers.dispose();
});

it('remembers a startup error even before a job is submitted', async () => {
  const workers = new TerrainWorkers();
  FakeWorker.instances[0].onerror!({ message: 'Module failed' } as ErrorEvent);
  const result = workers.generate(request, 'test', []).catch((error: Error) => error);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(await result).toEqual(new Error('Module failed'));
  workers.dispose();
});

it('releases already created workers if pool construction fails', () => {
  FakeWorker.failAt = 1;
  expect(() => new TerrainWorkers()).toThrow('Worker unavailable');
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
});

it('settles pending jobs when disposed and refuses new work', async () => {
  const workers = new TerrainWorkers();
  const result = expect(workers.generate(request, 'test', [])).rejects.toThrow('stopped');
  workers.dispose();
  await result;
  expect(vi.getTimerCount()).toBe(0);
  await expect(workers.generate(request, 'test', [])).rejects.toThrow('stopped');
});

it('stops the entire pool when generation reports an error', async () => {
  const workers = new TerrainWorkers();
  const result = expect(workers.generate(request, 'test', [])).rejects.toThrow('Generation failed');
  FakeWorker.instances[0].onmessage!({ data: { id: 0, error: 'Generation failed' } } as MessageEvent);
  await result;
  expect(FakeWorker.instances.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
