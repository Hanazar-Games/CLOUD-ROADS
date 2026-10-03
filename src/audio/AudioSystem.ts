import type { Powertrain } from '../vehicle/Transmission';
import { radioStations } from './RadioStations';
import { HornVoice, type HornSound } from './VehicleHorn';
import type { VehicleKind } from '../vehicle/VehicleConfig';
import { EngineVoice, type EngineSound } from './VehicleEngine';

export interface SoundState {
  powertrain: Powertrain; regeneration: boolean; fuelCut: boolean; atmosphere: number;
  driving: boolean; speed: number; throttle: number; shifting: boolean; impact: number; scrape: number; mass: number; motorcycle: boolean;
  rain: number; shelter: number; cockpit: boolean; signal: boolean; wiper: number; walkingSpeed: number;
  rpm: number; shifts: number; exposure: number; wet: number; nature: boolean; night: number;
  horn: boolean; vehicle: VehicleKind; trafficHorns: readonly HornSound[]; fan: number; washer: number; motor: boolean;
  supercar: boolean; braking: boolean; operations: number; service: number;
  ignition: 'off' | 'starting' | 'running'; nearbyEngines: readonly EngineSound[]; tireSlip: number;
  nearbyImpact?: number;
}
const chords = [[130.81, 164.81, 196, 293.66], [87.31, 130.81, 174.61, 261.63], [110, 164.81, 220, 329.63], [98, 146.83, 196, 293.66]];
const progressions = [[0, 1, 2, 3], [2, 3, 0, 1], [0, 2, 1, 3], [1, 3, 2, 0]];
const melodyNotes = [0, 2, 1, 3, 2, 1, 0, 3, 1, 2, 3, 2, 0, 1, 2, 0];
export const audioChannels = [
  ['master', 'masterVolume', '总音量'], ['sfx', 'sfxVolume', '全部音效'], ['music', 'musicVolume', '背景音乐'],
  ['engine', 'engineVolume', '发动机 / 电机与换挡'], ['tire', 'tireVolume', '轮胎与路面'], ['nature', 'natureVolume', '山野环境'],
  ['weather', 'weatherVolume', '风声与雨声'], ['cabin', 'cabinVolume', '车内设备'], ['effects', 'effectsVolume', '提示、倒车与脚步'],
  ['horn', 'hornVolume', '本车喇叭'], ['npc-horn', 'npcHornVolume', 'NPC 喇叭'],
  ['nearby-engine', 'nearbyEngineVolume', 'NPC / 车外发动机'],
  ['collision', 'collisionVolume', '碰撞与护栏擦碰'],
  ['exhaust', 'exhaustVolume', '排气低频与谐波'], ['shift', 'shiftVolume', '换挡机械声'], ['turbo', 'turboVolume', '重车涡轮声'],
  ['music-bass', 'bassVolume', '音乐低音层'], ['music-melody', 'melodyVolume', '音乐旋律层'],
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
  hornVolume = 2;
  npcHornVolume = 1.6;
  hornFocus = 0.7;
  cabinIsolation = 0.78;
  exhaustVolume = 1;
  shiftVolume = 1;
  turboVolume = 1;
  bassVolume = 1;
  melodyVolume = 1;
  nearbyEngineVolume = 1;
  collisionVolume = 0.65;
  musicDucking = 0.35;
  musicStyle: MusicStyle = 'ambient';
  musicPace = 1;
  resumeFade = 0.12;
  testVolume = 0.2;
  musicRecovery = 0.55;
  limiterRelease = 0.18;
  onDiagnostic?: (level: 'info' | 'warn' | 'error', message: string) => void;
  station = 1;
  error = '';
  private context?: AudioContext;
  private master?: GainNode;
  private limiter?: DynamicsCompressorNode;
  private testGain?: GainNode;
  private testPan?: StereoPannerNode;
  private testRequested = false;
  private testUntil = 0;
  private transitionTimer?: ReturnType<typeof setTimeout>;
  private sfx?: GainNode;
  private music?: GainNode;
  private program?: GainNode;
  private engine?: OscillatorNode;
  private engineGain?: GainNode;
  private windGain?: GainNode;
  private rainGain?: GainNode;
  private wiperGain?: GainNode;
  private clickGain?: GainNode;
  private stepGain?: GainNode;
  private tireGain?: GainNode;
  private skidGain?: GainNode;
  private skidTone?: OscillatorNode;
  private cabinGain?: GainNode;
  private playerHorn?: HornVoice;
  private readonly npcHorns: { id?: string; voice: HornVoice }[] = [];
  private readonly nearbyEngines: { id?: string; voice: EngineVoice }[] = [];
  private shiftGain?: GainNode;
  private natureGain?: GainNode;
  private harmonic?: OscillatorNode;
  private bird?: OscillatorNode;
  private melody?: OscillatorNode;
  private melodyGain?: GainNode;
  private engineFilter?: BiquadFilterNode;
  private harmonicGain?: GainNode;
  private pneumaticGain?: GainNode;
  private reverseGain?: GainNode;
  private bass?: OscillatorNode;
  private bassGain?: GainNode;
  private rhythmGain?: GainNode;
  private turboGain?: GainNode;
  private serviceGain?: GainNode;
  private subEngine?: OscillatorNode;
  private subEngineGain?: GainNode;
  private impactGain?: GainNode;
  private scrapeGain?: GainNode;
  private load = 0;
  private musicDuck = 1;
  private ambienceDuck = 1;
  private readonly pads: GainNode[] = [];
  private retuneAt?: number;
  private lastBrake = false;
  private lastOperation = 0;
  private lastShift = 0;
  private previewUntil = 0;
  private previewRequested = false;
  private previewKind = '';
  private readonly voices: OscillatorNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private active = true;
  private transitioning = false;
  private activationBlocked = false;
  private disposed = false;
  private time = 0;
  private musicTime = 0;
  private chord = -1;
  private step = 0;
  private lastSignal = false;
  private lastWiper = 0;
  private audible = false;
  private targets = new WeakMap<AudioParam, number>();

  get state(): string { return this.error ? 'unavailable' : this.context?.state ?? 'locked'; }
  get awaitingActivation(): boolean { return this.enabled && !this.error && (!this.context || this.activationBlocked); }
  get testing(): boolean { return this.testRequested || this.testUntil > (this.context?.currentTime ?? 0); }
  get musicPlaying(): boolean {
    return this.audible && !this.disposed && this.state === 'running' && this.masterVolume > 0 && this.musicVolume > 0;
  }
  get previewing(): boolean {
    return (this.previewRequested || this.previewUntil > (this.context?.currentTime ?? 0) && this.state === 'running') && this.enabled && this.active && !this.disposed && !this.error
      && this.sfxVolume > 0 && this.masterVolume > 0
      && (this.previewKind === 'horn' ? this.hornVolume : this.engineVolume * (this.previewKind === 'shift' ? this.shiftVolume : 1)) > 0;
  }

  tune(channel: number): void {
    if (!Number.isInteger(channel) || channel < 1 || channel > radioStations.length) return;
    const station = radioStations[channel - 1];
    this.station = channel; this.musicStyle = station.style; this.musicPace = station.pace;
    this.fadeProgram();
  }

  setStyle(style: MusicStyle): void {
    if (style === this.musicStyle) return;
    this.musicStyle = style; this.fadeProgram();
  }

  private fadeProgram(): void {
    const now = this.context?.currentTime ?? 0, fading = this.audible && this.state === 'running';
    this.retuneAt = now + (fading ? 0.12 : 0);
    if (this.program) {
      const level = this.program.gain.value;
      this.program.gain.cancelScheduledValues(now);
      this.program.gain.setValueAtTime(fading ? level : 0, now);
      this.program.gain.linearRampToValueAtTime(0, this.retuneAt);
    }
  }

  toggle(): void {
    if (this.disposed) return;
    this.enabled = !this.enabled;
    if (this.enabled) { this.error = ''; this.unlock(); }
    this.sync();
  }

  unlock(): void {
    if (this.disposed || !this.enabled || this.context && !this.activationBlocked) return;
    if (typeof navigator !== 'undefined' && navigator.userActivation?.isActive === false) return;
    this.activationBlocked = false;
    if (!this.context && !this.openContext()) return;
    this.sync();
  }

  recover(): void {
    if (this.disposed) return;
    this.releaseContext(); this.enabled = true; this.error = '';
    if (this.masterVolume <= 0) this.masterVolume = 0.85;
    if (this.sfxVolume <= 0) this.sfxVolume = 0.8;
    if (this.musicVolume <= 0) this.musicVolume = 0.3;
    this.onDiagnostic?.('info', 'User requested audio recovery; muted main buses restored.');
    this.unlock();
  }

  testSound(): boolean {
    if (this.disposed || !this.active || this.masterVolume <= 0 || this.testVolume <= 0) return false;
    this.enabled = true;
    this.unlock();
    if (!this.context || this.activationBlocked) return false;
    this.stopTest(); this.testRequested = true; this.sync(); return !this.error;
  }

  private openContext(): boolean {
    this.error = '';
    try { this.create(); this.onDiagnostic?.('info', 'Audio graph created.'); return true; }
    catch (error) { this.fail('当前浏览器无法开启音频，仍可继续探索。', error); return false; }
  }

  private fail(message: string, error?: unknown): void {
    this.error = message; this.enabled = false;
    this.releaseContext();
    this.onDiagnostic?.('error', `${message} ${error instanceof Error ? error.message : String(error ?? '')}`);
  }

  private stopTest(): void {
    this.testRequested = false; this.testUntil = 0;
    if (!this.testGain || !this.context) return;
    this.testGain.gain.cancelScheduledValues(this.context.currentTime);
    this.testGain.gain.setValueAtTime(0, this.context.currentTime);
  }

  private startTest(): void {
    if (!this.testRequested || this.context?.state !== 'running') return;
    const now = this.context.currentTime, level = Math.min(0.5, Math.max(0, this.testVolume));
    this.testRequested = false; this.testUntil = now + 2.1;
    this.testPan!.pan.cancelScheduledValues(now);
    for (let i = 0; i < 3; i++) {
      const start = now + 0.12 + i * 0.65;
      this.testPan!.pan.setValueAtTime(i - 1, start);
      this.testGain!.gain.setValueAtTime(0, start);
      this.testGain!.gain.linearRampToValueAtTime(level, start + 0.04);
      this.testGain!.gain.linearRampToValueAtTime(0, start + 0.42);
    }
    this.onDiagnostic?.('info', 'Left / center / right test scheduled on the master bus.');
  }

  setActive(active: boolean): void { this.active = active; this.sync(); }

  private sync(): void {
    const context = this.context;
    if (!context || this.disposed || this.error) return;
    if (context.state === 'closed') { this.fail('音频设备已关闭，请点击强制开启声音重建。'); return; }
    const now = context.currentTime;
    if (!this.previewing) { this.previewRequested = false; this.previewUntil = 0; }
    if (!this.enabled || !this.active || this.masterVolume <= 0 || this.testVolume <= 0) this.stopTest();
    const audible = this.enabled && this.active && this.masterVolume > 0 && (this.sfxVolume > 0 || this.musicVolume > 0 || this.testing);
    if (this.audible !== audible) {
      this.audible = audible;
      this.master!.gain.cancelScheduledValues(now); this.master!.gain.setValueAtTime(0, now); this.targets.delete(this.master!.gain);
      if (!audible) {
        this.previewUntil = 0;
        if (this.retuneAt !== undefined) {
          this.retuneAt = now;
          this.program!.gain.cancelScheduledValues(now); this.program!.gain.setValueAtTime(0, now);
        }
        this.playerHorn?.mute(); this.npcHorns.forEach(slot => { slot.voice.mute(); slot.id = undefined; });
        this.nearbyEngines.forEach(slot => { slot.voice.mute(); slot.id = undefined; });
        for (const channel of [this.engineGain, this.wiperGain, this.clickGain, this.stepGain, this.shiftGain, this.cabinGain, this.pneumaticGain, this.reverseGain, this.turboGain, this.serviceGain, this.tireGain, this.skidGain, this.impactGain, this.scrapeGain]) {
          channel!.gain.cancelScheduledValues(now); channel!.gain.setValueAtTime(0, now); this.targets.delete(channel!.gain);
        }
      }
    }
    for (const [parameter, value] of [[this.sfx!.gain, this.sfxVolume], [this.music!.gain, this.musicVolume], [this.master!.gain, audible ? this.masterVolume * 0.7 : 0]] as const) {
      if (this.targets.get(parameter) === value) continue;
      this.targets.set(parameter, value);
      if ((context.state !== 'running' && parameter !== this.master!.gain) || value === 0) { parameter.cancelScheduledValues(now); parameter.setValueAtTime(value, now); }
      else parameter.setTargetAtTime(value, now, parameter === this.master!.gain ? Math.max(0.01, this.resumeFade / 3) : 0.08);
    }
    this.limiter!.release.value = Math.max(0.05, Math.min(1, this.limiterRelease));
    this.startTest();
    if (this.previewRequested && this.previewKind === 'shift' && context.state === 'running') {
      this.previewRequested = false; this.previewUntil = now + 1.2;
      this.pulse(this.shiftGain!, 0.13 * this.engineVolume * this.shiftVolume, 0.045);
    }
    if (this.transitioning || audible && this.activationBlocked || context.state === (audible ? 'running' : 'suspended')) return;
    this.transitioning = true;
    const previous = context.state;
    this.transitionTimer = setTimeout(() => {
      if (this.context === context) this.fail('音频设备响应超时，请点击强制开启声音重试。');
    }, 4000);
    const failed = (error: unknown) => {
      if (this.context !== context || this.disposed) return;
      if (error instanceof Error && error.name === 'NotAllowedError') {
        clearTimeout(this.transitionTimer); this.transitioning = false; this.activationBlocked = true; this.stopTest();
        this.previewRequested = false; this.previewUntil = 0;
        this.onDiagnostic?.('warn', 'Audio is waiting for a page click or key press.');
      } else this.fail('音频恢复失败，请点击强制开启声音重试。', error);
    };
    try { void (audible ? context.resume() : context.suspend()).then(() => {
      if (this.context !== context || this.disposed) return;
      clearTimeout(this.transitionTimer);
      this.transitioning = false;
      if (context.state === previous) { failed('Audio context state did not change.'); return; }
      this.onDiagnostic?.('info', `Audio context ${context.state}.`);
      this.sync();
    }, failed); } catch (error) { failed(error); }
  }

  private create(): void {
    const context = this.context = new AudioContext();
    const gain = (target: AudioNode, value = 0) => { const node = context.createGain(); node.gain.value = value; node.connect(target); return node; };
    const limiter = this.limiter = context.createDynamicsCompressor();
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
    this.playerHorn = new HornVoice(context, this.sfx);
    for (let i = 0; i < 4; i++) this.npcHorns.push({ voice: new HornVoice(context, this.sfx) });
    this.natureGain = gain(this.sfx);
    const oscillator = (type: OscillatorType, target: AudioNode) => {
      const node = context.createOscillator(); node.type = type; node.connect(target); node.start(); this.sources.push(node); return node;
    };
    this.harmonicGain = gain(filter, 0.16); this.harmonic = oscillator('sawtooth', this.harmonicGain);
    this.bird = oscillator('sine', this.natureGain);
    this.program = gain(this.music, this.retuneAt === undefined ? 1 : 0);
    this.melodyGain = gain(this.program); this.melody = oscillator('sine', this.melodyGain);
    for (let i = 0; i < 4; i++) {
      const voice = context.createOscillator(); voice.type = 'sine'; voice.frequency.value = chords[0][i];
      const pad = gain(this.program, 0.06); this.pads.push(pad);
      voice.connect(pad); voice.start(); this.sources.push(voice); this.voices.push(voice);
    }
    this.pneumaticGain = noiseChannel(1300, 'bandpass');
    this.reverseGain = gain(this.sfx); const reverse = oscillator('sine', this.reverseGain); reverse.frequency.value = 880;
    this.bassGain = gain(this.program); this.bass = oscillator('sine', this.bassGain);
    const rhythm = context.createBiquadFilter(); rhythm.type = 'highpass'; rhythm.frequency.value = 2800;
    this.rhythmGain = gain(this.program); noiseSource.connect(rhythm); rhythm.connect(this.rhythmGain);
    this.turboGain = noiseChannel(1600, 'bandpass'); this.serviceGain = noiseChannel(150, 'lowpass');
    this.subEngineGain = gain(filter); this.subEngine = oscillator('sine', this.subEngineGain);
    this.skidGain = noiseChannel(1250, 'bandpass'); this.skidTone = oscillator('triangle', this.skidGain);
    for (let i = 0; i < 6; i++) this.nearbyEngines.push({ voice: new EngineVoice(context, this.sfx, noiseSource) });
    this.impactGain = noiseChannel(160, 'lowpass'); this.scrapeGain = noiseChannel(1150, 'bandpass');
    this.testPan = context.createStereoPanner(); this.testPan.connect(this.master);
    this.testGain = gain(this.testPan);
    const test = oscillator('sine', this.testGain); test.frequency.value = 660;
  }

  update(dt: number, state: SoundState): void {
    this.sync();
    const context = this.context;
    if (!context || context.state !== 'running' || !this.audible || this.disposed) {
      this.lastSignal = state.signal; this.lastWiper = state.wiper; this.lastShift = state.shifts;
      this.lastBrake = state.braking; this.lastOperation = state.operations; return;
    }
    const now = context.currentTime;
    const set = (parameter: AudioParam, value: number, smooth = 0.08) => {
      if (this.targets.get(parameter) === value) return;
      this.targets.set(parameter, value); parameter.setTargetAtTime(value, now, smooth);
    };
    if (this.previewRequested) { this.previewRequested = false; this.previewUntil = now + 1.2; }
    const preview = this.previewing;
    const speed = Math.min(110, Math.abs(state.speed));
    const motorSpeed = preview && this.previewKind === 'engine' ? 6 + Math.sin(this.time * 3) * 5 : speed;
    const cabin = state.cockpit ? 1 - Math.max(0, Math.min(1, this.cabinIsolation)) * (1 - state.exposure) : 1;
    const rpm = preview && this.previewKind === 'engine' ? 2200 + Math.sin(this.time * 4) * 700 : state.rpm;
    const demand = preview && this.previewKind === 'engine' ? 0.5 + Math.sin(this.time * 2) * 0.5 : state.driving ? Math.max(0, Math.min(1, state.throttle)) : 0;
    this.load += (demand - this.load) * (1 - Math.exp(-Math.max(0, dt) * 8));
    const sounding = (state.horn || preview && this.previewKind === 'horn') && this.hornVolume > 0;
    const nearbyHorn = state.trafficHorns.some(horn => horn.volume * this.npcHornVolume * state.atmosphere > 0.1);
    const priority = this.sfxVolume > 0 ? (sounding ? 1 : nearbyHorn ? 0.6 : 0) * Math.max(0, Math.min(1, this.hornFocus)) : 0;
    const engineDemand = this.engineVolume > 0 && state.ignition !== 'off' ? this.load : 0;
    const impactDemand = this.collisionVolume > 0 ? Math.max(0, Math.min(1, state.impact / 8)) : 0;
    const duck = Math.min(1 - priority * 0.95, 1 - Math.max(0, Math.min(0.8, this.musicDucking))
      * (state.driving && this.sfxVolume > 0 ? Math.max(engineDemand, impactDemand) : 0));
    this.ambienceDuck += (1 - priority * 0.65 - this.ambienceDuck) * (1 - Math.exp(-Math.max(0, dt) * (priority ? 15 : 3)));
    this.musicDuck += (duck - this.musicDuck) * (1 - Math.exp(-Math.max(0, dt) * (duck < this.musicDuck ? 8 : 1 / Math.max(0.1, this.musicRecovery))));
    const ev = state.powertrain === 'ev';
    this.engine!.type = ev ? 'sine' : 'triangle';
    const frequency = ev ? 140 + motorSpeed * 22 + (state.regeneration ? 90 : 0) : Math.max(20, rpm / 60 * (state.supercar ? 3.2 : state.motorcycle ? 1.4 : state.mass > 4000 ? 2 : 2.5));
    set(this.engine!.frequency, frequency, 0.025); set(this.harmonic!.frequency, frequency * 2.01, 0.025);
    set(this.subEngine!.frequency, frequency * 0.5 * (1 + Math.sin(this.time * 17) * 0.003), 0.03);
    const exhaust = this.exhaustVolume * (state.fuelCut && !preview ? 0.25 : 1);
    set(this.subEngineGain!.gain, (ev ? 0 : state.mass > 4000 ? 0.17 : state.supercar ? 0.09 : 0.055) * (0.7 + this.load * 0.3) * exhaust);
    set(this.turboGain!.gain, state.driving && state.ignition === 'running' && !ev && state.mass > 4000 ? this.load * Math.max(0, rpm - 1000) / 2800 * 0.05 * this.engineVolume * this.turboVolume : 0, 0.15);
    set(this.serviceGain!.gain, Math.max(0, Math.min(1, state.service)) * 0.025 * cabin * this.natureVolume * this.ambienceDuck, 0.4);
    set(this.harmonicGain!.gain, ev ? 0.025 : (state.supercar ? 0.2 : state.mass > 4000 ? 0.17 : 0.1) * (0.45 + this.load * 0.8) * exhaust);
    set(this.engineFilter!.frequency, (ev ? 3200 : state.supercar ? 700 : state.mass > 4000 ? 260 : 350) + 180 + this.load * 900 + state.exposure * 450);
    const running = (0.045 + Math.min(rpm, 10000) * 0.000003 + this.load * 0.085) * (state.shifting ? 0.42 : 1);
    const cranking = ev ? state.ignition === 'starting' ? 0.016 : motorSpeed < 0.1 ? 0 : 0.02 + Math.min(motorSpeed, 35) * 0.0008 + Math.max(this.load, Number(state.regeneration)) * 0.025 : state.ignition === 'starting' ? 0.025 + Math.max(0, Math.sin(this.time * 34)) * 0.055 : running;
    set(this.engineGain!.gain, (state.driving && state.ignition !== 'off' || preview && this.previewKind === 'engine' ? cranking : 0) * this.engineVolume, 0.025);
    set(this.windGain!.gain, (0.045 + speed * 0.004) * state.atmosphere * cabin * (1 - state.shelter) * this.weatherVolume * this.ambienceDuck);
    set(this.rainGain!.gain, state.rain * 0.17 * (0.35 + cabin * 0.65) * (1 - state.shelter) * this.weatherVolume * this.ambienceDuck);
    set(this.tireGain!.gain, Math.min(0.15, speed * 0.004) * (1 + state.wet * 0.65) * (0.55 + cabin * 0.45) * this.tireVolume * this.ambienceDuck);
    const slide = state.driving ? Math.max(0, Math.min(1, state.tireSlip) - 0.08) : 0;
    set(this.skidTone!.frequency, (state.mass > 4000 ? 480 : state.motorcycle ? 850 : 650) + slide * 240);
    set(this.skidGain!.gain, slide * 0.07 * (1 - state.wet * 0.55) * (0.4 + cabin * 0.6) * this.tireVolume, 0.06);
    const impact = Math.max(state.driving ? state.impact : 0, (state.nearbyImpact ?? 0) * state.atmosphere);
    set(this.impactGain!.gain, Math.min(1, Math.max(0, impact) / 18) * 0.25 * this.collisionVolume * (0.5 + cabin * 0.5), 0.012);
    set(this.scrapeGain!.gain, state.driving ? Math.min(1, Math.max(0, state.scrape) / 25) * 0.07 * this.collisionVolume * (0.35 + cabin * 0.65) : 0, 0.06);
    set(this.wiperGain!.gain, state.driving && dt > 0 ? Math.min(0.07, Math.abs(state.wiper - this.lastWiper) / dt * 0.045) * this.cabinVolume : 0, 0.025);
    set(this.cabinGain!.gain, state.driving ? (state.fan * 0.009 + state.washer * 0.045 + Number(state.motor) * 0.022) * this.cabinVolume : 0);
    this.playerHorn!.update(state.vehicle, sounding ? 0.65 * this.hornVolume * (state.cockpit ? 0.85 + state.exposure * 0.15 : 1) : 0);
    const horns = state.trafficHorns.slice(0, 4), ids = new Set(horns.map(horn => horn.id));
    for (const slot of this.npcHorns) if (!slot.id || !ids.has(slot.id)) {
      slot.id = undefined; slot.voice.update(state.vehicle, 0);
    }
    for (const horn of horns) {
      const slot = this.npcHorns.find(slot => slot.id === horn.id) ?? this.npcHorns.find(slot => !slot.id)!;
      slot.id = horn.id;
      slot.voice.update(horn.kind, 0.65 * this.npcHornVolume * horn.volume * state.atmosphere
        * (0.2 + cabin * 0.8) / Math.sqrt(Math.max(1, horns.length)), horn.pan);
    }
    const engines = [...state.nearbyEngines].sort((a, b) => b.volume - a.volume).slice(0, 6), engineIds = new Set(engines.map(s => s.id));
    const mix = Math.sqrt(Math.max(1, engines.reduce((sum, sound) => sum + sound.volume, 0)));
    for (const slot of this.nearbyEngines) if (!slot.id || !engineIds.has(slot.id)) { slot.id = undefined; slot.voice.update(undefined); }
    for (const sound of engines) {
      const slot = this.nearbyEngines.find(s => s.id === sound.id) ?? this.nearbyEngines.find(s => !s.id)!;
      slot.id = sound.id;
      const loudness = sound.powertrain === 'ev' ? 0.035 + Math.min(sound.speed, 35) * 0.001 : sound.starting ? 0.075
        : 0.09 + Math.min(sound.rpm, 10000) * 0.000005 + sound.load * 0.13;
      slot.voice.update(sound, loudness * (sound.shifting ? 0.5 : 1) * sound.volume * this.nearbyEngineVolume * state.atmosphere * cabin * this.ambienceDuck / mix, cabin);
    }
    set(this.reverseGain!.gain, state.driving && state.mass > 4000 && state.speed < -0.4 && this.time % 0.9 < 0.35 ? 0.035 * this.effectsVolume * (0.4 + cabin * 0.6) : 0, 0.015);
    if (state.driving && (this.lastBrake && !state.braking && state.mass > 4000 || state.operations > this.lastOperation))
      this.pulse(this.pneumaticGain!, 0.09 * this.cabinVolume, 0.12);
    this.lastBrake = state.braking; this.lastOperation = state.operations;
    const chirp = this.time % (state.night > 0.5 ? 1.4 : 8.7);
    set(this.bird!.frequency, state.night > 0.5 ? 3200 : 1700 + Math.sin(chirp * 19) * 650);
    set(this.natureGain!.gain, state.nature && state.rain < 0.3 && chirp < 0.55 ? 0.035 * Math.sin(chirp / 0.55 * Math.PI) ** 2 * cabin * (1 - state.shelter) * this.natureVolume * this.ambienceDuck : 0, 0.015);
    if (state.driving && state.ignition === 'running' && !ev && state.shifts > this.lastShift && this.shiftVolume > 0) this.pulse(this.shiftGain!, 0.13 * this.engineVolume * this.shiftVolume, 0.045);
    this.lastShift = state.shifts;
    if (state.driving && state.signal !== this.lastSignal) {
      this.pulse(this.clickGain!, 0.075 * this.effectsVolume, 0.018);
    }
    this.step += state.walkingSpeed * dt;
    if (this.step > 1.6) {
      this.step %= 1.6;
      this.pulse(this.stepGain!, 0.22 * this.effectsVolume, 0.025);
    }
    for (const [channel, volume] of [[this.shiftGain!, this.engineVolume * this.shiftVolume], [this.pneumaticGain!, this.cabinVolume],
      [this.clickGain!, this.effectsVolume], [this.stepGain!, this.effectsVolume]] as const) {
      if (volume > 0 || this.targets.get(channel.gain) === 0) continue;
      const level = channel.gain.value;
      channel.gain.cancelScheduledValues(now); channel.gain.setValueAtTime(level, now);
      channel.gain.linearRampToValueAtTime(0, now + 0.008); this.targets.set(channel.gain, 0);
    }
    this.lastSignal = state.signal; this.lastWiper = state.wiper;
    this.time += dt;
    if (this.retuneAt !== undefined && now < this.retuneAt) return;
    const retuned = this.retuneAt !== undefined;
    if (retuned) {
      this.retuneAt = undefined; this.musicTime = 0;
      this.program!.gain.cancelScheduledValues(now); this.program!.gain.setValueAtTime(0, now);
      this.program!.gain.setTargetAtTime(1, now, 0.16);
    }
    const musicSet = (parameter: AudioParam, value: number, smooth: number) => {
      if (!retuned) { set(parameter, value, smooth); return; }
      this.targets.set(parameter, value); parameter.cancelScheduledValues(now); parameter.setValueAtTime(value, now);
    };
    this.musicTime += dt * this.musicPace;
    const station = radioStations[this.station - 1];
    const chord = progressions[(this.station - 1) % progressions.length][Math.floor(this.musicTime / 12) % 4];
    const musicLevel = this.musicDuck;
    const transpose = station.pitch * (this.musicStyle === 'night' ? 0.75 : this.musicStyle === 'motion' ? 1.12246 : 1);
    this.melody!.type = station.wave;
    this.chord = chord; this.voices.forEach((voice, i) => {
      musicSet(voice.frequency, chords[chord][i] * transpose, 0.6);
      musicSet(this.pads[i].gain, musicLevel * (0.045 + 0.012 * Math.sin(this.musicTime * 0.22 + i)), 0.4);
    });
    const beat = this.musicTime % (this.musicStyle === 'motion' ? 0.6 : 1.2), note = melodyNotes[(Math.floor(this.musicTime / (this.musicStyle === 'motion' ? 0.6 : 1.2)) + this.station * 3) % melodyNotes.length];
    musicSet(this.melody!.frequency, chords[this.chord][note] * 2 * transpose, 0.025);
    const phrase = Math.floor(this.musicTime / 4.8) % 4;
    musicSet(this.melodyGain!.gain, this.melodyVolume * musicLevel * (phrase === 3 ? 0.3 : 1) * (this.musicStyle === 'night' ? 0.025 : 0.045) * Math.exp(-beat * 5), 0.04);
    musicSet(this.bass!.frequency, chords[chord][phrase % 2 ? 2 : 0] * transpose / 2, 0.16);
    musicSet(this.bassGain!.gain, this.bassVolume * musicLevel * (this.musicStyle === 'motion' ? 0.07 : 0.035) * (0.7 + 0.3 * Math.exp(-beat * 3)), 0.08);
    musicSet(this.rhythmGain!.gain, this.musicStyle === 'motion' ? musicLevel * 0.014 * Math.exp(-(this.musicTime % 0.3) * 45) : 0, 0.012);
  }

  preview(kind: 'engine' | 'shift' | 'horn'): boolean {
    this.previewUntil = 0; this.previewRequested = false;
    if (this.disposed || !this.active || this.error || this.sfxVolume <= 0 || this.masterVolume <= 0
      || (kind === 'horn' ? this.hornVolume : this.engineVolume * (kind === 'shift' ? this.shiftVolume : 1)) <= 0) return false;
    this.enabled = true; this.unlock();
    if (!this.context || this.activationBlocked) return false;
    this.previewRequested = true; this.previewKind = kind; this.sync();
    return !this.error;
  }

  private pulse(channel: GainNode, level: number, decay: number): void {
    const now = this.context!.currentTime;
    this.targets.delete(channel.gain);
    const current = channel.gain.value;
    channel.gain.cancelScheduledValues(now); channel.gain.setValueAtTime(current, now);
    channel.gain.linearRampToValueAtTime(level, now + 0.004); channel.gain.setTargetAtTime(0, now + 0.004, decay);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.releaseContext();
  }

  private releaseContext(): void {
    clearTimeout(this.transitionTimer); this.transitioning = false; this.activationBlocked = false; this.stopTest();
    this.audible = false; this.previewUntil = 0; this.previewRequested = false;
    this.playerHorn?.dispose(); this.npcHorns.forEach(slot => slot.voice.dispose()); this.npcHorns.length = 0;
    this.nearbyEngines.forEach(slot => slot.voice.dispose()); this.nearbyEngines.length = 0;
    this.playerHorn = undefined;
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    this.sources.length = this.voices.length = this.pads.length = 0;
    this.master?.disconnect(); this.master = undefined;
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = undefined; this.testGain = undefined; this.testPan = undefined;
    this.targets = new WeakMap(); this.retuneAt = undefined;
    this.musicTime = this.time = this.load = 0; this.musicDuck = this.ambienceDuck = 1;
  }
}
