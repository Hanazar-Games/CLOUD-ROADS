export interface SoundState {
  driving: boolean; speed: number; throttle: boolean; mass: number; motorcycle: boolean;
  rain: number; shelter: number; cockpit: boolean; signal: boolean; wiper: number; walkingSpeed: number;
  rpm: number; shifts: number; exposure: number; wet: number; nature: boolean; night: number;
  horn: boolean; fan: number; washer: number; motor: boolean;
}
const chords = [[130.81, 164.81, 196, 293.66], [87.31, 130.81, 174.61, 261.63], [110, 164.81, 220, 329.63], [98, 146.83, 196, 293.66]];
export const audioChannels = [
  ['master', 'masterVolume', '总音量'], ['sfx', 'sfxVolume', '全部音效'], ['music', 'musicVolume', '背景音乐'],
  ['engine', 'engineVolume', '发动机与换挡'], ['tire', 'tireVolume', '轮胎与路面'], ['nature', 'natureVolume', '山野环境'],
  ['weather', 'weatherVolume', '风声与雨声'], ['cabin', 'cabinVolume', '车内设备'], ['effects', 'effectsVolume', '喇叭、提示与脚步'],
] as const;
export type MusicStyle = 'ambient' | 'night' | 'motion';

export class AudioSystem {
  enabled = false;
  masterVolume = 0.85;
  sfxVolume = 0.8;
  musicVolume = 0.3;
  engineVolume = 1.1;
  tireVolume = 0.85;
  natureVolume = 0.8;
  weatherVolume = 0.9;
  cabinVolume = 0.75;
  effectsVolume = 0.7;
  musicStyle: MusicStyle = 'ambient';
  musicPace = 1;
  error = '';
  private context?: AudioContext;
  private master?: GainNode;
  private sfx?: GainNode;
  private music?: GainNode;
  private engine?: OscillatorNode;
  private engineGain?: GainNode;
  private windGain?: GainNode;
  private rainGain?: GainNode;
  private wiperGain?: GainNode;
  private clickGain?: GainNode;
  private stepGain?: GainNode;
  private tireGain?: GainNode;
  private cabinGain?: GainNode;
  private hornGain?: GainNode;
  private shiftGain?: GainNode;
  private natureGain?: GainNode;
  private harmonic?: OscillatorNode;
  private horn?: OscillatorNode;
  private bird?: OscillatorNode;
  private melody?: OscillatorNode;
  private melodyGain?: GainNode;
  private engineFilter?: BiquadFilterNode;
  private lastShift = 0;
  private previewTime = 0;
  private previewKind = '';
  private readonly voices: OscillatorNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private active = true;
  private transitioning = false;
  private disposed = false;
  private time = 0;
  private chord = -1;
  private step = 0;
  private lastSignal = false;
  private lastWiper = 0;
  private audible = false;
  private readonly targets = new WeakMap<AudioParam, number>();

  get state(): string { return this.error ? 'unavailable' : this.context?.state ?? 'locked'; }

  toggle(): void {
    if (this.disposed) return;
    this.enabled = !this.enabled;
    if (this.enabled && !this.context) {
      try { this.create(); }
      catch { this.error = '当前浏览器无法开启音频，仍可继续探索。'; this.enabled = false; this.dispose(); return; }
    }
    this.sync();
  }

  setActive(active: boolean): void { this.active = active; this.sync(); }

  private sync(): void {
    const context = this.context;
    if (!context || this.disposed || this.error) return;
    const now = context.currentTime;
    const audible = this.enabled && this.active && this.masterVolume > 0 && (this.sfxVolume > 0 || this.musicVolume > 0);
    if (this.audible !== audible) {
      this.audible = audible;
      this.master!.gain.cancelScheduledValues(now); this.master!.gain.setValueAtTime(0, now); this.targets.delete(this.master!.gain);
      if (!audible) {
        this.previewTime = 0;
        for (const channel of [this.engineGain, this.wiperGain, this.clickGain, this.stepGain, this.hornGain, this.shiftGain, this.cabinGain]) {
          channel!.gain.cancelScheduledValues(now); channel!.gain.setValueAtTime(0, now); this.targets.delete(channel!.gain);
        }
      }
    }
    for (const [parameter, value] of [[this.sfx!.gain, this.sfxVolume], [this.music!.gain, this.musicVolume], [this.master!.gain, audible ? this.masterVolume * 0.7 : 0]] as const) {
      if (this.targets.get(parameter) === value) continue;
      this.targets.set(parameter, value);
      if ((context.state !== 'running' && parameter !== this.master!.gain) || value === 0) { parameter.cancelScheduledValues(now); parameter.setValueAtTime(value, now); }
      else parameter.setTargetAtTime(value, now, parameter === this.master!.gain ? 0.02 : 0.08);
    }
    if (this.transitioning || context.state === (audible ? 'running' : 'suspended')) return;
    this.transitioning = true;
    void (audible ? context.resume() : context.suspend()).then(() => {
      this.transitioning = false;
      this.sync();
    }, () => { this.transitioning = false; if (!this.disposed) { this.error = '音频暂不可用，请刷新页面后重试。'; this.enabled = false; } });
  }

