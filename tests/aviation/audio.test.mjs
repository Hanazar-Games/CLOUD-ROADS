import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../../src/aviation/audio.js';
import { AIRCRAFT, createAircraftFlight, updateAircraftFlight } from '../../src/aviation/aircraft-flight.js';

class Param {
  value = 0;
  cancellations = 0;
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() { this.cancellations++; }
}
class Node {
  gain = new Param(); frequency = new Param(); connections = [];
  Q = new Param(); threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; }
  start(time) { this.started = time; }
  stop(time = 0) { this.stopped = time; }
}
class Context {
  sampleRate = 44100;
  currentTime = 0; state = 'suspended'; destination = new Node(); oscillators = [];
  createGain() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { const node = new Node(); this.oscillators.push(node); return node; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}
async function setup() {
  const audio = new AudioEngine(() => new Context());
  assert.equal(await audio.unlock(), true);
  return audio;
}
const running = { status: 'running', speed: 36, boosting: false };

test('layer volume changes affect playing and scheduled effects without muting alerts', async () => {
  const audio = await setup();
  audio.setState('running');
  for (const [layer, event] of [['mechanical', 'flaps'], ['wind', 'takeoff'], ['runway', 'touchdown']]) {
    audio.event(event);
    const voices = [...audio.voices];
    const bus = voices.at(-1).gain.connections[0];
    assert.notEqual(bus, audio.sfx, 'layer effects need a live volume bus');
    audio.setLayerVolume(layer, 0); assert.equal(bus.gain.value, 0);
    audio.setLayerVolume(layer, .35); assert.equal(bus.gain.value, .35);
    audio.stopVoices();
  }
  audio.event('stall');
  assert.ok([...audio.voices].every(voice => voice.gain.connections[0] === audio.sfx));
  audio.dispose();
});

test('rapid theme changes keep fading sources bounded and dispose every connection', async () => {
  const audio = await setup();
  for (let i = 0; i < 100; i++) {
    audio.update({ ...running, mission: { music: { root: 40 + i, bpm: 120 } } });
    assert.ok(audio.context.oscillators.filter(source => source.connections.length).length <= 38);
  }
  audio.stopVoices();
  const sources = [...audio.context.oscillators];
  audio.dispose();
  assert.ok(sources.every(source => source.connections.length === 0));
});

test('flight ambience follows airspeed, engine spool, ground contact and reverse thrust', async () => {
  const audio = await setup(), frame = { ...flightFrame(createAircraftFlight('su30', true)), speed: 0, engineOutput: 0, onGround: true };
  audio.setVolume('music', 0); audio.update(frame);
  assert.equal(audio.engineNoise.gain.gain.value, 0);
  assert.equal(audio.wind.gain.gain.value, 0);
  assert.equal(audio.runway.gain.gain.value, 0);
  audio.update({ ...frame, engineOutput: 1 });
  const engine = audio.engineNoise.gain.gain.value;
  assert.ok(engine > 0);
  audio.update({ ...frame, engineOutput: 1, reverse: true });
  assert.ok(audio.engineNoise.gain.gain.value > engine);
  audio.update({ ...frame, speed: 80 });
  const wind = audio.wind.gain.gain.value;
  assert.ok(wind > 0); assert.ok(audio.runway.gain.gain.value > 0);
  assert.equal(audio.engineNoise.gain.gain.value, 0, 'gliding still has airflow without engine roar');
  audio.update({ ...frame, speed: 160, onGround: false });
  assert.ok(audio.wind.gain.gain.value > wind);
  assert.equal(audio.runway.gain.gain.value, 0);
  const clean = audio.wind.gain.gain.value;
  audio.update({ ...frame, speed: 160, onGround: false, gearPosition: 1, flaps: 2, speedBrake: true });
  assert.ok(audio.wind.gain.gain.value > clean);
  audio.dispose();
});

test('cockpit acoustics filter exterior sounds without filtering music or warnings', async () => {
  const audio = await setup(), frame = { ...flightFrame(createAircraftFlight('a380', true)), cockpit: false };
  audio.update(frame);
  const cutoff = audio.exteriorFilter.frequency.value, level = audio.exterior.gain.value;
  audio.update({ ...frame, cockpit: true });
  assert.ok(audio.exteriorFilter.frequency.value < cutoff);
  assert.ok(audio.exterior.gain.value < level);
  assert.deepEqual(audio.music.connections, [audio.master]);
  audio.event('stall');
  assert.ok([...audio.voices].filter(v => v.bus === 'sfx').every(v => v.gain.connections[0] === audio.sfx));
  assert.deepEqual(audio.master.connections, [audio.limiter]);
  assert.deepEqual(audio.limiter.connections, [audio.context.destination]);
  audio.dispose();
});

test('continuous aircraft sources are reused, quiet when paused or muted and stopped on disposal', async () => {
  const audio = await setup(), frame = { ...flightFrame(createAircraftFlight('a380', true)), onGround: true };
  audio.setVolume('music', 0); audio.update(frame);
  const sources = [...audio.context.oscillators];
  for (let i = 0; i < 300; i++) audio.update(frame);
  assert.equal(audio.context.oscillators.length, sources.length);
  const layers = [audio.engineGain, audio.engineNoise.gain, audio.wind.gain, audio.runway.gain, audio.gearMotor.gain];
  for (const silence of [() => audio.setState('paused'), () => audio.setBackground(true), () => audio.toggle(), () => audio.setVolume('sfx', 0)]) {
    silence(); assert.ok(layers.every(node => node.gain.value === 0));
    audio.update({ ...frame, status: audio.state });
    assert.ok(layers.every(node => node.gain.value === 0));
    audio.setState('running'); audio.setBackground(false); if (!audio.enabled) audio.toggle(); audio.setVolume('sfx', .8); audio.update(frame);
  }
  audio.dispose();
  assert.ok(sources.every(source => source.stopped !== undefined && source.connections.length === 0));
});

test('individual sound layers mute independently while alerts remain audible', async () => {
  const audio = await setup(), frame = { ...flightFrame(createAircraftFlight('a380', true)), onGround: true, gearPosition: .5, gearDown: true };
  audio.setVolume('music', 0); audio.update(frame);
  assert.ok(audio.gearMotor.gain.gain.value > 0);
  for (const key of ['engine', 'wind', 'runway', 'mechanical']) audio.setLayerVolume(key, 0);
  audio.update(frame);
  assert.ok([audio.engineGain, audio.engineNoise.gain, audio.wind.gain, audio.runway.gain, audio.gearMotor.gain].every(node => node.gain.value === 0));
  audio.event('cockpit-switch'); audio.event('flaps'); assert.equal(audio.voices.size, 0);
  audio.event('stall'); assert.equal(audio.voices.size, 2);
  audio.setLayerVolume('engine', NaN); assert.equal(audio.layers.engine, 0);
  audio.setLayerVolume('engine', 10); assert.equal(audio.layers.engine, 1);
  audio.setLayerVolume('mechanical', 1); audio.update({ ...frame, gearPosition: 1 });
  assert.equal(audio.gearMotor.gain.gain.value, 0);
  audio.dispose();
});

test('aircraft mechanical and takeoff cues use bounded noise envelopes and honor silence', async () => {
  const audio = await setup();
  for (const event of ['takeoff', 'touchdown', 'flaps', 'speed-brake']) {
    audio.event(event);
    assert.ok([...audio.voices].some(voice => voice.oscillator.buffer));
    audio.stopVoices();
    audio.setState('paused'); audio.event(event); assert.equal(audio.voices.size, 0);
    audio.setState('running');
  }
  audio.dispose();
});

test('disposal disconnects transient filters without waiting for closed-context ended callbacks', async () => {
  const audio = await setup();
  audio.update(running); audio.event('flaps');
  const voices = [...audio.voices];
  assert.ok(voices.some(voice => voice.filter));
  audio.dispose();
  assert.ok(voices.every(voice => !voice.oscillator.connections.length && !voice.gain.connections.length && !voice.filter?.connections.length));
  assert.equal(audio.voices.size, 0);
});

test('leaving flight cancels pending audio activation and disposal is idempotent', async () => {
  let contexts = 0;
  const audio = new AudioEngine(() => { contexts++; return new Context(); });
  const activation = audio.unlock(); audio.dispose();
  assert.equal(await activation, false); assert.equal(contexts, 0);
  assert.equal(await audio.unlock(), false); audio.dispose();
  const active = await setup(), context = active.context;
  active.dispose(); active.dispose();
  assert.equal(context.state, 'closed'); assert.equal(active.context, null);
});

const flightFrame = flight => ({ status: flight.status, speed: flight.speed, aircraft: flight.aircraft, maxSpeed: flight.performance.maxSpeed, engineOutput: flight.engineOutput * flight.physics.thrust, stalling: flight.stalling });

test('steady audio frames retain automation while changed power and warning ducking still respond', async () => {
  const audio = await setup(), frame = { ...flightFrame(createAircraftFlight('j90', true)), stalling: false };
  audio.update(frame);
  const params = [audio.engine.frequency, audio.filter.frequency, audio.engineGain.gain, audio.music.gain, audio.wind.gain.gain, audio.engineNoise.gain.gain, audio.runway.gain.gain, audio.gearMotor.gain.gain, audio.exteriorFilter.frequency, audio.exterior.gain];
  const counts = params.map(param => param.cancellations);
  for (let i = 0; i < 120; i++) { audio.context.currentTime += 1 / 120; audio.update(frame); }
  assert.deepEqual(params.map(param => param.cancellations), counts);
  audio.update({ ...frame, engineOutput: 1 });
  assert.ok(audio.engine.frequency.cancellations > counts[0]);
  assert.ok(audio.engineGain.gain.cancellations > counts[2]);
  audio.event('ap-disconnect');
  assert.equal(audio.music.gain.value, audio.volumes.music * .4);
  audio.context.currentTime += 1; audio.update(frame);
  assert.equal(audio.music.gain.value, audio.volumes.music);
  audio.setState('paused');
  assert.equal(audio.engineGain.gain.value, 0);
});

test('gear completion cues are quiet and obey effects mute, pause and background state', async () => {
  const audio = await setup();
  for (const event of ['gear-locked', 'gear-retracted']) {
    audio.setState('running');audio.event(event);
    assert.equal(audio.voices.size, 1);
    audio.stopVoices();
    for (const silence of [() => audio.setVolume('sfx', 0), () => audio.setState('paused'), () => audio.setBackground(true), () => audio.toggle()]) {
      silence();audio.event(event);
      assert.equal(audio.voices.size, 0);
      audio.setVolume('sfx', .8);audio.setState('running');audio.setBackground(false);
      if (!audio.enabled) audio.toggle();
    }
  }
});

test('aircraft engine sound follows actual spool and thrust even while stationary or gliding', async () => {
  const audio = await setup(), flight = createAircraftFlight('t6');
  flight.status = 'running'; flight.throttle = 1;
  audio.update(flightFrame(flight));
  assert.equal(audio.engineGain.gain.value, 0);
  updateAircraftFlight(flight, {}, 1 / 60);
  audio.update(flightFrame(flight));
  const spooling = audio.engineGain.gain.value;
  assert.ok(spooling > 0);
  flight.engineOutput = 1;
  audio.update(flightFrame(flight));
  assert.ok(audio.engineGain.gain.value > spooling);
  const full = audio.engineGain.gain.value;
  flight.speed = 90; flight.engineOutput = .1;
  audio.update(flightFrame(flight));
  assert.ok(audio.engineGain.gain.value < full / 2);
  flight.physics.thrust = 0;
  audio.update(flightFrame(flight));
  assert.equal(audio.engineGain.gain.value, 0);
});

test('aircraft have distinct bounded engine profiles and racing restores its original engine', async () => {
  const audio = await setup(), profiles = new Map();
  for (const aircraft of AIRCRAFT) {
    assert.ok(['jet', 'fighter', 'propeller', 'turboprop'].includes(aircraft.engineType));
    const flight = createAircraftFlight(aircraft.id, true);
    for (const output of [0, .5, 1, 3]) {
      audio.update({ ...flightFrame(flight), engineOutput: output });
      assert.ok(audio.engineGain.gain.value >= 0 && audio.engineGain.gain.value <= .16);
      assert.ok(audio.engine.frequency.value >= 20 && audio.engine.frequency.value <= 400);
    }
    profiles.set(aircraft.engineType, [audio.engine.type, audio.engine.frequency.value, audio.filter.frequency.value]);
  }
  assert.equal(new Set([...profiles.values()].map(JSON.stringify)).size, 4);
  audio.update(running);
  assert.equal(audio.engine.type, 'sawtooth');
  assert.equal(audio.engine.frequency.value, 35 + 36 / 420 * 190);
  assert.equal(audio.engineGain.gain.value, .035 + 36 / 420 * .08);
});

test('flight music layers follow the tuned speed limit across slow and fast aircraft', async () => {
  const scores = [];
  for (const id of ['t6', 'su30']) for (const maxSpeed of [.5, 2]) {
    const audio = await setup(), flight = createAircraftFlight(id, true, { physics: { maxSpeed } }), notes = [];
    audio.update(flightFrame(flight)); audio.stopVoices('music');
    audio.beat = 1; audio.tone = (...args) => notes.push(args);
    audio.update({ ...flightFrame(flight), speed: flight.performance.maxSpeed * .9 });
    assert.ok(notes.some(args => args[6] === 'tone'), id);
    scores.push(notes.slice());
    notes.length = 0; audio.stopVoices('music'); audio.beat = 1;
    audio.update({ ...flightFrame(flight), speed: flight.performance.maxSpeed * .1 });
    assert.ok(notes.every(args => args[6] === 'hat'), id);
  }
  assert.ok(scores.every(score => JSON.stringify(score) === JSON.stringify(scores[0])));
});

test('stall alerts repeat at a bounded rate, duck music and stop with pause or recovery', async () => {
  const audio = await setup(), frame = { ...flightFrame(createAircraftFlight('t6', true)), stalling: true };
  audio.update(frame);
  const alerts = () => [...audio.voices].filter(voice => voice.bus === 'sfx');
  assert.equal(alerts().length, 2);
  assert.equal(audio.music.gain.value, audio.volumes.music * .4);
  for (let i = 0; i < 120; i++) { audio.context.currentTime += 1 / 60; audio.update(frame); }
  assert.equal(alerts().length, 2);
  audio.context.currentTime = 3; audio.update(frame);
  assert.equal(alerts().length, 4);
  audio.update({ ...frame, status: 'paused' });
  assert.equal(audio.engineGain.gain.value, 0);
  assert.equal(audio.voices.size, 0);
  audio.context.currentTime = 10; audio.update({ ...frame, status: 'paused' });
  assert.equal(audio.voices.size, 0);
  audio.update({ ...frame, stalling: false });
  assert.equal(alerts().length, 0);
  audio.update(frame);
  assert.equal(alerts().length, 2);
  for (const silence of [() => audio.setVolume('sfx', 0), () => audio.toggle(), () => audio.setBackground(true)]) {
    silence(); audio.context.currentTime += 3; audio.update(frame);
    assert.equal(alerts().length, 0);
    audio.setVolume('sfx', .8); audio.setBackground(false); if (!audio.enabled) audio.toggle();
  }
});

test('rebuilding a closed audio context resets the stall warning clock', async () => {
  const audio = await setup(), frame = { ...flightFrame(createAircraftFlight('t6', true)), stalling: true };
  audio.context.currentTime = 100;
  audio.update(frame);
  audio.context.state = 'closed';
  assert.equal(await audio.unlock(), true);
  audio.update(frame);
  assert.equal([...audio.voices].filter(voice => voice.bus === 'sfx').length, 2);
});

test('brief stall recovery cannot retrigger warning bursts near the airspeed threshold', async () => {
  const audio = await setup(), frame = { ...flightFrame(createAircraftFlight('t6', true)), stalling: true };
  audio.update(frame);
  for (let i = 1; i <= 40; i++) {
    audio.context.currentTime = i / 40;
    audio.update({ ...frame, stalling: i % 2 === 0 });
  }
  assert.equal([...audio.voices].filter(voice => voice.bus === 'sfx').length, 2);
  audio.context.currentTime = 3; audio.update(frame);
  assert.equal([...audio.voices].filter(voice => voice.bus === 'sfx').length, 4);
});

test('cancelling a just-started sound cannot restore the default gain and create a burst', async () => {
  const audio = await setup();
  audio.event('land', 11);
  const voice = [...audio.voices][0], gain = voice.gain.gain, starts = [];
  assert.equal(voice.start, audio.context.currentTime);
  gain.value = 1;
  gain.cancelScheduledValues = () => { gain.value = 1; };
  gain.setValueAtTime = (value, time) => { starts.push({ value, time }); gain.value = value; };
  audio.stopVoices();
  assert.deepEqual(starts, [{ value: 0, time: 0 }]);
  assert.ok(voice.oscillator.stopped <= .03);
  assert.equal(audio.voices.size, 0);
});

test('landing strength follows impact speed within a quiet, bounded effects envelope', async () => {
  const audio = await setup(), tones = [];
  audio.tone = (...args) => tones.push(args);
  for (const speed of [2, 11, 100]) audio.event('land', speed);
  assert.equal(tones.length, 3);
  assert.ok(tones[0][5] < tones[1][5] && tones[1][5] < tones[2][5]);
  for (const tone of tones) {
    assert.equal(tone[4], 'sfx');
    assert.ok(tone[5] >= .08 && tone[5] <= .3);
    assert.ok(tone[1] >= .08 && tone[1] <= .16);
  }
});

test('landing cues obey effects mute, pause and background state', async () => {
  const audio = await setup();
  audio.update(running);
  audio.event('land', 11);
  assert.ok([...audio.voices].some(voice => voice.bus === 'sfx'));
  for (const stop of [() => audio.setVolume('sfx', 0), () => audio.setState('paused'), () => audio.setBackground(true), () => audio.toggle()]) {
    stop();
    audio.event('land', 50);
    assert.ok([...audio.voices].every(voice => voice.bus !== 'sfx'));
    audio.setVolume('sfx', .8); audio.setState('running'); audio.setBackground(false);
    if (!audio.enabled) audio.toggle();
  }
});

test('audio unlock failure is recoverable without a partially initialized graph', async () => {
  let attempts = 0;
  const audio = new AudioEngine(() => { if (!attempts++) throw new Error('unavailable'); return new Context(); });
  assert.equal(await audio.unlock(), false);
  assert.equal(await audio.unlock(), true);
  assert.equal(attempts, 2);
});

test('audio graph setup failure is cleaned up before retry', async () => {
  let fail = true;
  const audio = new AudioEngine(() => {
    const context = new Context();
    if (fail) {
      fail = false;
      context.createGain = () => { throw new Error('graph setup failed'); };
    }
    return context;
  });
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.context, null);
  assert.equal(await audio.unlock(), true);
});

