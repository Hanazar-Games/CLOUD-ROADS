import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { World } from '../world/World';
import type { AudioSystem } from '../audio/AudioSystem';
import type { createAircraftFlight } from './aircraft-flight.js';
import { mountAviation } from './aviation.js';
import { AudioEngine } from './audio.js';
import { FlightHorizon } from './FlightHorizon';
import { airportHeight, navigateAirport } from './airport.js';

type Flight = ReturnType<typeof createAircraftFlight>;
interface Environment { viewDistance: number; detailDistance: number; groundDetail: string; cloudSteps: number }
interface AviationHost {
  scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer; world: World; audio: AudioSystem;
  resize(width: number, height: number): void;
  render(dt: number, running: boolean, distance: number, overview: boolean, cloudSteps: number): void;
  onExit(): void;
  departure?: { aircraft: string; airport: string; apron: boolean };
}

export function createAviationSession(host: AviationHost) {
  const { world, audio } = host, horizon = new FlightHorizon(host.scene, world);
  const sound = new AudioEngine(); sound.enabled = audio.enabled; sound.masterVolume = audio.masterVolume;
  sound.setVolume('music', audio.musicVolume); sound.setVolume('sfx', audio.sfxVolume);
  const saved = { radius: world.chunks.viewRadius, detail: world.detailDistance };
  let distance = 30000, cloudSteps = 12, highDetail = false, disposed = false, worldTime = .1;
  const unlock = () => { sound.setBackground(document.hidden || !document.hasFocus()); void sound.unlock(); };
  const session = mountAviation({
    audio: sound, unlockAudio: unlock, onToggleAudio: () => { sound.toggle(); unlock(); },
    host: {
      ...host,
      configureEnvironment(settings: Environment) {
        distance = settings.viewDistance;
        cloudSteps = settings.cloudSteps;
        highDetail = settings.groundDetail === 'high';
        world.chunks.setViewRadius(highDetail ? 8 : settings.groundDetail === 'balanced' ? 6 : 4);
        world.detailDistance = settings.detailDistance / 4500;
      },
      preflightStatus(flight: Flight) {
        const x = flight.airport.worldX + flight.x, z = flight.airport.worldZ + flight.z;
        const terrain = world.chunks.readyAt(x, z), distant = horizon.readyAt(x, z, distance);
        return { ...terrain, ready: terrain.ready && distant, distant, error: terrain.error || horizon.error };
      },
      updateWorld(flight: Flight, dt: number) {
        navigateAirport(flight, world.airports.sites);
        const x = flight.airport.worldX + flight.x, z = flight.airport.worldZ + flight.z;
        world.chunks.setFlightStreaming(flight.y - airportHeight(flight.x, flight.z, flight.airport), flight.speed, highDetail);
        worldTime += dt;
        const streamOnly = worldTime < .1;
        if (!streamOnly) worldTime = 0;
        world.update(host.camera, false, flight.heading, { x, y: flight.y, z }, streamOnly);
        horizon.update(x, z, distance);
      },
      renderWorld(dt: number, flight: Flight, cameraMode: number) {
        host.render(dt, flight.status === 'running', distance, cameraMode === 8, cloudSteps);
        horizon.confirmRendered();
      },
    },
    onExit() {
      if (disposed) return;
      disposed = true;
      audio.masterVolume = sound.masterVolume; audio.sfxVolume = sound.volumes.sfx; audio.musicVolume = sound.volumes.music;
      if (audio.enabled !== sound.enabled) audio.toggle();
      sound.dispose(); horizon.dispose();
      world.chunks.setFlightStreaming();
      world.chunks.setViewRadius(saved.radius); world.detailDistance = saved.detail;
      host.onExit();
    },
  });
  return {
    update(dt: number) { sound.setBackground(document.hidden || !document.hasFocus()); session.update(dt); },
    dispose: session.dispose,
  };
}
