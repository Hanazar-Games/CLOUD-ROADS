import { composeBeat } from './music.js';

const engineProfiles = {
  jet: { wave: 'sawtooth', base: 42, range: 155, filter: 240, gain: .085, noise: .3, air: 700 },
  fighter: { wave: 'sawtooth', base: 48, range: 205, filter: 380, gain: .095, noise: .4, air: 1050 },
  propeller: { wave: 'triangle', base: 24, range: 72, filter: 180, gain: .11, noise: .12, air: 240 },
  turboprop: { wave: 'sawtooth', base: 31, range: 90, filter: 210, gain: .09, noise: .2, air: 420 },
};
const graphKeys = ['engine', 'noiseSource', 'engineGain', 'filter', 'exterior', 'exteriorFilter', 'master', 'music', 'sfx', 'limiter'];
const layerKeys = ['engineNoise', 'wind', 'runway', 'gearMotor'];
const bounded = (value, max = 1) => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;

export class AudioEngine {
  constructor(createContext = () => new AudioContext()) {
    this.createContext = createContext;
    this.disposed = false;
    this.enabled = true;
    this.masterVolume = 1;
    this.background = false;
    this.state = 'menu';
    this.volumes = { music: 0.45, sfx: 0.8 };
    this.layers = { engine: 1, wind: .65, runway: .75, mechanical: .8 };
    this.voices = new Set();
    this.retiringVoices = new Set();
    this.layerBuses = {};
    this.targets = new WeakMap();
    this.beat = 0;
    this.nextBeat = 0;
    this.alertUntil = 0;
    this.nextStall = 0;
    this.unlocking = null;
  }

  async unlock() {
    if (this.disposed) return false;
    if (this.unlocking) return this.unlocking;
    this.unlocking = (async () => {
      let context;
      await Promise.resolve();
      if (this.disposed) return false;
      try {
        if (this.context?.state === 'closed') {
          this.releaseGraph();
          this.ready = false;
          this.alertUntil = 0;
          this.nextStall = 0;
          this.nextBeat = 0;
        }
        if (!this.context) {
          this.context = this.createContext();
          context = this.context;
          this.master = this.context.createGain();
          this.master.gain.value = this.enabled && !this.background ? 0.22 * this.masterVolume : 0;
          this.limiter = this.context.createDynamicsCompressor();
          this.limiter.threshold.value = -8; this.limiter.knee.value = 6;
          this.limiter.ratio.value = 12; this.limiter.attack.value = .003; this.limiter.release.value = .18;
          this.master.connect(this.limiter).connect(this.context.destination);
          for (const bus of ['music', 'sfx']) {
            this[bus] = this.context.createGain();
            this[bus].gain.value = this.volumes[bus];
            this[bus].connect(this.master);
          }
          this.exterior = this.context.createGain();
          this.exterior.connect(this.sfx);
          this.exteriorFilter = this.context.createBiquadFilter();
          this.exteriorFilter.type = 'lowpass'; this.exteriorFilter.frequency.value = 12000; this.exteriorFilter.Q.value = .5;
          this.exteriorFilter.connect(this.exterior);
          for (const key of ['wind', 'runway', 'mechanical']) {
            const gain = this.context.createGain(); gain.gain.value = this.layers[key];
            gain.connect(key === 'mechanical' ? this.sfx : this.exteriorFilter);
            this.layerBuses[key] = gain;
          }
          this.engine = this.context.createOscillator();
          this.engine.type = 'sawtooth';
          this.filter = this.context.createBiquadFilter();
          this.filter.type = 'lowpass';
          this.filter.frequency.value = 220;
          this.engineGain = this.context.createGain();
          this.engineGain.gain.value = 0;
          this.filter.Q.value = .5;
          this.engine.connect(this.filter).connect(this.engineGain).connect(this.exteriorFilter);
          this.engine.start();
          this.noiseBuffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
          const noise = this.noiseBuffer.getChannelData(0);
          for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
          this.noiseSource = this.context.createBufferSource();
          this.noiseSource.buffer = this.noiseBuffer; this.noiseSource.loop = true;
          for (const [key, frequency, type] of [['engineNoise', 700, 'lowpass'], ['wind', 500, 'bandpass'], ['runway', 160, 'lowpass'], ['gearMotor', 320, 'bandpass']]) {
            const filter = this.context.createBiquadFilter(), gain = this.context.createGain();
            filter.type = type; filter.frequency.value = frequency; filter.Q.value = .5; gain.gain.value = 0;
            this.noiseSource.connect(filter).connect(gain).connect(key === 'gearMotor' ? this.sfx : this.exteriorFilter);
            this[key] = { filter, gain };
          }
          this.noiseSource.start();
          this.ready = true;
        }
        context = this.context;
        await context.resume();
        return !this.disposed && this.context === context && context.state === 'running';
      } catch {
        if (context && this.context === context && (!this.ready || context.state === 'closed')) {
          context.close().catch(() => {});
          this.ready = false;
          this.alertUntil = 0;
          this.nextStall = 0;
          this.nextBeat = 0;
          this.releaseGraph();
        }
        return false;
      } finally {
        this.unlocking = null;
      }
    })();
    return this.unlocking;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.background = true; this.mix();
    this.context?.close().catch(() => {}); this.releaseGraph(); this.ready = false;
  }