test('a closed audio context is discarded before retry', async () => {
  let first = true;
  const audio = new AudioEngine(() => {
    const context = new Context();
    if (first) {
      first = false;
      context.resume = async () => { context.state = 'closed'; throw new Error('context closed'); };
    }
    return context;
  });
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.context, null);
  assert.equal(await audio.unlock(), true);
});

test('rebuilding after a closed context drops stale voices', async () => {
  const contexts = [];
  const audio = new AudioEngine(() => { const context = new Context(); contexts.push(context); return context; });
  assert.equal(await audio.unlock(), true);
  audio.event('pickup');
  assert.ok(audio.voices.size > 0);
  contexts[0].state = 'closed';
  assert.equal(await audio.unlock(), true);
  assert.equal(audio.voices.size, 0);
  assert.equal(contexts.length, 2);
});

test('concurrent unlock requests share one audio graph', async () => {
  let created = 0;
  const audio = new AudioEngine(() => { created++; return new Context(); });
  const results = await Promise.all([audio.unlock(), audio.unlock(), audio.unlock()]);
  assert.deepEqual(results, [true, true, true]);
  assert.equal(created, 1);
  assert.equal(audio.context.oscillators.length, 2, 'one engine oscillator and one shared looping noise source');
});

test('music plays after activation and has an independent bus from sound effects', async () => {
  const audio = await setup();
  audio.update(running);
  assert.ok([...audio.voices].some(voice => voice.bus === 'music'));
  audio.setVolume('music', 0);
  assert.equal(audio.music.gain.value, 0);
  audio.event('pickup');
  assert.ok([...audio.voices].some(voice => voice.bus === 'sfx'));
  audio.setVolume('sfx', 0);
  assert.equal(audio.sfx.gain.value, 0);
  assert.equal(audio.enabled, true);
});

