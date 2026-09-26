import { afterEach, expect, it, vi } from 'vitest';
import { AudioSystem, type SoundState } from '../src/audio/AudioSystem';

const idle: SoundState = { driving: false, speed: 0, throttle: false, mass: 1200, motorcycle: false,
  rain: 0, shelter: 0, cockpit: false, signal: false, wiper: 0, walkingSpeed: 0 };
const param = () => ({ value: 0, setTargetAtTime(value: number) { this.value = value; },
  setValueAtTime(value: number) { this.value = value; }, cancelScheduledValues: vi.fn() });
const gain = () => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() });
class AudioContextStub {
  state = 'suspended'; currentTime = 0; sampleRate = 100;
  destination = {}; gains: ReturnType<typeof gain>[] = [];
  resumed: number[][] = [];
  createGain() { const node = gain(); this.gains.push(node); return node; }
  createOscillator() { return { frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() }; }
  createBiquadFilter() { return { frequency: param(), Q: param(), connect: vi.fn() }; }
  createBuffer(_channels: number, size: number) { return { getChannelData: () => new Float32Array(size) }; }
  createBufferSource() { return { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() }; }
  async resume() { this.resumed.push(this.gains.map(node => node.gain.value)); this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}
afterEach(() => vi.unstubAllGlobals());

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
