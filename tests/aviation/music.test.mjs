import test from 'node:test';
import assert from 'node:assert/strict';
import { composeBeat } from '../../src/aviation/music.js';
import { FLIGHT_MUSIC } from '../../src/aviation/aircraft-music.js';
const MISSIONS = Object.values(FLIGHT_MUSIC);

test('aircraft scores are deterministic, bounded and have distinct keys', () => {
  const scores = new Set();
  for (const mission of MISSIONS) {
    const score = Array.from({ length: 128 }, (_, step) => composeBeat(step, mission.music, 1));
    assert.deepEqual(score, Array.from({ length: 128 }, (_, step) => composeBeat(step, mission.music, 1)));
    assert.ok(score.flat().every(note => note.frequency > 20 && note.frequency < 12000 && note.volume <= 0.42 && note.duration < 3));
    assert.ok(score.every(notes => notes.length <= 10));
    assert.ok(score.flat().some(note => note.kind === 'snare'));
    scores.add(JSON.stringify(score));
  }
  assert.equal(scores.size, MISSIONS.length);
});

test('menu has no percussion; racing layers respond to actual speed', () => {
  const theme = MISSIONS[0].music;
  const menu = Array.from({ length: 16 }, (_, step) => composeBeat(step, theme, 0, true)).flat();
  assert.ok(menu.every(note => !['kick', 'snare', 'hat'].includes(note.kind)));
  const slow = Array.from({ length: 16 }, (_, step) => composeBeat(step, theme, 0)).flat();
  const fast = Array.from({ length: 16 }, (_, step) => composeBeat(step, theme, 1)).flat();
  assert.ok(fast.length > slow.length);
  assert.ok(fast.some(note => note.kind === 'kick'));
});

test('flight scores soften percussion at taxi speed and keep phrases in time with the tempo', () => {
  const theme = { root: 50, bpm: 100, mode: 'major', voice: 'triangle' };
  const slow = composeBeat(0, theme, 0), fast = composeBeat(0, theme, 1);
  assert.ok(slow.find(n => n.kind === 'kick').volume < fast.find(n => n.kind === 'kick').volume);
  assert.ok(composeBeat(0, { ...theme, bpm: 140 }, 0).find(n => n.kind === 'pad').duration < slow.find(n => n.kind === 'pad').duration);
  assert.ok(MISSIONS.some(m => m.music.mode === 'major'));
  assert.ok(MISSIONS.some(m => m.music.voice === 'triangle'));
});
