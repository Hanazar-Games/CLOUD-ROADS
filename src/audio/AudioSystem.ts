export interface SoundState {
  driving: boolean; speed: number; throttle: boolean; mass: number; motorcycle: boolean;
  rain: number; shelter: number; cockpit: boolean; signal: boolean; wiper: number; walkingSpeed: number;
}
const chords = [[130.81, 164.81, 196, 293.66], [87.31, 130.81, 174.61, 261.63], [110, 164.81, 220, 329.63], [98, 146.83, 196, 293.66]];

export class AudioSystem {
  enabled = false;
  sfxVolume = 0.6;
  musicVolume = 0.25;
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
    const audible = this.enabled && this.active && (this.sfxVolume > 0 || this.musicVolume > 0);
    if (this.audible !== audible) { this.audible = audible; this.master!.gain.setTargetAtTime(audible ? 0.7 : 0, context.currentTime, 0.02); }
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
    this.master = gain(context.destination);
    this.sfx = gain(this.master, this.sfxVolume); this.music = gain(this.master, this.musicVolume);
    this.engineGain = gain(this.sfx);
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 650; filter.Q.value = 0.5; filter.connect(this.engineGain);
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
    for (let i = 0; i < 4; i++) {
      const voice = context.createOscillator(); voice.type = 'sine'; voice.frequency.value = chords[0][i];
      voice.connect(gain(this.music, 0.085)); voice.start(); this.sources.push(voice); this.voices.push(voice);
    }
  }

  update(dt: number, state: SoundState): void {
    this.sync();
    const context = this.context;
    if (!context || context.state !== 'running' || !this.enabled || !this.active || this.disposed) { this.lastSignal = state.signal; this.lastWiper = state.wiper; return; }
    const now = context.currentTime;
    const set = (parameter: AudioParam, value: number, smooth = 0.08) => {
      if (this.targets.get(parameter) === value) return;
      this.targets.set(parameter, value); parameter.setTargetAtTime(value, now, smooth);
    };
    set(this.sfx!.gain, this.sfxVolume, this.sfxVolume ? 0.08 : 0.02); set(this.music!.gain, this.musicVolume, this.musicVolume ? 0.3 : 0.02);
    const speed = Math.min(75, Math.abs(state.speed)), cabin = state.cockpit ? 0.55 : 1;
    set(this.engine!.frequency, (state.motorcycle ? 70 : state.mass > 4000 ? 28 : 42) + speed * 2.4 + (state.throttle ? 24 : 0));
    set(this.engineGain!.gain, state.driving ? 0.045 + speed * 0.001 + (state.throttle ? 0.025 : 0) : 0);
    set(this.windGain!.gain, (0.03 + speed * 0.003) * cabin * (1 - state.shelter));
    set(this.rainGain!.gain, state.rain * 0.11 * cabin * (1 - state.shelter));
    set(this.wiperGain!.gain, state.driving && dt > 0 ? Math.min(0.06, Math.abs(state.wiper - this.lastWiper) / dt * 0.035) * cabin : 0, 0.025);
    if (state.driving && state.signal !== this.lastSignal) {
      this.clickGain!.gain.cancelScheduledValues(now); this.clickGain!.gain.setValueAtTime(0.06, now); this.clickGain!.gain.setTargetAtTime(0, now + 0.012, 0.009);
    }
    this.step += state.walkingSpeed * dt;
    if (this.step > 1.6) {
      this.step %= 1.6;
      this.stepGain!.gain.cancelScheduledValues(now); this.stepGain!.gain.setValueAtTime(0.2, now); this.stepGain!.gain.setTargetAtTime(0, now, 0.025);
    }
    this.lastSignal = state.signal; this.lastWiper = state.wiper;
    this.time += dt;
    const chord = Math.floor(this.time / 12) % chords.length;
    if (chord !== this.chord) { this.chord = chord; this.voices.forEach((voice, i) => set(voice.frequency, chords[chord][i], 0.6)); }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    this.master?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
  }
}