test('pause immediately silences the engine and cancels scheduled sounds', async () => {
  const audio = await setup();
  audio.update(running);
  audio.event('won');
  const voices = [...audio.voices];
  assert.ok(voices.length > 0);
  audio.setState('paused');
  assert.equal(audio.engineGain.gain.value, 0);
  assert.equal(audio.voices.size, 0);
  assert.ok(voices.every(voice => voice.oscillator.stopped <= audio.context.currentTime + 0.04));
  audio.update({ ...running, status: 'paused' });
  audio.event('pickup');
  assert.equal(audio.voices.size, 0);
});

test('background and mute suppress scheduling without changing volume preferences', async () => {
  const audio = await setup();
  audio.setVolume('music', 0.3);
  audio.update(running);
  audio.setBackground(true);
  audio.event('meteor-strike');
  audio.update(running);
  assert.equal(audio.voices.size, 0);
  assert.equal(audio.master.gain.value, 0);
  audio.setBackground(false);
  audio.toggle();
  audio.update(running);
  assert.equal(audio.voices.size, 0);
  audio.toggle();
  audio.update(running);
  assert.ok(audio.voices.size > 0);
  assert.equal(audio.volumes.music, 0.3);
});

test('a delayed frame cannot enqueue missed music, and ended voices disconnect', async () => {
  const audio = await setup();
  audio.update(running);
  for (const voice of [...audio.voices]) voice.oscillator.onended();
  assert.equal(audio.voices.size, 0);
  audio.context.currentTime = 120;
  audio.update(running);
  assert.ok(audio.voices.size > 0 && audio.voices.size <= 10);
  const voices = [...audio.voices];
  for (const voice of voices) voice.oscillator.onended();
  assert.ok(voices.every(voice => !voice.oscillator.connections.length && !voice.gain.connections.length));
});

