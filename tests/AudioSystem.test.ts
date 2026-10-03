import { afterEach, expect, it, vi } from 'vitest';
import { AudioSystem, type SoundState } from '../src/audio/AudioSystem';
import { hornProfile, type HornVoice } from '../src/audio/VehicleHorn';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';
import { engineSound, type EngineVoice } from '../src/audio/VehicleEngine';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';

const idle: SoundState = { powertrain: 'combustion', regeneration: false, fuelCut: false, atmosphere: 1, driving: false, speed: 0, throttle: 0, shifting: false, impact: 0, scrape: 0, mass: 1200, motorcycle: false,
  rain: 0, shelter: 0, cockpit: false, signal: false, wiper: 0, walkingSpeed: 0,
  rpm: 850, shifts: 0, exposure: 0, wet: 0, nature: true, night: 0, horn: false, fan: 0, washer: 0, motor: false,
  supercar: false, braking: false, operations: 0, service: 0, ignition: 'running', nearbyEngines: [], tireSlip: 0, vehicle: 'roadster', trafficHorns: [] };
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
  createBiquadFilter() { return { frequency: param(), Q: param(), connect: vi.fn(), disconnect: vi.fn() }; }
  createStereoPanner() { return { pan: param(), connect: vi.fn(), disconnect: vi.fn() }; }
  compressors = 0;
  createDynamicsCompressor() { this.compressors++; return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: vi.fn() }; }
  createBuffer(_channels: number, size: number) { return { getChannelData: () => new Float32Array(size) }; }
  createBufferSource() { return { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() }; }
  async resume() { this.resumed.push(this.gains.map(node => node.gain.value)); this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}
afterEach(() => vi.unstubAllGlobals());

