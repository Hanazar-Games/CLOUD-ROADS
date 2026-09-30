import { vehicleProfiles, type VehicleKind, type VehicleProfile } from '../vehicle/VehicleConfig';
import { hashSeed } from '../world/WorldSeed';

export interface HornSound { id: string; kind: VehicleKind; volume: number; pan: number }
interface HornProfile { frequencies: number[]; wave: OscillatorType; blend: number; cutoff: number; attack: number }
const profiles = new Map<VehicleKind, HornProfile>();

export function hornProfile(kind: VehicleKind): HornProfile {
  const cached = profiles.get(kind); if (cached) return cached;
  const p: VehicleProfile = vehicleProfiles[kind];
  const air = p.mass > 7000, bike = p.shape === 'motorcycle';
  const base = bike ? 540 : p.shape === 'tractor' ? 125 : p.shape === 'crane' ? 140
    : p.bus ? 195 : air ? 160 : p.shape === 'truck' ? 295 : p.shape === 'supercar' ? 370 : p.shape === 'suv' ? 330 : 425;
  const pitch = 0.97 + (hashSeed(`${kind}:horn`) % 10007) / 10007 * 0.06;
  const profile = { frequencies: [base * pitch, base * pitch * (air ? 1.25 : bike ? 2 : 1.26)],
    wave: (air ? 'sawtooth' : 'square') as OscillatorType, blend: bike ? 0.08 : air ? 0.65 : 0.48,
    cutoff: air ? 1350 : bike ? 2400 : 1900, attack: air ? 0.045 : 0.012 };
  profiles.set(kind, profile); return profile;
}

export class HornVoice {
  readonly level: GainNode;
  readonly pan: StereoPannerNode;
  private readonly filter: BiquadFilterNode;
  private readonly tones: OscillatorNode[] = [];
  private readonly blends: GainNode[] = [];
  private kind?: VehicleKind;
  private volume = 0;
  private balance = 0;

  constructor(private readonly context: AudioContext, output: AudioNode) {
    this.level = context.createGain(); this.level.gain.value = 0;
    this.pan = context.createStereoPanner(); this.level.connect(this.pan); this.pan.connect(output);
    this.filter = context.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.Q.value = 0.65; this.filter.connect(this.level);
    for (let i = 0; i < 2; i++) {
      const blend = context.createGain(), tone = context.createOscillator();
      blend.gain.value = 0; tone.connect(blend); blend.connect(this.filter); tone.start();
      this.tones.push(tone); this.blends.push(blend);
    }
  }

  update(kind: VehicleKind, volume: number, pan = 0): void {
    const now = this.context.currentTime, profile = hornProfile(kind);
    if (kind !== this.kind) {
      this.kind = kind; this.filter.frequency.setTargetAtTime(profile.cutoff, now, 0.025);
      this.tones.forEach((tone, i) => {
        tone.type = profile.wave; tone.frequency.setTargetAtTime(profile.frequencies[i], now, 0.02);
        this.blends[i].gain.setTargetAtTime((i ? profile.blend : 1) / (1 + profile.blend), now, 0.012);
      });
    }
    volume = Number.isFinite(volume) ? Math.max(0, Math.min(1.8, volume)) : 0;
    pan = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
    if (volume !== this.volume) {
      this.volume = volume; this.level.gain.setTargetAtTime(volume, now, volume > 0 ? profile.attack : 0.02);
    }
    if (pan !== this.balance) { this.balance = pan; this.pan.pan.setTargetAtTime(pan, now, 0.045); }
  }

  mute(): void {
    this.volume = 0; this.level.gain.cancelScheduledValues(this.context.currentTime);
    this.level.gain.setValueAtTime(0, this.context.currentTime);
  }

  dispose(): void {
    this.mute();
    for (const tone of this.tones) { tone.stop(); tone.disconnect(); }
    for (const blend of this.blends) blend.disconnect();
    this.filter.disconnect(); this.level.disconnect(); this.pan.disconnect();
  }
}
