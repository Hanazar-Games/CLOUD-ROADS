import { vehicleProfiles, type VehicleKind } from '../vehicle/VehicleConfig';
import type { VehiclePhysics } from '../vehicle/VehiclePhysics';
import type { Powertrain } from '../vehicle/Transmission';
import { hashSeed } from '../world/WorldSeed';

type Position = { x: number; y: number; z: number };
export interface EngineSound {
  id: string; kind: VehicleKind; powertrain: Powertrain; rpm: number; load: number; speed: number;
  shifting: boolean; fuelCut: boolean; starting: boolean; volume: number; pan: number;
}

export function engineSound(id: string, car: VehiclePhysics, listener: Position, right: Position): EngineSound | undefined {
  if (car.ignition === 'off' || car.powertrain === 'ev' && car.motionSpeed < 0.1 && car.ignition !== 'starting') return;
  const dx = car.x - listener.x, dy = car.y - listener.y, dz = car.z - listener.z, distance = Math.hypot(dx, dy, dz);
  if (distance >= 180) return;
  return { id, kind: car.kind, powertrain: car.powertrain, rpm: car.engineRpm, load: car.transmission.load,
    speed: car.motionSpeed, shifting: car.transmission.shifting, fuelCut: car.transmission.fuelCut, starting: car.ignition === 'starting',
    volume: (1 - distance / 180) / (1 + (distance / 22) ** 2),
    pan: Math.max(-1, Math.min(1, (dx * right.x + dy * right.y + dz * right.z) / Math.max(1, distance))) };
}

export class EngineVoice {
  readonly level: GainNode;
  readonly pan: StereoPannerNode;
  private readonly filter: BiquadFilterNode;
  private readonly tones: OscillatorNode[] = [];
  private readonly blends: GainNode[] = [];
  private readonly mechanical: GainNode;
  private readonly targets = new WeakMap<AudioParam, number>();

  constructor(private readonly context: AudioContext, output: AudioNode, private readonly noise: AudioNode) {
    this.level = context.createGain(); this.level.gain.value = 0;
    this.pan = context.createStereoPanner(); this.level.connect(this.pan); this.pan.connect(output);
    this.filter = context.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.Q.value = 0.65; this.filter.connect(this.level);
    this.mechanical = context.createGain(); this.mechanical.gain.value = 0; noise.connect(this.mechanical); this.mechanical.connect(this.filter);
    for (let i = 0; i < 3; i++) {
      const tone = context.createOscillator(), blend = context.createGain(); blend.gain.value = 0;
      tone.connect(blend); blend.connect(this.filter); tone.start(); this.tones.push(tone); this.blends.push(blend);
    }
  }

  private set(parameter: AudioParam, value: number, smoothing = 0.06): void {
    if (this.targets.get(parameter) === value) return;
    this.targets.set(parameter, value); parameter.setTargetAtTime(value, this.context.currentTime, smoothing);
  }

  update(sound: EngineSound | undefined, volume = 0, cabin = 1): void {
    this.set(this.level.gain, sound ? volume : 0, 0.04);
    if (!sound) return;
    const profile = vehicleProfiles[sound.kind], heavy = profile.mass > 4000, bike = profile.shape === 'motorcycle', sport = profile.shape === 'supercar';
    const ev = sound.powertrain === 'ev', load = Math.max(0, Math.min(1, sound.load));
    const variation = 0.96 + (hashSeed(`${sound.kind}:engine`) % 1009) / 1009 * 0.08;
    const frequency = (ev ? 140 + sound.speed * 22 : Math.max(18, sound.rpm / 60 * (bike ? 1 : sport ? 4 : heavy ? 3 : 2))) * variation;
    this.set(this.pan.pan, sound.pan);
    this.set(this.filter.frequency, (ev ? 2800 : heavy ? 520 : bike ? 1600 : sport ? 1300 : 900) * (0.6 + cabin * 0.4) + load * 1200);
    this.set(this.mechanical.gain, ev ? 0 : (heavy ? 0.18 : 0.06) * (0.4 + load * 0.6));
    for (let i = 0; i < this.tones.length; i++) {
      const tone = this.tones[i]; tone.type = ev || i === 2 ? 'sine' : i === 1 ? 'sawtooth' : 'triangle';
      this.set(tone.frequency, frequency * [1, 2.01, 0.5][i], 0.035);
      this.set(this.blends[i].gain, i === 0 ? 0.7 : i === 1 ? (ev ? 0.06 : (0.1 + load * 0.16) * (sound.fuelCut ? 0.25 : 1)) : ev ? 0 : heavy ? 0.28 : 0.12);
    }
  }

  mute(): void {
    this.level.gain.cancelScheduledValues(this.context.currentTime); this.level.gain.setValueAtTime(0, this.context.currentTime);
    this.targets.delete(this.level.gain);
  }
  dispose(): void {
    this.mute(); for (const tone of this.tones) { tone.stop(); tone.disconnect(); }
    for (const blend of this.blends) blend.disconnect();
    this.noise.disconnect(this.mechanical); this.mechanical.disconnect(); this.filter.disconnect(); this.level.disconnect(); this.pan.disconnect();
  }
}