it.each(['engine', 'shift', 'horn'] as const)('enables audio from a %s preview and waits for resume before playing', async kind => {
  const context = new AudioContextStub();
  let resume!: () => void;
  context.resume = () => new Promise<void>(resolve => { resume = () => { context.state = 'running'; resolve(); }; });
  vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem();
  try {
    expect(audio.preview(kind)).toBe(true); expect(audio.enabled).toBe(true); expect(audio.previewing).toBe(true);
    const shift = (audio as unknown as { shiftGain: ReturnType<typeof gain> }).shiftGain;
    expect(shift.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    audio.update(2, idle); expect(audio.previewing).toBe(true);
    resume(); await Promise.resolve(); audio.update(0.1, { ...idle, ignition: 'off' });
    expect(audio.previewing).toBe(true);
    if (kind === 'shift') expect(shift.gain.linearRampToValueAtTime).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
    audio.update(1.3, idle); expect(audio.previewing).toBe(false);
  } finally { audio.dispose(); }
});

it.each(['pause', 'mute', 'volume', 'dispose'] as const)('cancels a queued preview on %s instead of playing it after resume', async action => {
  const context = new AudioContextStub();
  let resume!: () => void;
  context.resume = () => new Promise<void>(resolve => { resume = () => { context.state = 'running'; resolve(); }; });
  vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem();
  try {
    expect(audio.preview('shift')).toBe(true);
    const shift = (audio as unknown as { shiftGain: ReturnType<typeof gain> }).shiftGain;
    if (action === 'pause') audio.setActive(false);
    else if (action === 'mute') audio.toggle();
    else if (action === 'volume') { audio.sfxVolume = 0; audio.update(0, idle); }
    else audio.dispose();
    resume(); await Promise.resolve();
    expect(audio.previewing).toBe(false); expect(shift.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  } finally { audio.dispose(); }
});

it('defers saved audio until activation without timing out or discarding the mix', async () => {
  vi.useFakeTimers();
  const activation = { isActive: false, hasBeenActive: false };
  vi.stubGlobal('navigator', { userActivation: activation });
  const context = new AudioContextStub(), create = vi.fn(function () { return context; });
  vi.stubGlobal('AudioContext', create);
  const audio = new AudioSystem(); audio.engineVolume = 0.4; audio.musicVolume = 0;
  try {
    audio.toggle();
    for (let i = 0; i < 30; i++) audio.update(0.1, idle);
    await vi.advanceTimersByTimeAsync(5000);
    expect(create).not.toHaveBeenCalled(); expect(audio.enabled).toBe(true); expect(audio.error).toBe('');
    activation.isActive = activation.hasBeenActive = true;
    audio.unlock(); await Promise.resolve();
    expect(create).toHaveBeenCalledOnce(); expect(audio.state).toBe('running');
    expect(audio.engineVolume).toBe(0.4); expect(audio.musicVolume).toBe(0);
    audio.unlock(); expect(create).toHaveBeenCalledOnce();
  } finally { audio.dispose(); vi.useRealTimers(); }
});

it('does not unlock audio after the user cancels a pending enable', () => {
  const activation = { isActive: false };
  vi.stubGlobal('navigator', { userActivation: activation });
  const create = vi.fn(function () { return new AudioContextStub(); }); vi.stubGlobal('AudioContext', create);
  const audio = new AudioSystem();
  try {
    audio.toggle(); audio.toggle(); activation.isActive = true; audio.unlock();
    expect(audio.enabled).toBe(false); expect(create).not.toHaveBeenCalled();
  } finally { audio.dispose(); }
});

it.each(['recover', 'testSound'] as const)('defers %s without activation and ignores gestures after disposal', async action => {
  const activation = { isActive: false };
  vi.stubGlobal('navigator', { userActivation: activation });
  const create = vi.fn(function () { return new AudioContextStub(); }); vi.stubGlobal('AudioContext', create);
  const audio = new AudioSystem();
  audio[action](); await Promise.resolve();
  expect(create).not.toHaveBeenCalled(); expect(audio.awaitingActivation).toBe(true);
  audio.dispose(); activation.isActive = true; audio.unlock();
  expect(create).not.toHaveBeenCalled();
});

it('waits for another gesture after an autoplay rejection without retrying every frame', async () => {
  vi.useFakeTimers();
  const context = new AudioContextStub();
  const resume = vi.spyOn(context, 'resume').mockRejectedValueOnce(new DOMException('Activation required', 'NotAllowedError'));
  vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem();
  try {
    audio.toggle(); await Promise.resolve(); await Promise.resolve();
    expect(audio.enabled).toBe(true); expect(audio.error).toBe('');
    for (let i = 0; i < 30; i++) audio.update(0.1, idle);
    await vi.advanceTimersByTimeAsync(5000);
    expect(audio.enabled).toBe(true); expect(audio.awaitingActivation).toBe(true);
    expect(resume).toHaveBeenCalledOnce(); expect(context.state).toBe('suspended');
    audio.unlock(); await Promise.resolve(); expect(audio.state).toBe('running');
  } finally { audio.dispose(); vi.useRealTimers(); }
});

it('recovers from a failed resume without losing a nonzero mix', async () => {
  const failed = new AudioContextStub(), recovered = new AudioContextStub();
  failed.resume = async () => { throw new Error('device lost'); };
  const create = vi.fn().mockImplementationOnce(function () { return failed; }).mockImplementation(function () { return recovered; });
  vi.stubGlobal('AudioContext', create);
  const audio = new AudioSystem(); audio.engineVolume = 0.4; audio.musicVolume = 0;
  audio.toggle(); await Promise.resolve(); await Promise.resolve();
  expect(audio.state).toBe('unavailable');
  audio.recover(); await Promise.resolve();
  expect(audio.state).toBe('running'); expect(audio.enabled).toBe(true);
  expect(audio.engineVolume).toBe(0.4); expect(audio.musicVolume).toBe(0.3);
  expect(failed.state).toBe('closed'); audio.dispose();
});

it('ignores a stale resume rejection after explicit recovery', async () => {
  const stale = new AudioContextStub(), current = new AudioContextStub();
  let reject!: (error: Error) => void;
  stale.resume = () => new Promise<void>((_, failure) => { reject = failure; });
  vi.stubGlobal('AudioContext', vi.fn().mockImplementationOnce(function () { return stale; }).mockImplementation(function () { return current; }));
  const audio = new AudioSystem(); audio.toggle(); audio.recover(); await Promise.resolve();
  reject(new Error('old device')); await Promise.resolve();
  expect(audio.state).toBe('running'); expect(audio.error).toBe('');
  expect(stale.state).toBe('closed'); expect(current.state).toBe('running'); audio.dispose();
});

it('plays an independent channel test with muted music and effects, and cancels on pause', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.sfxVolume = audio.musicVolume = 0;
  expect(audio.testSound()).toBe(true); await Promise.resolve();
  expect(audio.testing).toBe(true); expect(context.state).toBe('running');
  expect(audio.sfxVolume).toBe(0); expect(audio.musicVolume).toBe(0);
  audio.setActive(false); await Promise.resolve();
  expect(audio.testing).toBe(false); expect(context.state).toBe('suspended');
  audio.setActive(true); await Promise.resolve(); expect(audio.testing).toBe(false);
  audio.masterVolume = 0; expect(audio.testSound()).toBe(false); audio.dispose();
});

it('fails a resolved but still suspended resume instead of recursively retrying', async () => {
  const context = new AudioContextStub(); context.resume = vi.fn(async () => {});
  vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  expect(context.resume).toHaveBeenCalledOnce(); expect(audio.state).toBe('unavailable'); audio.dispose();
});

it('times out a blocked browser resume and allows a later user gesture to rebuild', async () => {
  vi.useFakeTimers();
  const blocked = new AudioContextStub(), recovered = new AudioContextStub();
  blocked.resume = () => new Promise<void>(() => {});
  vi.stubGlobal('AudioContext', vi.fn().mockImplementationOnce(function () { return blocked; }).mockImplementation(function () { return recovered; }));
  const audio = new AudioSystem();
  try {
    audio.toggle(); await vi.advanceTimersByTimeAsync(4001);
    expect(audio.state).toBe('unavailable'); expect(blocked.state).toBe('closed');
    audio.recover(); await Promise.resolve(); expect(audio.state).toBe('running');
  } finally { audio.dispose(); vi.useRealTimers(); }
});

it.each(['player', 'traffic'])('keeps music at full level when muted %s horns are triggered', async source => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.sfxVolume = 0; audio.musicDucking = 0; audio.hornFocus = 1;
  audio.toggle(); await Promise.resolve();
  const state = { ...idle, horn: source === 'player', trafficHorns: source === 'traffic'
    ? [{ id: 'nearby', kind: 'truck8' as const, volume: 1, pan: 0 }] : [] };
  const mix = audio as unknown as { musicDuck: number; ambienceDuck: number };
  for (let i = 0; i < 30; i++) audio.update(0.1, state);
  expect(audio.musicPlaying).toBe(true); expect(mix.musicDuck).toBe(1); expect(mix.ambienceDuck).toBe(1);
  audio.sfxVolume = 1;
  for (let i = 0; i < 30; i++) audio.update(0.1, state);
  expect(mix.musicDuck).toBeLessThan(0.5);
  audio.sfxVolume = 0;
  for (let i = 0; i < 40; i++) audio.update(0.1, state);
  expect(mix.musicDuck).toBeGreaterThan(0.99); audio.dispose();
});

