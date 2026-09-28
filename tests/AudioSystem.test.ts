import { afterEach, expect, it, vi } from 'vitest';
import { AudioSystem, type SoundState } from '../src/audio/AudioSystem';

const idle: SoundState = { driving: false, speed: 0, throttle: false, mass: 1200, motorcycle: false,
  rain: 0, shelter: 0, cockpit: false, signal: false, wiper: 0, walkingSpeed: 0,
  rpm: 850, shifts: 0, exposure: 0, wet: 0, nature: true, night: 0, horn: false, fan: 0, washer: 0, motor: false,
  supercar: false, braking: false, operations: 0, service: 0, ignition: 'running', traffic: 0, tireSlip: 0 };
const param = () => ({ value: 0, setTargetAtTime(value: number) { this.value = value; },
  setValueAtTime(value: number) { this.value = value; }, linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
const gain = () => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() });
class AudioContextStub {
  state = 'suspended'; currentTime = 0; sampleRate = 100;
  destination = {}; gains: ReturnType<typeof gain>[] = [];
  resumed: number[][] = [];
  createGain() { const node = gain(); this.gains.push(node); return node; }
  oscillators: { type: string; frequency: ReturnType<typeof param>; stop: ReturnType<typeof vi.fn> }[] = [];
  createOscillator() { const node = { type: 'sine', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() }; this.oscillators.push(node); return node; }
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

it('follows tire slip, wetness and tire volume without stale squeal on pause or leaving the vehicle', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  const moving = { ...idle, driving: true, speed: 18 };
  audio.update(0, moving); const before = context.gains.map(g => g.gain.value);
  audio.update(0, { ...moving, tireSlip: 0.8 });
  const changed = context.gains.filter((g, i) => g.gain.value > before[i]);
  expect(changed).toHaveLength(1); const skid = changed[0], dry = skid.gain.value;
  audio.update(0.1, { ...moving, tireSlip: 0.8, wet: 1 }); expect(skid.gain.value).toBeLessThan(dry);
  audio.tireVolume = 0; audio.update(0.1, { ...moving, tireSlip: 1 }); expect(skid.gain.value).toBe(0);
  audio.tireVolume = 1; audio.update(0.1, { ...moving, tireSlip: 1 });
  audio.setActive(false); await Promise.resolve(); expect(skid.gain.value).toBe(0);
  audio.setActive(true); await Promise.resolve(); audio.update(0.1, { ...idle, tireSlip: 1 }); expect(skid.gain.value).toBe(0);
  audio.dispose();
});

it('mutes propulsion when off, keeps cabin equipment powered and fades bounded traffic audio', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  audio.update(0.1, { ...idle, driving: true, fan: 3 });
  expect(context.gains[3].gain.value).toBeGreaterThan(0);
  const running = context.gains.map(g => g.gain.value);
  audio.update(0.1, { ...idle, driving: true, ignition: 'off', rpm: 0, fan: 3 });
  expect(context.gains[3].gain.value).toBe(0);
  expect(context.gains.some((g, i) => i > 3 && g.gain.value > 0 && g.gain.value === running[i])).toBe(true);
  audio.update(0.1, { ...idle, driving: true, ignition: 'starting', rpm: 240 });
  expect(context.gains[3].gain.value).toBeGreaterThan(0);
  const count = context.gains.length;
  audio.update(0.1, { ...idle, traffic: 1 }); const near = context.gains.at(-1)!.gain.value;
  expect(near).toBeGreaterThan(0);
  audio.update(0.1, { ...idle, traffic: 0.5 }); expect(context.gains.at(-1)!.gain.value).toBeCloseTo(near / 2);
  audio.setActive(false); await Promise.resolve(); expect(context.gains.at(-1)!.gain.value).toBe(0);
  expect(context.gains).toHaveLength(count); audio.dispose();
});

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

