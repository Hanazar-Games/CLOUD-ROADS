import { expect, it } from 'vitest';
import { RuntimeLog } from '../src/debug/RuntimeLog';

it('bounds memory, coalesces consecutive duplicates and keeps export snapshots independent', () => {
  const log = new RuntimeLog(3);
  for (let i = 0; i < 5; i++) log.write('info', 'world', `chunk ${i}`);
  log.write('info', 'world', 'chunk 4');
  const snapshot = log.snapshot();
  expect(snapshot.map(e => e.message)).toEqual(['chunk 2', 'chunk 3', 'chunk 4']);
  expect(snapshot[2].count).toBe(2);
  log.write('info', 'world', 'chunk 4'); expect(snapshot[2].count).toBe(2);
  log.capacity = 2; expect(log.snapshot()).toHaveLength(2);
});

it('accepts errors and cyclic rejection values, truncates text and supports recording controls', () => {
  const log = new RuntimeLog(), cycle: Record<string, unknown> = {}; cycle.self = cycle;
  log.write('error', 'runtime', new Error('resume failed'));
  log.write('warn', 'runtime', cycle); log.write('info', 'runtime', 'x'.repeat(20000));
  expect(log.snapshot()[0].message).toContain('resume failed');
  expect(log.snapshot()[2].message.length).toBeLessThanOrEqual(2001);
  log.recording = false; log.write('error', 'runtime', 'ignored'); expect(log.snapshot()).toHaveLength(3);
  const file = JSON.parse(log.export({ version: 'test', metrics: { FPS: 60 } }));
  expect(file.entries).toHaveLength(3); expect(file.metrics.FPS).toBe(60);
  log.clear(); expect(log.snapshot()).toEqual([]);
});