it.each(['sfx', 'engine', 'collision'] as const)('does not duck music for muted %s driving sounds', async muted => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.musicDucking = 0.8;
  if (muted === 'sfx') audio.sfxVolume = 0;
  else if (muted === 'engine') audio.engineVolume = 0;
  else audio.collisionVolume = 0;
  audio.toggle(); await Promise.resolve();
  const state = { ...idle, driving: true, throttle: muted === 'collision' ? 0 : 1, impact: muted === 'engine' ? 0 : 12 };
  const mix = audio as unknown as { musicDuck: number };
  for (let i = 0; i < 40; i++) audio.update(0.1, state);
  expect(mix.musicDuck).toBe(1);
  audio.sfxVolume = audio.engineVolume = audio.collisionVolume = 1;
  for (let i = 0; i < 40; i++) audio.update(0.1, state);
  expect(mix.musicDuck).toBeLessThan(0.3);
  audio.sfxVolume = 0;
  for (let i = 0; i < 40; i++) audio.update(0.1, state);
  expect(mix.musicDuck).toBeGreaterThan(0.99); audio.dispose();
});

it('provides stronger horns with adjustable priority, exhaust voicing and independent shift volume', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  const nodes = audio as unknown as { playerHorn: HornVoice; windGain: ReturnType<typeof gain>; harmonicGain: ReturnType<typeof gain>; shiftGain: ReturnType<typeof gain> };
  audio.hornVolume = 1; audio.update(0.1, { ...idle, horn: true }); const normal = nodes.playerHorn.level.gain.value;
  audio.hornVolume = 3; audio.hornFocus = 1;
  for (let i = 0; i < 20; i++) audio.update(0.1, { ...idle, horn: true });
  expect(nodes.playerHorn.level.gain.value).toBeGreaterThan(normal * 2);
  const focused = nodes.windGain.gain.value;
  audio.hornFocus = 0;
  for (let i = 0; i < 20; i++) audio.update(0.1, { ...idle, horn: true });
  expect(nodes.windGain.gain.value).toBeGreaterThan(focused * 1.8);
  audio.exhaustVolume = 0; audio.update(0.1, { ...idle, driving: true }); expect(nodes.harmonicGain.gain.value).toBe(0);
  audio.shiftVolume = 1; expect(audio.preview('shift')).toBe(true); expect(audio.previewing).toBe(true);
  audio.shiftVolume = 0; expect(audio.previewing).toBe(false); expect(audio.preview('shift')).toBe(false);
  const pulses = nodes.shiftGain.gain.linearRampToValueAtTime.mock.calls.length;
  audio.update(0.1, { ...idle, driving: true, shifts: 1 });
  expect(nodes.shiftGain.gain.linearRampToValueAtTime.mock.calls.slice(pulses).every(([value]) => value === 0)).toBe(true);
  audio.dispose();
});