test('switching planets cancels old music while retaining event sounds', async () => {
  const audio = await setup();
  audio.update({ ...running, mission: { music: { root: 45, bpm: 124 } } });
  audio.event('pickup');
  const music = [...audio.voices].filter(voice => voice.bus === 'music');
  const effects = [...audio.voices].filter(voice => voice.bus === 'sfx');
  audio.update({ ...running, mission: { music: { root: 39, bpm: 142 } } });
  assert.ok(music.every(voice => !audio.voices.has(voice)));
  assert.ok(effects.every(voice => audio.voices.has(voice)));
  assert.equal(audio.theme.root, 39);
  assert.ok([...audio.voices].some(voice => voice.bus === 'music'));
});

test('music changes tempo, mode or voice even when the new theme shares its root', async () => {
  for (const change of [{ bpm: 136 }, { mode: 'major' }, { voice: 'triangle' }]) {
    const audio = await setup(), music = { root: 45, bpm: 124, mode: 'minor', voice: 'sine' };
    audio.update({ ...running, mission: { music } }); audio.event('pickup');
    const oldMusic = [...audio.voices].filter(voice => voice.bus === 'music');
    const effects = [...audio.voices].filter(voice => voice.bus === 'sfx');
    audio.update({ ...running, mission: { music: { ...music, ...change } } });
    assert.ok(oldMusic.every(voice => !audio.voices.has(voice)), JSON.stringify(change));
    assert.ok(effects.every(voice => audio.voices.has(voice)));
    assert.ok([...audio.voices].some(voice => voice.bus === 'music'));
    const current = [...audio.voices];
    audio.update({ ...running, mission: { music: { ...music, ...change } } });
    assert.ok(current.every(voice => audio.voices.has(voice)), 'equal theme values must not restart music each frame');
  }
});

