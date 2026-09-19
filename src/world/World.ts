import { Vector3, type PerspectiveCamera, type Scene } from 'three';
import { HeightFunction } from '../terrain/HeightFunction';
import { TerrainWorkers } from '../terrain/TerrainWorkers';
import { ChunkManager } from './ChunkManager';
import { FloatingOrigin } from './FloatingOrigin';
import { RoadSpine } from '../road/RoadSpine';
import { RoadDebug } from '../road/RoadDebug';
import type { RoadSample } from '../road/RoadSegment';
import { RoadMesh } from '../road/RoadMesh';
import { RoadCorridor } from '../road/RoadCorridor';
import { BridgeDetector, type BridgeSpan } from '../bridge/BridgeDetector';
import { BridgeMesh } from '../bridge/BridgeMesh';
import { BiomeSystem, type BiomeSample } from '../biome/BiomeSystem';
import { DEFAULT_OPTIONS, type WorldOptions } from './WorldOptions';
import { roadProfile } from '../road/RoadProfile';
import { roadFrame } from '../road/RoadFrame';
import { TunnelDetector, type TunnelSpan } from '../tunnel/TunnelDetector';
import { TunnelMesh } from '../tunnel/TunnelMesh';
import { RoadFurniture } from '../road/RoadFurniture';

export interface GroundSample {
  height: number;
  normalY: number;
  biome: BiomeSample;
}

export class World {
  readonly origin = new FloatingOrigin();
  readonly chunks: ChunkManager;
  readonly height: HeightFunction;
  readonly road: RoadSpine;
  readonly roadDebug: RoadDebug;
  readonly roadMesh: RoadMesh;
  readonly bridgeMesh: BridgeMesh;
  readonly tunnelMesh: TunnelMesh;
  readonly furniture: RoadFurniture;
  tunnels: readonly TunnelSpan[] = [];
  shelter = 0;
  bridges: readonly BridgeSpan[] = [];
  private readonly bridgeDetector: BridgeDetector;
  private readonly tunnelDetector: TunnelDetector;
  private readonly biomes: BiomeSystem;
  roadSample: RoadSample | undefined;
  roadReady = false;
  private readonly forward = new Vector3();
  private corridor = new RoadCorridor([]);
  private corridorVersion = -1;

  constructor(scene: Scene, readonly seed: string, readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.height = new HeightFunction(seed, options.terrain);
    this.biomes = new BiomeSystem(seed, options.terrain);
    this.chunks = new ChunkManager(scene, seed, new TerrainWorkers(options));
    this.road = new RoadSpine(seed, this.height, options);
    this.roadDebug = new RoadDebug(scene);
    this.roadMesh = new RoadMesh(scene, options);
    this.bridgeDetector = new BridgeDetector(this.height, options);
    this.bridgeMesh = new BridgeMesh(scene, options);
    this.tunnelDetector = new TunnelDetector(this.height, options);
    this.tunnelMesh = new TunnelMesh(scene, seed, options);
    this.furniture = new RoadFurniture(scene, seed, options);
  }

  resetCamera(camera: PerspectiveCamera): void {
    this.origin.reset();
    this.chunks.setOrigin(0, 0);
    camera.position.set(128, this.height.sample(128, 128) + 450, 128);
  }

  update(camera: PerspectiveCamera): void {
    if (this.origin.rebase(camera.position)) this.chunks.setOrigin(this.origin.x, this.origin.z);
    camera.getWorldDirection(this.forward);
    const x = camera.position.x + this.origin.x, z = camera.position.z + this.origin.z;
    this.roadReady = this.road.update(z);
    if (this.roadReady && this.corridorVersion !== this.road.version) {
      this.bridges = this.bridgeDetector.detect(this.road.samples);
      this.tunnels = this.tunnelDetector.detect(this.road.samples, this.bridges);
      this.corridor = RoadCorridor.fromSamples(this.road.samples, this.bridges, this.options, this.tunnels);
      this.corridorVersion = this.road.version;
    }
    this.chunks.update(x, z, this.forward, this.roadReady ? this.corridor : null);
    this.roadSample = this.road.nearest(x, z);
    const nearRoute = !!this.roadSample && Math.hypot(this.roadSample.position.x - x, this.roadSample.position.z - z) < 3500;
    this.roadDebug.update(this.road, this.origin.x, this.origin.z, nearRoute);
    this.roadMesh.update(this.road, this.origin.x, this.origin.z, nearRoute);
    this.bridgeMesh.update(this.bridges, this.corridor, this.height, this.corridorVersion, this.origin.x, this.origin.z, nearRoute);
    this.tunnelMesh.update(this.tunnels, this.corridor, this.height, this.corridorVersion, this.origin.x, this.origin.z, nearRoute);
    this.furniture.update(this.road.samples, this.tunnels, this.bridges, this.corridorVersion, this.origin.x, this.origin.z, nearRoute);
    this.shelter = this.tunnelShelter(x, camera.position.y, z);
  }

  private tunnelShelter(x: number, y: number, z: number): number {
    const sample = this.roadSample;
    if (!sample) return 0;
    const span = this.tunnels.find(tunnel => sample.distance >= tunnel.start.distance && sample.distance <= tunnel.end.distance);
    if (!span) return 0;
    const { right, normal } = roadFrame(sample), dx = x - sample.position.x, dy = y - sample.position.y, dz = z - sample.position.z;
    const lateral = dx * right.x + dy * right.y + dz * right.z, height = dx * normal.x + dy * normal.y + dz * normal.z;
    const profile = roadProfile(this.options), offset = Math.min(...profile.centers.map(center => Math.abs(lateral - center)));
    if (offset > profile.halfWidth + 0.65 || height < -0.5 || height > 4.2 + 3.3 * Math.sqrt(1 - (offset / (profile.halfWidth + 0.75)) ** 2)) return 0;
    return Math.max(0, Math.min(1, (sample.distance - span.start.distance) / 8, (span.end.distance - sample.distance) / 8));
  }

