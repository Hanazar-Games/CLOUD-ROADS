import { afterEach, expect, it, vi } from 'vitest';
import { AudioSystem, type SoundState } from '../src/audio/AudioSystem';

const idle: SoundState = { driving: false, speed: 0, throttle: false, mass: 1200, motorcycle: false,
  rain: 0, shelter: 0, cockpit: false, signal: false, wiper: 0, walkingSpeed: 0,
  rpm: 850, shifts: 0, exposure: 0, wet: 0, nature: true, night: 0, horn: false, fan: 0, washer: 0, motor: false,
  supercar: false, braking: false, operations: 0, service: 0 };
const param = () => ({ value: 0, setTargetAtTime(value: number) { this.value = value; },
  setValueAtTime(value: number) { this.value = value; }, cancelScheduledValues: vi.fn() });
const gain = () => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() });
class AudioContextStub {
  state = 'suspended'; currentTime = 0; sampleRate = 100;
  destination = {}; gains: ReturnType<typeof gain>[] = [];
  resumed: number[][] = [];
  createGain() { const node = gain(); this.gains.push(node); return node; }
  oscillators: { frequency: ReturnType<typeof param>; stop: ReturnType<typeof vi.fn> }[] = [];
  createOscillator() { const node = { frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() }; this.oscillators.push(node); return node; }
  createBiquadFilter() { return { frequency: param(), Q: param(), connect: vi.fn() }; }
  compressors = 0;
  createDynamicsCompressor() { this.compressors++; return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: vi.fn() }; }
  createBuffer(_channels: number, size: number) { return { getChannelData: () => new Float32Array(size) }; }
  createBufferSource() { return { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() }; }
  async resume() { this.resumed.push(this.gains.map(node => node.gain.value)); this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}
afterEach(() => vi.unstubAllGlobals());

it('voices the supercar separately and keeps music and operational effects on a bounded audio graph', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  audio.update(0.1, { ...idle, driving: true, rpm: 5000 });
  const touring = context.oscillators[0].frequency.value;
  audio.update(0.1, { ...idle, driving: true, rpm: 5000, supercar: true });
  expect(context.oscillators[0].frequency.value).toBeGreaterThan(touring);
  const nodes = context.oscillators.length;
  for (let i = 0; i < 500; i++) {
    if (i % 25 === 0) audio.tune(i % 10 + 1);
    audio.update(0.1, { ...idle, driving: true, mass: 18000, speed: -2, braking: i % 2 === 0, operations: i });
  }
  expect(context.oscillators).toHaveLength(nodes);
  expect(context.gains.every(g => Number.isFinite(g.gain.value) && g.gain.value >= 0)).toBe(true);
  audio.dispose(); expect(context.oscillators.every(o => o.stop.mock.calls.length === 1)).toBe(true);
});

it('selects ten radio presets without allocating an audio context and rejects invalid stations', () => {
  const audio = new AudioSystem();
  for (let i = 1; i <= 10; i++) { audio.tune(i); expect(audio.station).toBe(i); expect(audio.musicPace).toBeGreaterThanOrEqual(0.6); }
  audio.tune(11); audio.tune(NaN); expect(audio.station).toBe(10); expect(audio.state).toBe('locked');
});

it('fades service ambience with distance and honors the nature volume and pause', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  audio.update(0, idle);
  const before = context.gains.map(node => node.gain.value);
  audio.update(0, { ...idle, service: 1 });
  const changed = context.gains.filter((node, i) => node.gain.value !== before[i]);
  expect(changed).toHaveLength(1);
  const level = changed[0].gain, near = level.value;
  expect(near).toBeGreaterThan(0);
  audio.update(0, { ...idle, service: 0.5 }); expect(level.value).toBeCloseTo(near / 2);
  audio.natureVolume = 0; audio.update(0, { ...idle, service: 1 }); expect(level.value).toBe(0);
  audio.natureVolume = 1; audio.update(0, { ...idle, service: 1 }); expect(level.value).toBeGreaterThan(0);
  audio.setActive(false); await Promise.resolve(); expect(level.value).toBe(0);
  audio.dispose();
});

it('uses one output limiter and refuses preview while muted or inactive', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem();
  expect(audio.preview('shift')).toBe(false);
  audio.toggle(); await Promise.resolve();
  expect(context.compressors).toBe(1);
  expect(audio.preview('shift')).toBe(true);
  audio.setActive(false); await Promise.resolve(); expect(audio.preview('horn')).toBe(false);
  audio.setActive(true); await Promise.resolve(); audio.sfxVolume = 0;
  expect(audio.preview('shift')).toBe(false);
  audio.dispose();
});

it('applies SFX and music volume changes before resuming suspended audio', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  audio.update(0.1, idle); audio.setActive(false); await Promise.resolve();
  audio.sfxVolume = 0; audio.musicVolume = 0.8;
  audio.setActive(true); await Promise.resolve();
  expect(context.resumed.at(-1)![1]).toBe(0);
  expect(context.resumed.at(-1)![2]).toBe(0.8);
  audio.setActive(false); await Promise.resolve();
  audio.sfxVolume = 0.6; audio.musicVolume = 0;
  audio.setActive(true); await Promise.resolve();
  expect(context.resumed.at(-1)![2]).toBe(0);
  audio.dispose();
});

it('silences transient driving sounds on pause and does not resume a stale wiper stroke', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  audio.update(0.1, { ...idle, driving: true, signal: true, wiper: 0.5 });
  const active = context.gains.filter(node => node.gain.value > 0);
  expect(active.length).toBeGreaterThan(3);
  audio.setActive(false); await Promise.resolve();
  expect(context.state).toBe('suspended');
  audio.update(0.1, idle); audio.setActive(true); await Promise.resolve();
  expect(context.resumed.at(-1)![3]).toBe(0);
  expect(context.resumed.at(-1)![6]).toBe(0);
  audio.dispose(); expect(context.state).toBe('closed');
});