it('reduces combustion exhaust on overrun and makes cabin isolation and music layers adjustable', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  const nodes = audio as unknown as { windGain: ReturnType<typeof gain>; harmonicGain: ReturnType<typeof gain>; bassGain: ReturnType<typeof gain>; melodyGain: ReturnType<typeof gain> };
  audio.update(0.1, { ...idle, driving: true, rpm: 3500 }); const combustion = nodes.harmonicGain.gain.value;
  audio.update(0.1, { ...idle, driving: true, rpm: 3500, fuelCut: true }); expect(nodes.harmonicGain.gain.value).toBeLessThan(combustion * 0.5);
  audio.cabinIsolation = 1; audio.update(0.1, { ...idle, cockpit: true }); expect(nodes.windGain.gain.value).toBe(0);
  audio.update(0.1, { ...idle, cockpit: true, exposure: 1 }); expect(nodes.windGain.gain.value).toBeGreaterThan(0);
  audio.bassVolume = audio.melodyVolume = 0; audio.update(0.1, idle);
  expect(nodes.bassGain.gain.value).toBe(0); expect(nodes.melodyGain.gain.value).toBe(0);
  audio.dispose();
});

it('gives the entire fleet distinct horn voicings with deeper heavy-vehicle tones', () => {
  const profiles = Object.keys(vehicleProfiles).map(kind => hornProfile(kind as VehicleKind));
  expect(new Set(profiles.map(p => p.frequencies.join(':'))).size).toBe(profiles.length);
  expect(hornProfile('semi20').frequencies[0]).toBeLessThan(hornProfile('sedan').frequencies[0]);
  expect(hornProfile('motorcycle').frequencies[0]).toBeGreaterThan(hornProfile('sedan').frequencies[0]);
  for (const p of profiles) for (const frequency of p.frequencies) expect(frequency).toBeGreaterThan(90);
});

it('makes horns prominent with independent controls, bounded spatial voices and immediate pause cleanup', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  const voices = audio as unknown as { playerHorn: HornVoice; npcHorns: { id?: string; voice: HornVoice }[] };
  const sound = { ...idle, driving: true, horn: true, trafficHorns: Array.from({ length: 10 }, (_, i) => ({
    id: `npc:${i}`, kind: 'truck8' as const, volume: 1 - i * 0.05, pan: i % 2 ? -0.8 : 0.8 })) };
  audio.update(0.1, sound);
  expect(voices.playerHorn.level.gain.value).toBeGreaterThan(0.35);
  expect(voices.npcHorns).toHaveLength(4);
  expect(voices.npcHorns.every(v => v.voice.level.gain.value > 0)).toBe(true);
  expect(voices.npcHorns[0].voice.pan.pan.value).toBe(0.8);
  const nodes = context.oscillators.length;
  audio.hornVolume = 0; audio.update(0.1, sound);
  expect(voices.playerHorn.level.gain.value).toBe(0); expect(audio.preview('horn')).toBe(false);
  expect(voices.npcHorns[0].voice.level.gain.value).toBeGreaterThan(0);
  audio.npcHornVolume = 0; audio.update(0.1, sound);
  expect(voices.npcHorns.every(v => v.voice.level.gain.value === 0)).toBe(true);
  audio.hornVolume = audio.npcHornVolume = 1;
  for (let i = 0; i < 20; i++) audio.update(0.1, { ...sound, trafficHorns: sound.trafficHorns.slice(i % 5) });
  expect(context.oscillators).toHaveLength(nodes);
  audio.setActive(false); await Promise.resolve();
  expect(voices.playerHorn.level.gain.value).toBe(0);
  expect(voices.npcHorns.every(v => v.voice.level.gain.value === 0)).toBe(true);
  audio.dispose(); expect(context.oscillators.every(v => v.stop.mock.calls.length === 1)).toBe(true);
});