  inspectTunnel(camera: PerspectiveCamera): { heading: number; pitch: number } | undefined {
    if (!this.roadReady) return undefined;
    const span = this.tunnels.find(tunnel => tunnel.start.distance > (this.roadSample?.distance ?? 0) + 50) ?? this.tunnels[0];
    if (!span) return undefined;
    const sample = this.road.samples.reduce((best, point) => Math.abs(point.distance - span.start.distance + 18) < Math.abs(best.distance - span.start.distance + 18) ? point : best);
    this.placeOnRoad(camera, sample, 3);
    return { heading: sample.heading, pitch: Math.atan(sample.grade) };
  }

  inspectLights(camera: PerspectiveCamera): { heading: number; pitch: number } | undefined {
    if (!this.roadReady) return undefined;
    const lamp = this.furniture.lampPositions.find(point => point.sample.distance > (this.roadSample?.distance ?? 0) + 100) ?? this.furniture.lampPositions[0];
    if (!lamp) return undefined;
    this.placeOnRoad(camera, lamp.sample, 3);
    return { heading: lamp.sample.heading, pitch: Math.atan(lamp.sample.grade) };
  }

  private placeOnRoad(camera: PerspectiveCamera, sample: RoadSample, height: number): void {
    const offset = roadProfile(this.options).centers.at(-1)!, { right, normal } = roadFrame(sample), p = sample.position;
    camera.position.set(p.x + right.x * offset + normal.x * height - this.origin.x,
      p.y + right.y * offset + normal.y * height, p.z + right.z * offset + normal.z * height - this.origin.z);
  }

  sampleGround(x: number, z: number): GroundSample {
    const height = (px: number, pz: number) => this.corridor.height(px, pz, this.height.sample(px, pz));
    const y = height(x, z);
    const normalY = 4 / Math.hypot(height(x - 2, z) - height(x + 2, z), 4, height(x, z - 2) - height(x, z + 2));
    return { height: y, normalY, biome: this.biomes.sample(x, z, y, normalY) };
  }

  inspectRoad(camera: PerspectiveCamera): number | undefined {
    if (!this.roadReady) return undefined;
    const sample = this.roadSample;
    if (!sample) return undefined;
    this.placeOnRoad(camera, sample, this.tunnels.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance) ? 3 : 25);
    return sample.heading;
  }

  inspectValley(camera: PerspectiveCamera, altitude: number): { heading: number; pitch: number } | undefined {
    if (!this.roadReady) return undefined;
    const startX = camera.position.x + this.origin.x, startZ = camera.position.z + this.origin.z;
    for (let radius = 0; radius <= 24; radius++) {
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const x = startX + dx * 128, z = startZ + dz * 128;
        const ground = this.corridor.height(x, z, this.height.sample(x, z));
        if (ground > altitude - 80) continue;
        camera.position.set(x - this.origin.x, altitude, z - this.origin.z);
        let heading = 0, lowest = Infinity;
        for (let direction = 0; direction < 8; direction++) {
          const angle = direction * Math.PI / 4;
          const px = x + Math.sin(angle) * 400, pz = z - Math.cos(angle) * 400;
          const ahead = this.corridor.height(px, pz, this.height.sample(px, pz));
          if (ahead < lowest) { lowest = ahead; heading = angle; }
        }
        return { heading, pitch: 0.08 };
      }
    }
    return undefined;
  }

  inspectHairpin(camera: PerspectiveCamera): { heading: number; pitch: number } | undefined {
    if (!this.roadReady) return undefined;
    const turns = this.road.segments.filter((segment) => segment.kind === 'hairpin');
    const turn = turns.find((segment) => segment.start.distance > (this.roadSample?.distance ?? 0) + 100) ?? turns[0];
    if (!turn) return undefined;
    const sample = turn.sample(0.5);
    const x = sample.position.x - Math.sin(sample.heading) * 140, z = sample.position.z + Math.cos(sample.heading) * 140;
    const ground = this.corridor.height(x, z, this.height.sample(x, z));
    const y = Math.max(sample.position.y + 140, ground + 80);
    camera.position.set(x - this.origin.x, y, z - this.origin.z);
    return { heading: sample.heading, pitch: -Math.atan2(y - sample.position.y, 140) };
  }

  inspectBridge(camera: PerspectiveCamera): { heading: number; pitch: number } | undefined {
    if (!this.roadReady) return undefined;
    const span = this.bridges.find((bridge) => bridge.end.distance > (this.roadSample?.distance ?? 0) + 100) ?? this.bridges[0];
    if (!span) return undefined;
    const sample = span.samples[Math.floor(span.samples.length / 2)];
    const distance = Math.max(180, Math.min(550, (span.end.distance - span.start.distance) * 0.7));
    const x = sample.position.x + Math.cos(sample.heading) * distance, z = sample.position.z + Math.sin(sample.heading) * distance;
    const ground = this.corridor.height(x, z, this.height.sample(x, z));
    const y = Math.max(sample.position.y + distance * 0.35, ground + 80);
    camera.position.set(x - this.origin.x, y, z - this.origin.z);
    return { heading: sample.heading - Math.PI / 2, pitch: -Math.atan2(y - sample.position.y, distance) };
  }

  dispose(): void {
    this.chunks.dispose(); this.roadDebug.dispose(); this.roadMesh.dispose(); this.bridgeMesh.dispose();
    this.tunnelMesh.dispose(); this.furniture.dispose();
  }
}
