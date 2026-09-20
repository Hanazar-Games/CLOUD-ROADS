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
import { ServicePlanner, type ServiceArea } from '../service/ServicePlanner';
import { SERVICE_SEARCH_RADIUS, serviceTarget } from '../service/ServiceSchedule';
import { ServiceMesh } from '../service/ServiceMesh';
import { padPoint } from '../service/ServiceTerrain';
import { RoadSigns } from '../road/RoadSigns';

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
  readonly serviceMesh: ServiceMesh;
  readonly signs: RoadSigns;
  services: readonly ServiceArea[] = [];
  serviceView: { heading: number; pitch: number } | undefined;
  passes: readonly RoadSample[] = [];
  tunnels: readonly TunnelSpan[] = [];
  shelter = 0;
  bridges: readonly BridgeSpan[] = [];
  private readonly bridgeDetector: BridgeDetector;
  private readonly tunnelDetector: TunnelDetector;
  private readonly servicePlanner: ServicePlanner;
  private scout: { road: RoadSpine; kind: 'service' | 'pass'; id: number; progress: number } | undefined;
  private readonly biomes: BiomeSystem;
  roadSample: RoadSample | undefined;
  roadReady = false;
  private readonly forward = new Vector3();
  private corridor = new RoadCorridor([]);
  private corridorVersion = -1;

  constructor(scene: Scene, readonly seed: string, readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.height = new HeightFunction(seed, options.terrain, options.roadType);
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
    this.servicePlanner = new ServicePlanner(seed, this.height, options);
    this.serviceMesh = new ServiceMesh(scene, options, this.height);
    this.signs = new RoadSigns(scene, options);
  }

  resetCamera(camera: PerspectiveCamera): void {
    this.scout = undefined; this.serviceView = undefined;
    this.roadReady = false;
    this.origin.reset();
    this.chunks.setOrigin(0, 0);
    camera.position.set(128, this.height.sample(128, 128) + 450, 128);
  }

  update(camera: PerspectiveCamera, explore = true, travelHeading?: number): void {
    if (this.origin.rebase(camera.position)) this.chunks.setOrigin(this.origin.x, this.origin.z);
    camera.getWorldDirection(this.forward);
    if (travelHeading !== undefined) this.forward.set(Math.sin(travelHeading), 0, -Math.cos(travelHeading));
    const x = camera.position.x + this.origin.x, z = camera.position.z + this.origin.z;
    this.roadReady = this.road.update(z, 4, Math.max(4000, (this.chunks.viewRadius + 2) * 256 + 1600));
    if (this.roadReady && this.corridorVersion !== this.road.version) {
      this.services = this.servicePlanner.detect(this.road.samples);
      const clear = (span: { start: RoadSample; end: RoadSample }) => !this.services.some(site => site.start < span.end.distance && site.end > span.start.distance);
      this.bridges = this.bridgeDetector.detect(this.road.samples);
      this.tunnels = this.tunnelDetector.detect(this.road.samples, this.bridges).filter(clear);
      const passes: RoadSample[] = [], samples = this.road.samples;
      if (this.options.terrain === 'alpine') {
        const first = this.height.ranges.sample(samples[0].position.z).id, last = this.height.ranges.sample(samples.at(-1)!.position.z).id;
        for (let id = first; id <= last; id++) {
          const z = this.height.ranges.passZ(id);
          if (samples[0].position.z < z + 600 || samples.at(-1)!.position.z > z - 600) continue;
          const nearby = samples.filter(sample => Math.abs(sample.position.z - z) < 1000
            && !this.tunnels.some(span => sample.distance >= span.start.distance - 12 && sample.distance <= span.end.distance + 12));
          if (nearby.length) passes.push(nearby.reduce((best, sample) => sample.position.y > best.position.y ? sample : best));
        }
      }
      this.passes = passes;
      this.corridor = RoadCorridor.fromSamples(this.road.samples, this.bridges, this.options, this.tunnels, this.services.map(site => site.ground));
      this.corridorVersion = this.road.version;
    }
    this.chunks.update(x, z, this.forward, this.roadReady ? this.corridor : null);
    this.roadSample = this.road.nearest(x, z);
    const nearRoute = !!this.roadSample && Math.hypot(this.roadSample.position.x - x, this.roadSample.position.z - z) < this.chunks.viewRadius * 256 + 1500;
    this.roadDebug.update(this.road, this.origin.x, this.origin.z, nearRoute);
    this.roadMesh.update(this.road, this.origin.x, this.origin.z, nearRoute, this.services);
    this.bridgeMesh.update(this.bridges, this.corridor, this.height, this.corridorVersion, this.origin.x, this.origin.z, nearRoute, this.services);
    this.tunnelMesh.update(this.tunnels, this.corridor, this.height, this.corridorVersion, this.origin.x, this.origin.z, nearRoute);
    this.furniture.update(this.road.samples, this.tunnels, this.bridges, this.corridorVersion, this.origin.x, this.origin.z, nearRoute, this.services);
    this.serviceMesh.update(this.services, this.corridorVersion, this.origin.x, this.origin.z);
    this.signs.update(this.road.samples, this.tunnels, this.services, this.corridorVersion, this.origin.x, this.origin.z, this.passes);
    this.shelter = this.tunnelShelter(x, camera.position.y, z);
    if (explore && this.scout) this.advanceServiceView(camera);
  }

  get searching(): boolean { return !!this.scout; }
  get serviceSearchProgress(): number | null { return this.scout?.kind === 'service' ? this.scout.progress : null; }
  get passSearchProgress(): number | null { return this.scout?.kind === 'pass' ? this.scout.progress : null; }
  get routeStage(): string {
    const stage = this.height.route(this.roadSample?.position.z ?? 128)?.stage;
    return stage ? { valley: '山谷', climb: '上山', pass: '垭口', descent: '下山' }[stage] : '自由路线';
  }

  requestPassView(): void {
    if (this.scout || !this.roadReady || this.options.terrain !== 'alpine') return;
    const z = this.roadSample?.position.z ?? 128;
    let id = this.height.ranges.sample(z).id;
    while (this.height.ranges.passZ(id) > z - 1000) id++;
    this.scout = { road: this.road.fork(), kind: 'pass', id, progress: 0 };
  }

  requestServiceView(): void {
    if (this.scout || !this.roadReady) return;
    let id = Math.max(1, Math.floor((this.roadSample?.distance ?? 0) / 15000));
    while (serviceTarget(this.seed, id) < (this.roadSample?.distance ?? 0) + 1000) id++;
    this.scout = { road: this.road.fork(), kind: 'service', id, progress: 0 };
  }

  private advanceServiceView(camera: PerspectiveCamera): void {
    const scout = this.scout!;
    if (scout.kind === 'pass') {
      const z = this.height.ranges.passZ(scout.id), ready = scout.road.update(z, 4, 1000);
      scout.progress = Math.min(1, (128 - (scout.road.segments.at(-1)?.end.position.z ?? 128)) / (1128 - z));
      if (!ready) return;
      const sample = scout.road.samples.filter(point => Math.abs(point.position.z - z) < 500)
        .reduce((best, point) => point.position.y > best.position.y ? point : best);
      const x = sample.position.x + Math.cos(sample.heading) * 100 - Math.sin(sample.heading) * 140;
      const pz = sample.position.z + Math.sin(sample.heading) * 100 + Math.cos(sample.heading) * 140;
      const y = Math.max(sample.position.y + 85, this.height.sample(x, pz) + 35);
      camera.position.set(x - this.origin.x, y, pz - this.origin.z);
      this.roadReady = false;
      this.serviceView = { heading: Math.atan2(sample.position.x - x, pz - sample.position.z), pitch: -Math.atan2(y - sample.position.y, Math.hypot(x - sample.position.x, pz - sample.position.z)) };
      this.scout = undefined;
      return;
    }
    const target = serviceTarget(this.seed, scout.id) + SERVICE_SEARCH_RADIUS + 4;
    const ready = scout.road.advanceToDistance(target);
    scout.progress = Math.min(1, (scout.road.segments.at(-1)?.end.distance ?? 0) / target);
    if (!ready) return;
    const site = this.servicePlanner.detect(scout.road.samples).find(site => site.id === scout.id);
    if (!site) throw new Error('Service area search did not produce a complete site');
    const pad = site.ground.pads.at(-1)!, point = padPoint(pad, -pad.side * 75, -110, 75);
    const ground = this.height.sample(point.x, point.z);
    point.y = Math.max(point.y, ground + 35);
    camera.position.set(point.x - this.origin.x, point.y, point.z - this.origin.z);
    this.roadReady = false;
    this.serviceView = { heading: Math.atan2(pad.x - point.x, point.z - pad.z), pitch: -Math.atan2(point.y - pad.y, Math.hypot(pad.x - point.x, pad.z - point.z)) };
    this.scout = undefined;
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
    const ahead = this.bridges.filter(bridge => bridge.end.distance > (this.roadSample?.distance ?? 0) + 100);
    const span = ahead.find(bridge => bridge.depth >= 80) ?? ahead[0] ?? this.bridges[0];
    if (!span) return undefined;
    const sample = span.samples[Math.floor(span.samples.length / 2)];
    const distance = Math.max(180, Math.min(550, (span.end.distance - span.start.distance) * 0.7));
    const viewpoints = [-1, 1].map(side => {
      const x = sample.position.x + Math.cos(sample.heading) * distance * side, z = sample.position.z + Math.sin(sample.heading) * distance * side;
      return { x, z, side, ground: this.corridor.height(x, z, this.height.sample(x, z)) };
    });
    const { x, z, side, ground } = viewpoints.reduce((best, point) => point.ground < best.ground ? point : best);
    const y = Math.max(sample.position.y + distance * 0.35, ground + 80);
    camera.position.set(x - this.origin.x, y, z - this.origin.z);
    return { heading: sample.heading - side * Math.PI / 2, pitch: -Math.atan2(y - sample.position.y, distance) };
  }

  dispose(): void {
    this.chunks.dispose(); this.roadDebug.dispose(); this.roadMesh.dispose(); this.bridgeMesh.dispose();
    this.tunnelMesh.dispose(); this.furniture.dispose();
    this.serviceMesh.dispose(); this.scout = undefined;
    this.signs.dispose();
  }
}