test('high-speed percussion is stopped by pause and music mute without silencing SFX', async () => {
  const audio = await setup();
  audio.beat = 15;
  audio.theme = { root: 45, bpm: 124, mode: 'minor', voice: 'sine' };
  audio.update({ ...running, speed: 420 });
  assert.ok([...audio.voices].some(voice => voice.oscillator.buffer));
  audio.setVolume('music', 0);
  assert.equal(audio.voices.size, 0);
  audio.event('pickup');
  assert.ok(audio.voices.size > 0);
  audio.setState('paused');
  assert.equal(audio.voices.size, 0);
});

test('all five powerups have distinct sounds and respect the effects volume', async () => {
  const audio = await setup(), cues = new Set();
  for (const kind of ['shield', 'magnet', 'repair', 'battery', 'overdrive']) {
    const before = audio.context.oscillators.length;
    audio.event('powerup', kind);
    const notes = audio.context.oscillators.slice(before);
    assert.ok(notes.length > 0);
    cues.add(JSON.stringify(notes.map(note => [note.frequency.value, note.type])));
    audio.stopVoices();
  }
  assert.equal(cues.size, 5);
  audio.setVolume('sfx', 0);
  for (const kind of ['shield', 'magnet', 'repair', 'battery', 'overdrive']) audio.event('powerup', kind);
  assert.equal(audio.voices.size, 0);
});