  private create(): void {
    const context = this.context = new AudioContext();
    const gain = (target: AudioNode, value = 0) => { const node = context.createGain(); node.gain.value = value; node.connect(target); return node; };
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.18;
    limiter.connect(context.destination); this.master = gain(limiter);
    this.sfx = gain(this.master, this.sfxVolume); this.music = gain(this.master, this.musicVolume);
    this.engineGain = gain(this.sfx);
    const filter = this.engineFilter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 650; filter.Q.value = 0.5; filter.connect(this.engineGain);
    this.engine = context.createOscillator(); this.engine.type = 'triangle'; this.engine.connect(filter); this.engine.start(); this.sources.push(this.engine);
    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate), data = noise.getChannelData(0);
    let random = 7381;
    for (let i = 0; i < data.length; i++) { random = (Math.imul(random, 1664525) + 1013904223) | 0; data[i] = random / 2147483648; }
    const noiseSource = context.createBufferSource(); noiseSource.buffer = noise; noiseSource.loop = true; noiseSource.start(); this.sources.push(noiseSource);
    const noiseChannel = (frequency: number, type: BiquadFilterType) => {
      const node = context.createBiquadFilter(); node.type = type; node.frequency.value = frequency; node.Q.value = 0.5;
      const level = gain(this.sfx!); noiseSource.connect(node); node.connect(level); return level;
    };
    this.windGain = noiseChannel(350, 'lowpass'); this.rainGain = noiseChannel(1800, 'highpass');
    this.wiperGain = noiseChannel(950, 'bandpass'); this.stepGain = noiseChannel(180, 'lowpass');
    this.clickGain = gain(this.sfx);
    const click = context.createOscillator(); click.type = 'sine'; click.frequency.value = 900; click.connect(this.clickGain); click.start(); this.sources.push(click);
    this.tireGain = noiseChannel(700, 'bandpass'); this.cabinGain = noiseChannel(500, 'lowpass'); this.shiftGain = noiseChannel(230, 'bandpass');
    this.hornGain = gain(this.sfx); this.natureGain = gain(this.sfx);
    const oscillator = (type: OscillatorType, target: AudioNode) => {
      const node = context.createOscillator(); node.type = type; node.connect(target); node.start(); this.sources.push(node); return node;
    };
    this.harmonic = oscillator('sawtooth', gain(filter, 0.16));
    this.horn = oscillator('triangle', this.hornGain); this.bird = oscillator('sine', this.natureGain);
    this.melodyGain = gain(this.music); this.melody = oscillator('sine', this.melodyGain);
    for (let i = 0; i < 4; i++) {
      const voice = context.createOscillator(); voice.type = 'sine'; voice.frequency.value = chords[0][i];
      voice.connect(gain(this.music, 0.085)); voice.start(); this.sources.push(voice); this.voices.push(voice);
    }
  }

  update(dt: number, state: SoundState): void {
    this.sync();
    const context = this.context;
    if (!context || context.state !== 'running' || !this.audible || this.disposed) { this.lastSignal = state.signal; this.lastWiper = state.wiper; this.lastShift = state.shifts; return; }
    const now = context.currentTime;
    const set = (parameter: AudioParam, value: number, smooth = 0.08) => {
      if (this.targets.get(parameter) === value) return;
      this.targets.set(parameter, value); parameter.setTargetAtTime(value, now, smooth);
    };
    const speed = Math.min(75, Math.abs(state.speed)), cabin = state.cockpit ? 0.22 + state.exposure * 0.78 : 1;
    const preview = this.previewTime > 0; this.previewTime = Math.max(0, this.previewTime - dt);
    const rpm = preview && this.previewKind === 'engine' ? 2200 + Math.sin(this.time * 4) * 700 : state.rpm;
    const frequency = Math.max(20, rpm / 60 * (state.motorcycle ? 1.4 : state.mass > 4000 ? 2 : 2.5));
    set(this.engine!.frequency, frequency, 0.025); set(this.harmonic!.frequency, frequency * 2.01, 0.025);
    set(this.engineFilter!.frequency, 350 + (state.throttle ? 900 : 180) + state.exposure * 450);
    set(this.engineGain!.gain, (state.driving || preview && this.previewKind === 'engine' ? 0.085 + speed * 0.0012 + (state.throttle ? 0.045 : 0) : 0) * this.engineVolume);
    set(this.windGain!.gain, (0.045 + speed * 0.004) * cabin * (1 - state.shelter) * this.weatherVolume);
    set(this.rainGain!.gain, state.rain * 0.17 * (0.35 + cabin * 0.65) * (1 - state.shelter) * this.weatherVolume);
    set(this.tireGain!.gain, Math.min(0.15, speed * 0.004) * (1 + state.wet * 0.65) * (0.55 + cabin * 0.45) * this.tireVolume);
    set(this.wiperGain!.gain, state.driving && dt > 0 ? Math.min(0.07, Math.abs(state.wiper - this.lastWiper) / dt * 0.045) * this.cabinVolume : 0, 0.025);
    set(this.cabinGain!.gain, state.driving ? (state.fan * 0.012 + state.washer * 0.045 + Number(state.motor) * 0.022) * this.cabinVolume : 0);
    set(this.horn!.frequency, state.mass > 4000 ? 155 : state.motorcycle ? 490 : 350);
    set(this.hornGain!.gain, (state.horn || preview && this.previewKind === 'horn' ? 0.14 : 0) * this.effectsVolume, 0.015);
    const chirp = this.time % (state.night > 0.5 ? 1.4 : 8.7);
    set(this.bird!.frequency, state.night > 0.5 ? 3200 : 1700 + Math.sin(chirp * 19) * 650);
    set(this.natureGain!.gain, state.nature && state.rain < 0.3 && chirp < 0.55 ? 0.035 * Math.sin(chirp / 0.55 * Math.PI) ** 2 * cabin * (1 - state.shelter) * this.natureVolume : 0, 0.015);
    if (state.driving && state.shifts !== this.lastShift) this.pulse(this.shiftGain!, 0.13 * this.engineVolume, 0.045);
    this.lastShift = state.shifts;
    if (state.driving && state.signal !== this.lastSignal) {
      this.pulse(this.clickGain!, 0.075 * this.effectsVolume, 0.018);
    }
    this.step += state.walkingSpeed * dt;
    if (this.step > 1.6) {
      this.step %= 1.6;
      this.pulse(this.stepGain!, 0.22 * this.effectsVolume, 0.025);
    }
    this.lastSignal = state.signal; this.lastWiper = state.wiper;
    this.time += dt * this.musicPace;
    const chord = Math.floor(this.time / 12) % chords.length;
    const transpose = this.musicStyle === 'night' ? 0.75 : this.musicStyle === 'motion' ? 1.12246 : 1;
    this.chord = chord; this.voices.forEach((voice, i) => set(voice.frequency, chords[chord][i] * transpose, 0.6));
    const beat = this.time % (this.musicStyle === 'motion' ? 0.6 : 1.2), note = [0, 2, 1, 3, 2, 1, 0, 3][Math.floor(this.time / (this.musicStyle === 'motion' ? 0.6 : 1.2)) % 8];
    set(this.melody!.frequency, chords[this.chord][note] * 2 * transpose, 0.025);
    set(this.melodyGain!.gain, (this.musicStyle === 'night' ? 0.025 : 0.045) * Math.exp(-beat * 5), 0.04);
  }

  preview(kind: 'engine' | 'shift' | 'horn'): boolean {
    if (!this.audible || this.state !== 'running' || this.sfxVolume <= 0 || this.masterVolume <= 0) return false;
    this.previewTime = 1.2; this.previewKind = kind;
    if (kind === 'shift') this.pulse(this.shiftGain!, 0.13 * this.engineVolume, 0.045);
    return true;
  }

  private pulse(channel: GainNode, level: number, decay: number): void {
    const now = this.context!.currentTime;
    channel.gain.cancelScheduledValues(now); channel.gain.setValueAtTime(level, now); channel.gain.setTargetAtTime(0, now, decay);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    this.master?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
  }
}