it('does not play a gear change when switching to a vehicle with a reset shift counter', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  audio.update(0.1, { ...idle, driving: true, shifts: 12 });
  const shift = (audio as unknown as { shiftGain: ReturnType<typeof gain> }).shiftGain.gain;
  const scheduled = shift.cancelScheduledValues.mock.calls.length;
  audio.update(0.1, { ...idle, driving: true, shifts: 0 });
  expect(shift.cancelScheduledValues).toHaveBeenCalledTimes(scheduled);
  audio.update(0.1, { ...idle, driving: true, shifts: 1 });
  expect(shift.cancelScheduledValues).toHaveBeenCalledTimes(scheduled + 1);
  audio.dispose();
});

it('gives short effects a brief attack instead of stepping instantly to peak amplitude', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  audio.preview('shift');
  const shift = (audio as unknown as { shiftGain: ReturnType<typeof gain> }).shiftGain.gain;
  expect(shift.linearRampToValueAtTime).toHaveBeenCalledWith(expect.any(Number), 0.004);
  audio.dispose();
});

it('unloads engine sound smoothly on lift-off and cuts it during a shift', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  const driving = { ...idle, driving: true, rpm: 3500, speed: 15, throttle: 1 };
  for (let i = 0; i < 60; i++) audio.update(1 / 60, driving);
  const engine = context.gains[3].gain, loaded = engine.value;
  audio.update(1 / 60, { ...driving, throttle: 0 });
  expect(engine.value).toBeGreaterThan(loaded * 0.8);
  for (let i = 0; i < 60; i++) audio.update(1 / 60, { ...driving, throttle: 0 });
  expect(engine.value).toBeLessThan(loaded * 0.75);
  const coast = engine.value; audio.update(1 / 60, { ...driving, shifting: true });
  expect(engine.value).toBeLessThan(coast);
  audio.dispose();
});

it('mixes contact sounds only while driving and respects their independent volume', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  audio.update(0.1, { ...idle, driving: true, impact: 12, scrape: 15 });
  const nodes = audio as unknown as { impactGain: ReturnType<typeof gain>; scrapeGain: ReturnType<typeof gain> };
  const contacts = [nodes.impactGain, nodes.scrapeGain];
  expect(contacts.every(g => g.gain.value > 0)).toBe(true);
  audio.collisionVolume = 0; audio.update(0.1, { ...idle, driving: true, impact: 12, scrape: 15 });
  expect(contacts.every(g => g.gain.value === 0)).toBe(true);
  audio.collisionVolume = 1; audio.update(0.1, { ...idle, impact: 12, scrape: 15 });
  expect(contacts.every(g => g.gain.value === 0)).toBe(true);
  audio.dispose();
});

it('voices EV drive and regeneration without combustion idle or automatic shift effects', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  const ev = { ...idle, driving: true, powertrain: 'ev' as const, rpm: 0, nature: false };
  audio.update(0.1, ev); expect(context.gains[3].gain.value).toBe(0);
  audio.update(0.1, { ...ev, speed: 10 });
  expect(context.oscillators[0].type).toBe('sine'); expect(context.gains[3].gain.value).toBeGreaterThan(0);
  const pitch = context.oscillators[0].frequency.value;
  audio.update(0.1, { ...ev, speed: 10, regeneration: true, shifts: 9 });
  expect(context.oscillators[0].frequency.value).toBeGreaterThan(pitch);
  expect(context.gains.every(g => Number.isFinite(g.gain.value))).toBe(true);
  audio.update(0.1, { ...ev, powertrain: 'combustion', rpm: 850 });
  expect(context.oscillators[0].type).toBe('triangle'); expect(context.gains[3].gain.value).toBeGreaterThan(0);
  audio.setActive(false); await Promise.resolve(); expect(context.gains[3].gain.value).toBe(0);
  audio.dispose();
});