test('dense music leaves headroom for immediate warning and impact sounds', async () => {
  const audio = await setup();
  for (let i = 0; i < 60; i++) audio.tone(440, 2, 0, 'sine', 'music');
  assert.ok(audio.voices.size <= 36);
  const before = audio.context.oscillators.length;
  audio.event('meteor-warning'); audio.event('impact');
  assert.equal(audio.context.oscillators.length - before, 4);
  assert.ok(audio.voices.size <= 48);
});

test('reward bursts leave four voices available for warnings and impacts', async () => {
  const audio = await setup();
  audio.update(running);
  for (let i = 0; i < 30; i++) audio.event('challenge', 'precision');
  assert.ok(audio.voices.size <= 44);
  const before = audio.context.oscillators.length;
  audio.event('meteor-warning'); audio.event('impact');
  assert.equal(audio.context.oscillators.length - before, 4);
  assert.ok(audio.voices.size <= 48);
});

test('alerts briefly lower music, honor volume changes and restore the selected level', async () => {
  const audio = await setup();
  audio.update(running);
  audio.event('meteor-warning');
  assert.equal(audio.music.gain.value, .45 * .4);
  assert.equal(audio.volumes.music, .45);
  assert.equal(audio.sfx.gain.value, .8);
  audio.setVolume('music', .3);
  assert.equal(audio.music.gain.value, .3 * .4);
  audio.context.currentTime = .3;
  audio.update(running);
  assert.equal(audio.music.gain.value, .3 * .4);
  audio.context.currentTime = 1;
  audio.update(running);
  assert.equal(audio.music.gain.value, .3);
});