  releaseGraph() {
    for (const voice of [...this.voices, ...this.retiringVoices]) this.releaseVoice(voice);
    for (const source of [this.engine, this.noiseSource]) { try { source?.stop(); } catch { /* A failed graph may contain an unstarted source. */ } }
    for (const key of graphKeys) { this[key]?.disconnect(); this[key] = null; }
    for (const key of layerKeys) { this[key]?.filter.disconnect(); this[key]?.gain.disconnect(); this[key] = null; }
    for (const bus of Object.values(this.layerBuses)) bus.disconnect();
    this.layerBuses = {};
    this.context = null; this.noiseBuffer = null; this.targets = new WeakMap();
  }

  silenceLayers() {
    if (this.engineGain) this.target(this.engineGain.gain, 0, .01);
    for (const key of layerKeys) if (this[key]) this.target(this[key].gain.gain, 0, .01);
  }

  setLayerVolume(layer, value) {
    if (!Object.hasOwn(this.layers, layer) || !Number.isFinite(value)) return;
    this.layers[layer] = bounded(value);
    if (this.layerBuses[layer]) this.target(this.layerBuses[layer].gain, this.layers[layer], .01);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) { this.stopVoices(); this.silenceLayers(); }
    this.mix();
    return this.enabled;
  }

  setVolume(bus, value) {
    if (!Object.hasOwn(this.volumes, bus) || !Number.isFinite(value)) return;
    this.volumes[bus] = Math.max(0, Math.min(1, value));
    if (!this.volumes[bus]) { this.stopVoices(bus); if (bus === 'sfx') this.silenceLayers(); }
    if (bus === 'music') this.mixMusic();
    else if (this[bus]) this.target(this[bus].gain, this.volumes[bus]);
  }

  target(parameter, value, fade = 0.025) {
    const previous = this.targets.get(parameter);
    if (previous?.value === value && previous.fade === fade) return;
    const now = this.context.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setTargetAtTime(value, now, fade);
    if (previous) { previous.value = value; previous.fade = fade; }
    else this.targets.set(parameter, { value, fade });
  }

  mix() {
    if (this.master) this.target(this.master.gain, this.enabled && !this.background ? 0.22 * this.masterVolume : 0, 0.01);
  }

  mixMusic() {
    if (this.music) this.target(this.music.gain, this.volumes.music * (this.context.currentTime < this.alertUntil ? .4 : 1), .05);
  }

  setBackground(background) {
    this.background = background;
    if (background) {
      this.stopVoices();
      this.silenceLayers();
    }
    this.mix();
  }

  setState(state) {
    if (state === this.state) return;
    this.state = state;
    this.stopVoices(state === 'running' ? 'music' : undefined);
    if (state !== 'running') this.silenceLayers();
    if (state === 'countdown' || state === 'menu') this.beat = 0;
  }

  stopVoices(bus) {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      if (bus && voice.bus !== bus) continue;
      const level = voice.start >= now ? 0 : voice.gain.gain.value;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(level, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + 0.02);
      voice.oscillator.stop(now + 0.025);
      this.voices.delete(voice);
      this.retiringVoices.add(voice);
    }
    if (!bus || bus === 'music') this.nextBeat = 0;
    if (!bus || bus === 'sfx') { this.alertUntil = 0; this.nextStall = 0; this.mixMusic(); }
  }

  releaseVoice(voice) {
    voice.oscillator.onended = null;
    voice.oscillator.stop(); voice.oscillator.disconnect(); voice.filter?.disconnect(); voice.gain.disconnect();
    this.voices.delete(voice); this.retiringVoices.delete(voice);
  }

  tone(frequency, duration = 0.15, offset = 0, type = 'sine', bus = 'sfx', volume = 0.3, kind = 'tone', layer) {
    if (!this.context || this.context.state !== 'running' || !this.enabled || this.background || this.state === 'paused' || !this.volumes[bus]) return;
    const limit = bus === 'music' ? 36 : kind === 'alert' ? 48 : 44;
    if (this.voices.size + this.retiringVoices.size >= limit && this.retiringVoices.size) this.releaseVoice(this.retiringVoices.values().next().value);
    if (this.voices.size + this.retiringVoices.size >= limit) return;
    const start = this.context.currentTime + offset;
    const noise = kind === 'hat' || kind === 'snare' || kind === 'mechanical' || kind === 'air';
    const oscillator = noise ? this.context.createBufferSource() : this.context.createOscillator();
    const gain = this.context.createGain();
    let filter;
    if (noise) {
      oscillator.buffer = this.noiseBuffer;
      oscillator.loop = true;
      filter = this.context.createBiquadFilter();
      filter.type = kind === 'hat' ? 'highpass' : kind === 'air' ? 'lowpass' : 'bandpass';
      filter.Q.value = .5;
      filter.frequency.value = frequency;
      oscillator.connect(filter).connect(gain);
    } else {
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (kind === 'kick') oscillator.frequency.exponentialRampToValueAtTime(42, start + duration);
      oscillator.connect(gain);
    }
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + (kind === 'pad' ? 0.18 : kind === 'hat' || kind === 'kick' ? 0.004 : 0.01));
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    gain.connect(this.layerBuses[layer] ?? this[bus]);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
    const voice = { oscillator, gain, filter, bus, start };
    this.voices.add(voice);
    if (kind === 'alert') {
      this.alertUntil = Math.max(this.alertUntil, start + duration + .12);
      this.mixMusic();
    }
    oscillator.onended = () => { oscillator.disconnect(); filter?.disconnect(); gain.disconnect(); this.voices.delete(voice); this.retiringVoices.delete(voice); };
  }

  event(type, kind) {
    const mechanical = this.layers.mechanical;
    if (mechanical) {
      if (type === 'cockpit-switch') this.tone(920, .045, 0, 'triangle', 'sfx', .08, 'tone', 'mechanical');
      if (type === 'gear-locked') this.tone(240, .11, 0, 'triangle', 'sfx', .1, 'tone', 'mechanical');
      if (type === 'gear-retracted') this.tone(180, .08, 0, 'triangle', 'sfx', .08, 'tone', 'mechanical');
      if (type === 'flaps' || type === 'speed-brake') this.tone(type === 'flaps' ? 460 : 850, .5, 0, 'sine', 'sfx', .12, 'mechanical', 'mechanical');
    }
    if (type === 'takeoff' && this.layers.wind) this.tone(650, .6, 0, 'sine', 'sfx', .08, 'air', 'wind');
    if (type === 'touchdown' && this.layers.runway) {
      const strength = bounded((Number.isFinite(kind) ? kind : 11) / 18);
      this.tone(80 - strength * 25, .08 + strength * .08, 0, 'triangle', 'sfx', .08 + strength * .2, 'tone', 'runway');
      this.tone(900, .12 + strength * .16, .02, 'sine', 'sfx', .05 + strength * .1, 'mechanical', 'runway');
    }
    if (type === 'ap-disconnect') { this.tone(880, .12, 0, 'triangle', 'sfx', .16, 'alert');this.tone(660, .16, .15, 'triangle', 'sfx', .16, 'alert'); }
    const alertTone = (frequency, duration, offset = 0, wave = 'triangle') => this.tone(frequency, duration, offset, wave, 'sfx', .3, 'alert');
    if (type === 'powerup') {
      const notes = { shield: [392, 523, 784], magnet: [523, 659, 988], repair: [440, 554, 659], battery: [660, 1320], overdrive: [220, 440, 660, 880] }[kind];
      if (notes) notes.forEach((note, i) => this.tone(note, .18, i * .07, kind === 'magnet' ? 'sine' : 'triangle'));
    }
    if (type === 'shield-block') { this.tone(260, .25, 0, 'triangle'); this.tone(520, .2, .06); }
    if (type === 'challenge') (kind === 'precision' ? [659, 880, 1100, 1320] : [880, 1100, 1320]).forEach((note, i) => this.tone(note, .2, i * .06));
    if (type === 'pickup') { this.tone(780); this.tone(1170, 0.22, 0.08); }
    if (type === 'gate') [440, 660, 880].forEach((note, i) => this.tone(note, 0.25, i * 0.09));
    if (type === 'impact' && kind === 'traffic') { alertTone(110, .16); alertTone(220, .12, .025, 'square'); }
    else if (type === 'impact' || type === 'miss') { alertTone(75, .3); alertTone(48, .3, .06, 'sawtooth'); }
    if (type === 'launch') { this.tone(440); this.tone(880, 0.4, 0.12); }
    if (type === 'jump') { this.tone(180, 0.16, 0, 'triangle'); this.tone(540, 0.25, 0.08); }
    if (type === 'land') {
      const strength = Math.max(0, Math.min(1, (Number.isFinite(kind) ? kind : 11) / 18));
      this.tone(80 - strength * 25, .08 + strength * .08, 0, 'triangle', 'sfx', .08 + strength * .2);
    }
    if (type === 'pad') { this.tone(330, 0.15); this.tone(660, 0.2, 0.08); this.tone(990, 0.25, 0.16); }
    if (type === 'dodge') { this.tone(1040, 0.2); this.tone(1560, 0.3, 0.07); }
    if (type === 'meteor-warning') { alertTone(520, .11); alertTone(520, .11, .2); }
    if (type === 'stall') { alertTone(620, .12); alertTone(480, .16, .18); }
    if (type === 'meteor-strike') { alertTone(42, .45, 0, 'sawtooth'); alertTone(68, .25, .04); }
    if (type === 'low-gravity') { this.tone(220, 0.3); this.tone(330, 0.4, 0.1); }
    if (type === 'glide' || type === 'meteor-dodge') [660, 990, 1320].forEach((note, i) => this.tone(note, 0.25, i * 0.07));
    if (type === 'cruise-on') { this.tone(392, 0.11, 0, 'triangle', 'sfx', 0.18); this.tone(784, 0.16, 0.07, 'sine', 'sfx', 0.16); }
    if (type === 'cruise-off') { this.tone(784, 0.1, 0, 'sine', 'sfx', 0.14); this.tone(392, 0.15, 0.06, 'triangle', 'sfx', 0.16); }
    if (type === 'won') [440, 554, 660, 880].forEach((note, i) => this.tone(note, 0.5, i * 0.13));
    if (type === 'lost') { this.tone(220, 0.3); this.tone(146, 0.5, 0.2); }
  }

  update(game) {
    this.setState(game.status);
    const theme = game.mission?.music ?? { root: 45, bpm: 124 };
    const mode = theme.mode ?? 'minor', voice = theme.voice ?? 'sine';
    if (this.theme?.root !== theme.root || this.theme.bpm !== theme.bpm || this.theme.mode !== mode || this.theme.voice !== voice) {
      this.stopVoices('music');
      this.theme = { root: theme.root, bpm: theme.bpm, mode, voice };
      this.beat = 0;
    }
    if (!this.engine || this.context.state !== 'running' || this.background) return;
    this.mixMusic();
    const now = this.context.currentTime;
    const speed = bounded(game.speed, 1200);
    const intensity = bounded(speed / (game.aircraft ? game.maxSpeed : 420));
    const profile = game.aircraft && engineProfiles[game.aircraft.engineType];
    const output = profile ? bounded(game.engineOutput, 3) : 0;
    const power = Math.sqrt(Math.min(1.6, output));
    const wave = profile?.wave ?? 'sawtooth';
    if (this.engine.type !== wave) this.engine.type = wave;
    this.target(this.engine.frequency, profile ? profile.base + power * profile.range : 35 + intensity * 190, .08);
    this.target(this.filter.frequency, profile ? profile.filter + power * 900 : 180 + intensity * 700, .1);
    const audible = game.status === 'running' && this.enabled && this.volumes.sfx > 0;
    const level = profile ? power * profile.gain * this.layers.engine : .035 + intensity * .08;
    const fade = audible ? .1 : .01;
    this.target(this.engineGain.gain, audible ? level : 0, fade);
    this.target(this.exteriorFilter.frequency, game.cockpit ? 1100 : 12000, .12);
    this.target(this.exterior.gain, game.cockpit ? .5 : 1, .12);
    const airspeed = bounded(speed / 240, 1.5);
    const drag = 1 + bounded(game.gearPosition) * .25 + bounded(game.flaps, 2) * .1 + (game.speedBrake ? .3 : 0);
    this.target(this.engineNoise.filter.frequency, profile ? profile.air + power * 1600 : 700, .15);
    this.target(this.engineNoise.gain.gain, audible && profile ? power * profile.noise * this.layers.engine * (game.reverse ? 1.3 : 1) : 0, fade);
    this.target(this.wind.filter.frequency, 300 + airspeed * 1100, .15);
    this.target(this.wind.gain.gain, audible && profile ? .22 * airspeed ** 1.3 * drag * this.layers.wind : 0, fade);
    this.target(this.runway.filter.frequency, 100 + bounded(speed, 120) * 3, .15);
    this.target(this.runway.gain.gain, audible && profile && game.onGround ? .28 * bounded(speed / 80) * this.layers.runway : 0, fade);
    const gearMoving = Number.isFinite(game.gearPosition) && Math.abs(game.gearPosition - Number(Boolean(game.gearDown))) > .002;
    this.target(this.gearMotor.gain.gain, audible && profile && gearMoving ? .065 * this.layers.mechanical : 0, .03);
    if (!game.aircraft || game.status !== 'running' || !this.enabled || !this.volumes.sfx) this.nextStall = 0;
    else if (game.stalling) {
      if (now >= this.nextStall) { this.event('stall'); this.nextStall = now + 2.5; }
    }
    if (!this.enabled || !this.volumes.music || !['menu', 'running'].includes(game.status)) return;
    if (this.nextBeat < now) this.nextBeat = now + 0.03;
    while (this.nextBeat < now + 0.2) {
      const offset = this.nextBeat - now;
      for (const note of composeBeat(this.beat, theme, intensity, game.status === 'menu')) {
        this.tone(note.frequency, note.duration, offset, note.type, 'music', note.volume, note.kind);
      }
      this.beat++;
      this.nextBeat += 60 / (theme.bpm * (game.status === 'menu' ? 1.25 : 2));
    }
  }
}
