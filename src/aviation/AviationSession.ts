import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { World } from '../world/World';
import type { AudioSystem } from '../audio/AudioSystem';
import type { createAircraftFlight } from './aircraft-flight.js';
import { mountAviation } from './aviation.js';
import { AudioEngine } from './audio.js';
import { FlightHorizon } from './FlightHorizon';

type Flight = ReturnType<typeof createAircraftFlight>;
interface Environment { viewDistance: number; detailDistance: number; groundDetail: string }
interface AviationHost {
  scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer; world: World; audio: AudioSystem;
  resize(width: number, height: number): void;
  render(dt: number, running: boolean, distance: number): void;
  onExit(): void;
}

export function createAviationSession(host: AviationHost) {
  const { world, audio } = host, horizon = new FlightHorizon(host.scene, world);
  const sound = new AudioEngine(); sound.enabled = audio.enabled; sound.masterVolume = audio.masterVolume;
  sound.setVolume('music', audio.musicVolume); sound.setVolume('sfx', audio.sfxVolume);
  const saved = { radius: world.chunks.viewRadius, detail: world.detailDistance };
  let distance = 30000, disposed = false;
  const unlock = () => { sound.setBackground(document.hidden || !document.hasFocus()); void sound.unlock(); };
  const session = mountAviation({
    audio: sound, unlockAudio: unlock, onToggleAudio: () => { sound.toggle(); unlock(); },
    host: {
      ...host,
      configureEnvironment(settings: Environment) {
        distance = settings.viewDistance;
        const radius = settings.groundDetail === 'high' ? 12 : settings.groundDetail === 'balanced' ? 8 : 6;
        world.chunks.setViewRadius(Math.max(radius, settings.detailDistance > 8000 ? 12 : settings.detailDistance > 4000 ? 8 : 6));
        world.detailDistance = settings.detailDistance / 4500;
      },
      updateWorld(flight: Flight) {
        const x = flight.airport.worldX + flight.x, z = flight.airport.worldZ + flight.z;
        world.update(host.camera, false, flight.heading, { x, y: flight.y, z });
        horizon.update(x, z, distance);
      },
      renderWorld(dt: number, flight: Flight) { host.render(dt, flight.status === 'running', distance); },
    },
    onExit() {
      if (disposed) return;
      disposed = true;
      audio.masterVolume = sound.masterVolume; audio.sfxVolume = sound.volumes.sfx; audio.musicVolume = sound.volumes.music;
      if (audio.enabled !== sound.enabled) audio.toggle();
      sound.dispose(); horizon.dispose();
      world.chunks.setViewRadius(saved.radius); world.detailDistance = saved.detail;
      host.onExit();
    },
  });
  return {
    update(dt: number) { sound.setBackground(document.hidden || !document.hasFocus()); session.update(dt); },
    dispose: session.dispose,
  };
}