test('muting effects ends music reduction while music mute preserves independent alerts', async () => {
  const audio = await setup();
  audio.update(running); audio.event('impact');
  audio.setVolume('sfx', 0);
  assert.equal(audio.music.gain.value, .45);
  audio.setVolume('sfx', .8); audio.event('meteor-warning');
  audio.setVolume('music', 0);
  assert.equal(audio.music.gain.value, 0);
  assert.ok([...audio.voices].every(voice => voice.bus === 'sfx'));
  assert.equal(audio.voices.size, 2);
  audio.setVolume('music', .3);
  assert.equal(audio.music.gain.value, .3 * .4);
  audio.setVolume('sfx', 0);
  assert.equal(audio.music.gain.value, .3);
});

test('muted alerts cannot lower music, and pausing or leaving cancels the temporary reduction', async () => {
  const audio = await setup();
  audio.update(running);
  audio.setVolume('sfx', 0);
  audio.event('impact');
  assert.equal(audio.music.gain.value, .45);
  audio.setVolume('sfx', .8);
  for (const stop of [() => audio.setState('paused'), () => audio.setBackground(true), () => audio.toggle()]) {
    audio.event('impact');
    assert.equal(audio.music.gain.value, .45 * .4);
    stop();
    assert.equal(audio.voices.size, 0);
    assert.equal(audio.music.gain.value, .45);
    audio.setState('running'); audio.setBackground(false);
    if (!audio.enabled) audio.toggle();
    audio.update(running);
  }
});