it('rejects previews of muted sound groups and reports completion and interruption', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  audio.engineVolume = 0;
  expect(audio.preview('engine')).toBe(false); expect(audio.preview('shift')).toBe(false);
  audio.effectsVolume = 0; expect(audio.preview('horn')).toBe(false);
  audio.engineVolume = 1;
  expect(audio.preview('engine')).toBe(true); expect(audio.previewing).toBe(true);
  expect(audio.preview('horn')).toBe(false); expect(audio.previewing).toBe(false);
  audio.preview('engine');
  audio.update(1.3, idle); expect(audio.previewing).toBe(false);
  audio.preview('engine'); audio.engineVolume = 0; audio.update(0.1, idle);
  expect(audio.previewing).toBe(false);
  audio.effectsVolume = 1; audio.preview('horn'); audio.setActive(false);
  expect(audio.previewing).toBe(false); audio.dispose();
});

it('fades out before changing radio voices and coalesces rapid station changes', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve(); audio.update(0.1, idle);
  const count = context.oscillators.length, waves = context.oscillators.map(o => o.type);
  audio.tune(7); audio.update(0.02, idle);
  expect(context.oscillators.map(o => o.type)).toEqual(waves);
  context.currentTime = 0.05; audio.tune(8); audio.tune(10); audio.update(0.02, idle);
  expect(context.oscillators.map(o => o.type)).toEqual(waves);
  context.currentTime = 0.3; audio.update(0.02, idle);
  expect(context.oscillators.map(o => o.type)).not.toEqual(waves);
  expect(audio.station).toBe(10); expect(context.oscillators).toHaveLength(count);
  audio.setActive(false); await Promise.resolve(); audio.tune(1);
  audio.setActive(true); await Promise.resolve(); audio.update(0.02, idle);
  expect(context.oscillators.map(o => o.type)).toEqual(waves); audio.dispose();
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

it.each(['engineVolume', 'cabinVolume', 'effectsVolume'] as const)('cancels active transient envelopes when %s is muted', async field => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve(); audio[field] = 1;
  const before = context.gains.map(node => node.gain.cancelScheduledValues.mock.calls.length);
  if (field === 'engineVolume') audio.preview('shift');
  else audio.update(0.1, { ...idle, driving: true, operations: field === 'cabinVolume' ? 1 : 0, signal: field === 'effectsVolume' });
  const channels = context.gains.filter((node, i) => node.gain.cancelScheduledValues.mock.calls.length > before[i]);
  expect(channels).toHaveLength(1);
  const parameter = channels[0].gain, calls = parameter.cancelScheduledValues.mock.calls.length;
  audio[field] = 0; audio.update(0.1, idle);
  expect(parameter.cancelScheduledValues.mock.calls.length).toBeGreaterThan(calls);
  expect(parameter.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, context.currentTime + 0.008);
  expect(parameter.value).toBe(0);
  const mutedCalls = parameter.cancelScheduledValues.mock.calls.length;
  audio.update(0.1, idle); expect(parameter.cancelScheduledValues).toHaveBeenCalledTimes(mutedCalls);
  audio.dispose();
});

it('closes a graph whose resume fails after the native context starts', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  context.resume = async () => { context.state = 'running'; throw new Error('Injected resume failure'); };
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve(); await Promise.resolve();
  expect(audio.state).toBe('unavailable'); expect(audio.enabled).toBe(false);
  expect(context.state).toBe('closed'); expect(context.gains[0].disconnect).toHaveBeenCalledOnce();
  expect(context.oscillators.every(node => node.stop.mock.calls.length === 1)).toBe(true);
  audio.update(0.1, { ...idle, driving: true }); expect(audio.preview('engine')).toBe(false);
  audio.dispose(); expect(context.oscillators.every(node => node.stop.mock.calls.length === 1)).toBe(true);
});

it('reports actual music playback across pause, muted channels and resume', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); expect(audio.musicPlaying).toBe(false);
  audio.toggle(); await Promise.resolve(); expect(audio.musicPlaying).toBe(true);
  audio.setActive(false); expect(audio.musicPlaying).toBe(false); await Promise.resolve();
  audio.setActive(true); await Promise.resolve(); expect(audio.musicPlaying).toBe(true);
  audio.musicVolume = 0; expect(audio.musicPlaying).toBe(false);
  audio.musicVolume = 1; audio.masterVolume = 0; expect(audio.musicPlaying).toBe(false);
  audio.dispose(); expect(audio.musicPlaying).toBe(false);
});
