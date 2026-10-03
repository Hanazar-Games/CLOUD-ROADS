import { expect, it } from 'vitest';
import { ModelLoadQueue } from '../src/render/ModelLoadQueue';

it('spends one shared soft budget on nearest proxies before detailed models', () => {
  let now = 0; const order: string[] = [], queue = new ModelLoadQueue(() => now);
  function* job(name: string) { for (let i = 0; i < 3; i++) { order.push(name); now++; yield; } }
  queue.request('detail', 10001, () => job('detail'));
  queue.request('far', 500, () => job('far'));
  queue.request('near', 10, () => job('near'));
  queue.pump(2);
  expect(order).toEqual(['near', 'near']);
  queue.request('near', 10, () => job('duplicate'));
  queue.pump(2);
  expect(order).toEqual(['near', 'near', 'near']);
  expect(queue.pending).toBe(0);
});

it('cancels obsolete builds and frees partially built resources on disposal', () => {
  let now = 0, released = 0; const queue = new ModelLoadQueue(() => now);
  function* job() { try { now++; yield; now++; yield; } finally { released++; } }
  queue.request('old', 0, job); queue.pump(1);
  queue.pump(1); expect(released).toBe(1);
  queue.request('new', 0, job); queue.pump(1); queue.dispose();
  expect(released).toBe(2); expect(queue.pending).toBe(0);
});
