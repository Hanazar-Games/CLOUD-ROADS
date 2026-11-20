import { afterEach, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { FlightHorizon } from '../src/aviation/FlightHorizon';
import type { World } from '../src/world/World';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { buildFlightHorizon } from '../src/aviation/FlightHorizonData';

afterEach(() => vi.unstubAllGlobals());

it('reports worker network errors even when the browser supplies no error message', () => {
  class FailedWorker {
    static instance: FailedWorker;
    onerror?: (event: { message: string }) => void;
    constructor() { FailedWorker.instance = this; }
    terminate = vi.fn();
  }
  vi.stubGlobal('Worker', FailedWorker);
  const horizon = new FlightHorizon(new Scene(), {} as World);
  FailedWorker.instance.onerror!({ message: '' });
  expect(horizon.error).toBeTruthy();
  expect(FailedWorker.instance.terminate).toHaveBeenCalledOnce();
  horizon.dispose();
});

it('keeps the full 160 km skyline below 5000 vertices', () => {
  const height = new HeightFunction('HORIZON-BUDGET');
  const data = buildFlightHorizon(height, DEFAULT_OPTIONS.terrain, 0, 0, 256, 160000);
  expect(data.positions.length / 3).toBeLessThan(5000);
});

it('shades coarse terrain from its mesh slope without stretching fine surface normals into distant bands', () => {
  const height = new HeightFunction('SMOOTH-HORIZON');
  vi.spyOn(height, 'sample').mockImplementation((x, z) => x * .1 + (x === 24 && z === 256 ? 1000 : 0));
  const data = buildFlightHorizon(height, DEFAULT_OPTIONS.terrain, 0, 0, 256, 30000);
  const index = data.positions.findIndex((value, i) => i % 3 === 0 && value === 32 && data.positions[i + 2] === 256);
  expect(index).toBeGreaterThanOrEqual(0);
  expect(data.normals[index]).toBeCloseTo(-.1 / Math.hypot(.1, 1), 4);
  expect(data.normals[index + 1]).toBeCloseTo(1 / Math.hypot(.1, 1), 4);
});

it('confirms actual horizon coverage, replaces stale teleport work and reuses GPU geometry', () => {
  class FakeWorker {
    static instance: FakeWorker;
    onmessage?: (event: unknown) => void;
    messages: { id: number; x: number; z: number; far: number }[] = [];
    constructor() { FakeWorker.instance = this; }
    postMessage(message: typeof this.messages[number]) { this.messages.push(message); }
    terminate = vi.fn();
  }
  vi.stubGlobal('Worker', FakeWorker);
  const scene = new Scene(), world = { origin: { x: 0, z: 0 }, seed: 'HORIZON', options: DEFAULT_OPTIONS } as World;
  const horizon = new FlightHorizon(scene, world), worker = FakeWorker.instance;
  const result = buildFlightHorizon(new HeightFunction('HORIZON'), DEFAULT_OPTIONS.terrain, 0, 0, 256, 30000);
  horizon.update(0, 0, 30000);
  expect(horizon.readyAt(0, 0, 30000)).toBe(false);
  horizon.update(12000, 0, 30000);
  worker.onmessage!({ data: { ...worker.messages[0], result } });
  expect(horizon.readyAt(12000, 0, 30000)).toBe(false);
  expect(worker.messages).toHaveLength(2);
  worker.onmessage!({ data: { ...worker.messages[1], result } });
  expect(horizon.readyAt(12000, 0, 30000)).toBe(false);
  horizon.confirmRendered();
  expect(horizon.readyAt(12000, 0, 30000)).toBe(true);
  const mesh = scene.getObjectByName('cloud-roads-flight-horizon')!;
  const geometry = Reflect.get(mesh, 'geometry');
  horizon.update(13000, 0, 30000);
  worker.onmessage!({ data: { ...worker.messages[2], result } });
  expect(Reflect.get(mesh, 'geometry')).toBe(geometry);
  horizon.dispose(); expect(scene.children).toHaveLength(0);
});

it('builds bounded distant terrain from the current seed and airport ground', () => {
  const height = new HeightFunction('HORIZON'), site = height.airports[0];
  const data = buildFlightHorizon(height, DEFAULT_OPTIONS.terrain, site.x, site.z, 512, 30000);
  expect(data.positions.length / 3).toBeLessThan(12000);
  expect(data.indices.length % 3).toBe(0);
  let radius = 0;
  for (let i = 0; i < data.positions.length; i += 3) {
    const x = data.positions[i], y = data.positions[i + 1], z = data.positions[i + 2];
    radius = Math.max(radius, Math.abs(x), Math.abs(z));
    expect(Math.max(Math.abs(x), Math.abs(z))).toBeGreaterThanOrEqual(512);
    expect(y).toBeCloseTo(height.sample(site.x + x, site.z + z) - 3, 2);
  }
  expect(radius).toBe(30000);
  expect([...data.colors].every(Number.isFinite)).toBe(true);
});