test('cruise controls have distinct short confirmation cues', async () => {
  const audio = await setup();
  const before = audio.context.oscillators.length;
  audio.event('cruise-on');
  const on = audio.context.oscillators.slice(before);
  assert.equal(on.length, 2);
  audio.stopVoices();
  const offStart = audio.context.oscillators.length;
  audio.event('cruise-off');
  const off = audio.context.oscillators.slice(offStart);
  assert.equal(off.length, 2);
  assert.notDeepEqual(on.map(note => note.frequency.value), off.map(note => note.frequency.value));
});

test('cockpit switch and autopilot disconnect cues stay on the effects bus and obey pause and mute', async () => {
  for (const [event, count] of [['cockpit-switch', 1], ['ap-disconnect', 2]]) {
    const audio = await setup();audio.setState('running');audio.event(event);
    assert.equal(audio.voices.size, count);assert.ok([...audio.voices].every(voice => voice.bus === 'sfx'));
    audio.setState('paused');audio.event(event);assert.equal(audio.voices.size, 0);
    audio.setState('running');audio.setVolume('sfx', 0);audio.event(event);assert.equal(audio.voices.size, 0);
  }
});

test('automation disconnect retains warning headroom and briefly ducks music without changing its volume', async () => {
  const audio = await setup();
  audio.update(running);
  for (let i = 0; i < 30; i++) audio.event('challenge', 'precision');
  assert.equal(audio.voices.size, 44);
  const before = audio.context.oscillators.length;
  audio.event('ap-disconnect');
  assert.deepEqual(audio.context.oscillators.slice(before).map(node => node.frequency.value), [880, 660]);
  assert.equal(audio.music.gain.value, audio.volumes.music * .4);
  assert.equal(audio.volumes.music, .45);
  audio.context.currentTime = .5;audio.update(running);
  assert.equal(audio.music.gain.value, audio.volumes.music);
  for (const stop of [() => audio.setState('paused'), () => audio.setBackground(true), () => audio.toggle(), () => audio.setVolume('sfx', 0)]) {
    audio.stopVoices();audio.event('ap-disconnect');
    assert.equal(audio.music.gain.value, audio.volumes.music * .4);
    stop();audio.event('ap-disconnect');
    assert.equal(audio.voices.size, 0);
    assert.equal(audio.music.gain.value, audio.volumes.music);
    audio.setState('running');audio.setBackground(false);audio.setVolume('sfx', .8);
    if (!audio.enabled) audio.toggle();
  }
});

test('traffic impacts sound distinct while retaining alert headroom, music ducking and mute behavior', async () => {
  const audio = await setup();
  audio.update(running);
  const notes = kind => {
    const before = audio.context.oscillators.length;
    audio.event('impact', kind);
    return audio.context.oscillators.slice(before).map(node => [node.frequency.value, node.type]);
  };
  const rock = notes(); audio.stopVoices();
  const traffic = notes('traffic');
  assert.equal(traffic.length, 2);
  assert.notDeepEqual(traffic, rock);
  assert.equal(audio.music.gain.value, audio.volumes.music * .4);
  audio.stopVoices();
  for (let i = 0; i < 30; i++) audio.event('challenge', 'precision');
  const before = audio.context.oscillators.length;
  audio.event('meteor-warning'); audio.event('impact', 'traffic');
  assert.equal(audio.context.oscillators.length - before, 4);
  audio.setVolume('sfx', 0);
  audio.event('impact', 'traffic');
  assert.equal(audio.voices.size, 0);
  assert.equal(audio.music.gain.value, audio.volumes.music);
});