it('previews an EV motor while the parked vehicle is powered off', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  audio.update(0.1, idle);
  const ambience = audio as unknown as { tireGain: { gain: { value: number } }; windGain: { gain: { value: number } } };
  const before = [ambience.tireGain.gain.value, ambience.windGain.gain.value];
  expect(audio.preview('engine')).toBe(true);
  audio.update(0.1, { ...idle, powertrain: 'ev', ignition: 'off', rpm: 0 });
  expect(context.gains[3].gain.value).toBeGreaterThan(0);
  expect(context.oscillators[0].frequency.value).toBeGreaterThan(140);
  expect([ambience.tireGain.gain.value, ambience.windGain.gain.value]).toEqual(before);
  audio.dispose();
});

it('ducks music under load and restores it smoothly after lifting off', async () => {
  const contexts = [new AudioContextStub(), new AudioContextStub()], levels: number[] = [], restored: number[] = [];
  for (const [index, context] of contexts.entries()) {
    vi.stubGlobal('AudioContext', function () { return context; });
    const audio = new AudioSystem(); audio.musicDucking = index ? 0.8 : 0; audio.toggle(); await Promise.resolve();
    for (let i = 0; i < 120; i++) audio.update(1 / 60, { ...idle, driving: true, throttle: 1 });
    const level = (audio as unknown as { melodyGain: { gain: { value: number } } }).melodyGain.gain;
    levels.push(level.value);
    const ducked = level.value;
    audio.update(0, { ...idle, driving: true, throttle: 0 }); expect(level.value).toBe(ducked);
    for (let i = 0; i < 120; i++) audio.update(1 / 60, { ...idle, driving: true, throttle: 0 });
    restored.push(level.value);
    audio.dispose();
  }
  expect(levels[1]).toBeLessThan(levels[0] * 0.3);
  expect(restored[1]).toBeGreaterThan(restored[0] * 0.9);
});

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

it('mutes propulsion when off and keeps cabin equipment powered', async () => {
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
  audio.dispose();
});

it('voices nearby engines outside a vehicle with stable bounded spatial slots and independent volume', async () => {
  const context = new AudioContextStub(); vi.stubGlobal('AudioContext', function () { return context; });
  const audio = new AudioSystem(); audio.toggle(); await Promise.resolve();
  const car = new VehiclePhysics('truck8'); car.ignition = 'running'; car.x = 5;
  const sound = engineSound('parked', car, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })!;
  const slots = (audio as unknown as { nearbyEngines: { id?: string; voice: EngineVoice }[] }).nearbyEngines;
  audio.update(0.1, { ...idle, nearbyEngines: [sound] });
  const slot = slots.find(s => s.id === 'parked')!;
  expect(slot.voice.level.gain.value).toBeGreaterThan(0); expect(slot.voice.pan.pan.value).toBe(1);
  audio.nearbyEngineVolume = 0; audio.update(0.1, { ...idle, nearbyEngines: [sound] });
  expect(slot.voice.level.gain.value).toBe(0);
  audio.nearbyEngineVolume = 1;
  const nodes = context.oscillators.length;
  for (let i = 0; i < 12; i++) audio.update(0.1, { ...idle, nearbyEngines: Array.from({ length: 20 }, (_, j) => ({ ...sound, id: `${i}:${j}` })) });
  expect(slots).toHaveLength(6); expect(slots.every(s => s.voice.level.gain.value > 0)).toBe(true);
  expect(context.oscillators).toHaveLength(nodes);
  audio.update(0.1, { ...idle, nearbyEngines: [sound], atmosphere: 0 });
  expect(slots.every(s => s.voice.level.gain.value === 0)).toBe(true);
  audio.update(0.1, { ...idle, nearbyEngines: [sound] });
  audio.setActive(false); await Promise.resolve();
  expect(slots.every(s => s.voice.level.gain.value === 0)).toBe(true);
  audio.dispose(); expect(context.oscillators.every(v => v.stop.mock.calls.length === 1)).toBe(true);
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
  expect(audio.preview('shift')).toBe(true); await Promise.resolve();
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
  audio.hornVolume = 0; expect(audio.preview('horn')).toBe(false);
  audio.engineVolume = 1;
  expect(audio.preview('engine')).toBe(true); expect(audio.previewing).toBe(true);
  expect(audio.preview('horn')).toBe(false); expect(audio.previewing).toBe(false);
  audio.preview('engine');
  audio.update(1.3, idle); expect(audio.previewing).toBe(false);
  audio.preview('engine'); audio.engineVolume = 0; audio.update(0.1, idle);
  expect(audio.previewing).toBe(false);
  audio.hornVolume = 1; audio.preview('horn'); audio.setActive(false);
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
