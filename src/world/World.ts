import { Vector3, type PerspectiveCamera, type Scene } from 'three';
import { HeightFunction } from '../terrain/HeightFunction';
import { TerrainWorkers } from '../terrain/TerrainWorkers';
import { ChunkManager } from './ChunkManager';
import { FloatingOrigin } from './FloatingOrigin';
import { RoadSpine } from '../road/RoadSpine';
import { RoadNetwork } from '../road/RoadNetwork';
import { RoadDebug } from '../road/RoadDebug';
import type { RoadSample } from '../road/RoadSegment';
import { RoadMesh } from '../road/RoadMesh';
import { RoadCorridor } from '../road/RoadCorridor';
import type { BridgeSpan } from '../bridge/BridgeDetector';
import { BridgeMesh } from '../bridge/BridgeMesh';
import { BiomeSystem, type BiomeSample } from '../biome/BiomeSystem';
import { surfaceGravity, DEFAULT_OPTIONS, type WorldOptions } from './WorldOptions';
import { roadProfile } from '../road/RoadProfile';
import { roadFrame } from '../road/RoadFrame';
import { TunnelDetector, openTunnelAccess, type TunnelSpan } from '../tunnel/TunnelDetector';
import { TunnelMesh } from '../tunnel/TunnelMesh';
import { RoadFurniture } from '../road/RoadFurniture';
import { RoadsideScenery } from '../road/RoadsideScenery';
import type { ServiceArea } from '../service/ServicePlanner';
import { SERVICE_SEARCH_RADIUS, serviceTarget } from '../service/ServiceSchedule';
import { ServiceMesh } from '../service/ServiceMesh';
import { padPoint, crossoverShelter } from '../service/ServiceTerrain';
import { ParkedVehicles } from '../service/ParkedVehicles';
import { RoadSigns } from '../road/RoadSigns';
import type { Crossing } from '../road/Crossings';
import { CrossingPlanner } from '../road/CrossingPlanner';
import { CrossingMesh } from '../road/CrossingMesh';
import { SeasonState, type Season } from '../season/SeasonState';
import { seasonMaterial } from '../season/SeasonMaterial';
import { JUNCTION_INTERVAL, junctionLead, junctionsEnabled } from '../road/JunctionSchedule';
import { JunctionMesh } from '../road/JunctionMesh';
import { InterchangeMesh } from '../road/InterchangeMesh';
import { TrafficSystem } from '../traffic/TrafficSystem';
import { TrafficVehicles } from '../traffic/TrafficVehicles';
import { Garage } from '../garage/Garage';
import { GarageMesh } from '../garage/GarageMesh';
import { placeRoadGarage } from '../garage/GarageAccess';
import { PavementTextures } from '../road/PavementTextures';

export interface GroundSample {
  height: number;
  normalY: number;
  biome: BiomeSample;
}

export class World {
  detailLevel = 1;
  readonly pavementTextures = new PavementTextures();
  readonly season: SeasonState;
  readonly origin = new FloatingOrigin();
  readonly chunks: ChunkManager;
  readonly height: HeightFunction;
  readonly network: RoadNetwork;
  get road(): RoadSpine { return this.network.active.road; }
  readonly roadDebug: RoadDebug;
  readonly roadMesh: RoadMesh;
  readonly bridgeMesh: BridgeMesh;
  readonly tunnelMesh: TunnelMesh;
  readonly furniture: RoadFurniture;
  readonly roadside: RoadsideScenery;
  readonly serviceMesh: ServiceMesh;
  readonly parkedVehicles: ParkedVehicles;
  readonly traffic: TrafficSystem;
  readonly trafficVehicles: TrafficVehicles;
  readonly garage: Garage;
  readonly garageMesh: GarageMesh;
  private readonly serviceGarages = new Map<Garage, GarageMesh>();
  garages: readonly Garage[];
  readonly signs: RoadSigns;
  readonly crossingMesh: CrossingMesh;
  readonly junctionMesh: JunctionMesh;
  readonly interchangeMesh: InterchangeMesh;
  crossings: Crossing[] = [];
  private readonly crossingPlanner: CrossingPlanner;
  services: readonly ServiceArea[] = [];
  connections: readonly ServiceArea[] = [];
  serviceView: { heading: number; pitch: number } | undefined;
  passes: readonly RoadSample[] = [];
  tunnels: readonly TunnelSpan[] = [];
  shelter = 0;
  bridges: readonly BridgeSpan[] = [];
  private readonly extraRoads = new Map<string, RoadMesh>();
  private renderRoutes: { id: string; source: Pick<RoadSpine, 'version' | 'samples' | 'segments'>; services: readonly ServiceArea[]; tunnels: readonly TunnelSpan[] }[] = [];
  private renderBridges: BridgeSpan[] = [];
  private renderTunnels: TunnelSpan[] = [];
  private renderServices: ServiceArea[] = [];
  private renderSamples: RoadSample[] = [];
  private scout: { road: RoadSpine; kind: 'service' | 'pass' | 'junction' | 'landmark'; id: number; progress: number } | undefined;
  landmarkStatus = '';
  private readonly biomes: BiomeSystem;
  roadSample: RoadSample | undefined;
  roadReady = false;
  private readonly forward = new Vector3();
  private corridor = new RoadCorridor([]);
  private corridorVersion = -1;
  private garageEntrance?: ServiceArea;
  private garagePlacementVersion = -1;

  constructor(private readonly scene: Scene, readonly seed: string, readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.height = new HeightFunction(seed, options.terrain, options.roadType, options);
    this.garage = new Garage(seed, { x: 640, y: this.height.sample(640, 128), z: 128 });
    this.garages = [this.garage];
    this.garageMesh = new GarageMesh(scene, this.garage);
    this.crossingPlanner = new CrossingPlanner(seed, this.height);
    this.biomes = new BiomeSystem(seed, options.terrain);
    this.chunks = new ChunkManager(scene, seed, new TerrainWorkers(options));
    this.network = new RoadNetwork(seed, this.height, options, new RoadSpine(seed, this.height, options));
    this.roadDebug = new RoadDebug(scene);
    this.roadMesh = new RoadMesh(scene, options, undefined, this.pavementTextures);
    this.bridgeMesh = new BridgeMesh(scene, options);
    this.tunnelMesh = new TunnelMesh(scene, seed, options);
    this.furniture = new RoadFurniture(scene, seed, options);
    this.roadside = new RoadsideScenery(scene, seed, options);
    this.serviceMesh = new ServiceMesh(scene, options, this.height, this.pavementTextures);
    this.parkedVehicles = new ParkedVehicles(scene, seed, surfaceGravity(options.terrain));
    this.traffic = new TrafficSystem(seed, options);
    this.trafficVehicles = new TrafficVehicles(scene, this.traffic);
    this.signs = new RoadSigns(scene, options);
    this.crossingMesh = new CrossingMesh(scene, seed, options);
    this.junctionMesh = new JunctionMesh(scene, options);
    this.interchangeMesh = new InterchangeMesh(scene, this.pavementTextures);
    this.season = new SeasonState(options.terrain);
    this.chunks.setSeason(this.season);
    this.roadMesh.setSeason(this.season);
    for (const mesh of [this.tunnelMesh.cover, this.crossingMesh.tunnels.cover]) seasonMaterial(mesh.material, this.season, 'terrain');
    for (const mesh of [this.tunnelMesh.portals, this.crossingMesh.tunnels.portals, this.crossingMesh.parts,
      this.bridgeMesh.piers, this.bridgeMesh.details, this.bridgeMesh.railings, this.furniture.rails, this.furniture.poles,
      this.serviceMesh.structures, this.serviceMesh.railings, this.serviceMesh.buildings, this.serviceMesh.treeTrunks,
      this.serviceMesh.roofs, this.junctionMesh.parts, this.roadside.hardware, this.roadside.trunks, this.roadside.screens]) seasonMaterial(mesh.material, this.season, 'structure');
    for (const mesh of [this.serviceMesh.pavement, this.interchangeMesh.pavement, this.serviceMesh.markings, this.junctionMesh.markings]) seasonMaterial(mesh.material, this.season, 'pavement');
    seasonMaterial(this.serviceMesh.landscaping.material, this.season, 'foliage');
    seasonMaterial(this.roadside.foliage.material, this.season, 'foliage');
    for (const details of [this.bridgeMesh.jointDetails, this.bridgeMesh.drainDetails, this.serviceMesh.chargerDetails, this.serviceMesh.picnicDetails])
      seasonMaterial(details.mesh.material, this.season, 'structure');
  }

  setSeason(kind: Season): void { this.season.set(kind); this.chunks.vegetation.setSeason(this.season); }

  resetCamera(camera: PerspectiveCamera): void {
    this.traffic.clear();
    this.network.reset();
    this.scout = undefined; this.serviceView = undefined;
    this.roadReady = false;
    this.origin.reset();
    this.chunks.setOrigin(0, 0);
    camera.position.set(128, this.height.sample(128, 128) + 450, 128);
  }

  update(camera: PerspectiveCamera, explore = true, travelHeading?: number, travelPosition?: { x: number; y: number; z: number }): void {
    if (this.origin.rebase(camera.position)) this.chunks.setOrigin(this.origin.x, this.origin.z);
    this.season.setOrigin(this.origin.x, this.origin.z);
    camera.getWorldDirection(this.forward);
    if (travelHeading !== undefined) this.forward.set(Math.sin(travelHeading), 0, -Math.cos(travelHeading));
    const x = camera.position.x + this.origin.x, z = camera.position.z + this.origin.z;
    const position = travelPosition ?? { x, y: camera.position.y, z };
    this.roadReady = this.network.update(position.x, position.z, travelPosition?.y, Math.max(4000, (this.chunks.viewRadius + 2) * 256 + 1600));
    if (this.roadReady && !this.garageEntrance && this.garagePlacementVersion !== this.network.version) {
      this.garagePlacementVersion = this.network.version;
      for (const route of [this.network.active, ...this.network.routes.filter(route => route !== this.network.active && route.ready)]) {
        const crossings = this.crossingPlanner.plan([route.road.samples], RoadCorridor.fromSamples(route.road.samples, route.bridges, this.options, route.tunnels));
        this.garageEntrance = placeRoadGarage(this.garage, route.road.samples, this.height, roadProfile(this.options).outerHalfWidth, route.services, crossings.flatMap(site => site.samples.map(p => p.position)));
        if (this.garageEntrance) break;
      }
      if (this.garageEntrance) this.corridorVersion = -1;
    }
    if (this.roadReady && this.corridorVersion !== this.network.version) {
      const entrance = this.garageEntrance;
      if (entrance?.accessWindows) {
        const route = this.network.routes.find(r => r.id === (entrance.sample.routeId ?? 'root'));
        if (route) route.tunnels = openTunnelAccess(route.tunnels, entrance.accessWindows);
      }
      this.services = this.network.active.services;
      this.bridges = this.network.active.bridges;
      this.tunnels = this.network.active.tunnels;
      const passes: RoadSample[] = [], samples = this.road.samples;
      if (this.options.terrain === 'alpine' && this.network.active.id === 'root') {
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
      this.corridorVersion = this.network.version;
      this.prepareRoutes(position.x, position.z);
    }
    this.chunks.update(x, z, this.forward, this.roadReady ? this.corridor : null);
    this.roadSample = this.road.nearest(position.x, position.z);
    const nearRoute = !!this.roadSample && Math.hypot(this.roadSample.position.x - x, this.roadSample.position.z - z) < this.chunks.viewRadius * 256 + 1500;
    this.roadDebug.update({ version: this.corridorVersion, segments: this.road.segments, samples: this.road.samples }, this.origin.x, this.origin.z, nearRoute);
    for (const [i, route] of this.renderRoutes.entries()) {
      let mesh = i === 0 ? this.roadMesh : this.extraRoads.get(route.id);
      if (!mesh) { mesh = new RoadMesh(this.scene, this.options, 64, this.pavementTextures); mesh.setSeason(this.season); this.extraRoads.set(route.id, mesh); }
      mesh.update(route.source, this.origin.x, this.origin.z, nearRoute, route.services, route.tunnels);
      mesh.mesh.material.roughness = this.roadMesh.mesh.material.roughness;
    }
    this.bridgeMesh.update(this.renderBridges, this.corridor, this.height, this.corridorVersion, this.origin.x, this.origin.z, nearRoute, this.renderServices);
    this.crossingMesh.update(this.crossings, this.corridor, this.height, this.origin.x, this.origin.z, nearRoute);
    this.tunnelMesh.update(this.renderTunnels, this.corridor, this.height, this.corridorVersion, this.origin.x, this.origin.z, nearRoute);
    this.furniture.update(this.renderSamples, this.renderTunnels, this.renderBridges, this.corridorVersion, this.origin.x, this.origin.z, nearRoute, this.renderServices);
    this.roadside.update(this.renderSamples, this.renderBridges, this.renderTunnels, this.renderServices, this.corridor, this.height,
      this.corridorVersion, this.origin.x, this.origin.z, nearRoute, this.chunks.vegetation.enabled && !this.season.extraterrestrial);
    this.serviceMesh.update(this.renderServices, this.corridorVersion, this.origin.x, this.origin.z, this.chunks.vegetation.enabled && !this.season.extraterrestrial, this.corridor);
    this.parkedVehicles.update(this.renderServices, this.origin, camera.position, this.garage, [...this.serviceGarages.keys()]);
    this.garageMesh.update(this.origin, camera.position);
    for (const mesh of this.serviceGarages.values()) mesh.update(this.origin, camera.position);
    this.junctionMesh.update(this.network.junctions, this.network.routes, this.corridorVersion, this.origin.x, this.origin.z);
    this.interchangeMesh.update(this.network.junctions.flatMap(j => j.interchange ? [j.interchange] : []), this.origin, this.corridor, this.height);
    for (const details of [this.bridgeMesh.jointDetails, this.bridgeMesh.drainDetails, this.tunnelMesh.cabinetDetails,
      this.crossingMesh.tunnels.cabinetDetails, this.serviceMesh.chargerDetails, this.serviceMesh.picnicDetails])
      details.update({ x, y: camera.position.y, z }, this.origin.x, this.origin.z, this.detailLevel, nearRoute);
    this.signs.update(this.road.samples, this.tunnels, this.services, this.corridorVersion, this.origin.x, this.origin.z, this.passes, this.network.junctions.filter(j => j.interchange || j.route === this.network.active.id));
    this.shelter = this.tunnelShelter(x, camera.position.y, z);
    if (explore && this.scout) this.advanceServiceView(camera);
  }

  get searching(): boolean { return !!this.scout; }

  get nextJunction() {
    return this.network.junctions.filter(j => j.route === this.network.active.id && (j.interchange ? j.distance + 820 : j.ramps.at(-1)!.sample.distance) > (this.roadSample?.distance ?? 0) - 200).sort((a, b) => a.distance - b.distance)[0];
  }

  inspectJunction(camera: PerspectiveCamera): { heading: number; pitch: number } | undefined {
    if (!this.roadReady || this.scout || !junctionsEnabled(this.options)) return undefined;
    const junction = this.nextJunction;
    if (!junction) {
      const id = Math.max(1, Math.ceil(((this.roadSample?.distance ?? 0) + 200) / JUNCTION_INTERVAL));
      this.scout = { road: this.road.fork(), kind: 'junction', id, progress: 0 };
      return undefined;
    }
    if (junction.interchange) {
      const p = junction.sample.position, heading = junction.sample.heading + Math.PI / 4;
      const x = p.x - Math.sin(heading) * 1250, z = p.z + Math.cos(heading) * 1250, y = Math.max(p.y + 1250, this.height.sample(x, z) + 120);
      camera.position.set(x - this.origin.x, y, z - this.origin.z);
      return { heading, pitch: -Math.atan2(y - p.y, 1250) };
    }
    const segment = this.road.segments.find(s => s.start.distance <= junction.distance - 100 && s.end.distance >= junction.distance - 100);
    if (!segment) return undefined;
    const sample = segment.atDistance(junction.distance - 100);
    this.placeOnRoad(camera, sample, 6);
    return { heading: sample.heading, pitch: -0.04 };
  }

  private prepareRoutes(x: number, z: number): void {
    const routes = [this.network.active, ...this.network.routes.filter(route => route !== this.network.active && route.ready).sort((a, b) => {
      const distance = (road: RoadSpine) => { const p = road.nearest(x, z)!.position; return Math.hypot(p.x - x, p.z - z); };
      return distance(a.road) - distance(b.road);
    })];
    this.renderRoutes = []; this.renderSamples = []; this.renderBridges = []; this.renderTunnels = []; this.renderServices = [];
    const corridors: RoadCorridor[] = [];
    let remaining = 256;
    for (const [i, route] of routes.entries()) {
      if (!remaining) break;
      const nearest = route.road.nearest(x, z)!, all = route.road.segments;
      const at = Math.max(0, all.findIndex(s => s.end.distance >= nearest.distance));
      const count = Math.min(remaining, i === 0 ? 192 : 64), first = Math.max(0, Math.min(all.length - count, at - Math.floor(count / 3)));
      const segments = all.slice(first, first + count);
      if (!segments.length) continue;
      const min = segments[0].start.distance, max = segments.at(-1)!.end.distance;
      const samples = route.road.samples.filter(p => p.distance >= min - 1e-6 && p.distance <= max + 1e-6);
      const bridges = route.bridges.flatMap(span => {
        const points = span.samples.filter(p => p.distance >= min && p.distance <= max);
        return points.length < 2 ? [] : [{ ...span, start: points[0], end: points.at(-1)!, samples: points,
          openStart: span.openStart || span.start.distance < min, openEnd: span.openEnd || span.end.distance > max }];
      });
      const tunnels = route.tunnels.flatMap(span => {
        const points = span.samples.filter(p => p.distance >= min && p.distance <= max);
        return points.length < 2 ? [] : [{ ...span, start: points[0], end: points.at(-1)!, samples: points,
          openStart: span.openStart || span.start.distance < min, openEnd: span.openEnd || span.end.distance > max }];
      });
      const entrance = this.garageEntrance && (this.garageEntrance.sample.routeId ?? 'root') === route.id ? [this.garageEntrance] : [];
      const services = [...route.services, ...entrance].filter(site => Math.min(site.start, site.sample.distance - (site.mergeEnd ?? 0)) >= min && Math.max(site.end, site.sample.distance + (site.mergeEnd ?? 0)) <= max);
      this.renderRoutes.push({ id: route.id, source: { version: this.corridorVersion, samples, segments }, services, tunnels });
      this.renderSamples.push(...samples); this.renderBridges.push(...bridges); this.renderTunnels.push(...tunnels); this.renderServices.push(...services);
      corridors.push(RoadCorridor.fromSamples(samples, bridges, this.options, tunnels, services.map(site => site.ground)));
      remaining -= segments.length;
    }
    const garages = this.renderServices.flatMap(site => site.garages ?? []);
    for (const [garage, mesh] of this.serviceGarages) if (!garages.includes(garage)) { mesh.dispose(); this.serviceGarages.delete(garage); }
    for (const garage of garages) if (!this.serviceGarages.has(garage)) this.serviceGarages.set(garage, new GarageMesh(this.scene, garage));
    this.garages = [this.garage, ...garages];
    const interchanges = this.network.junctions.filter(j => j.interchange).map(j => ({ id: -1, sample: j.sample, start: j.distance - 600, end: j.distance + 600, ground: j.interchange!.ground }));
    const garageAccess = this.garages.map(garage => garage === this.garage && this.garageEntrance ? this.garageEntrance
      : { id: -3, sample: this.road.samples[0], start: -Infinity, end: -Infinity, ground: garage.ground });
    this.connections = [...interchanges, ...garageAccess];
    const grounds = [...this.renderServices.filter(site => site !== this.garageEntrance).map(site => site.ground), ...this.connections.map(site => site.ground)];
    this.renderServices.push(...garageAccess.filter(site => !this.renderServices.includes(site)));
    this.corridor = new RoadCorridor(corridors.flatMap(corridor => corridor.edges), this.options, grounds);
    this.crossings = this.crossingPlanner.plan(this.renderRoutes.map(route => route.source.samples), this.corridor)
      .sort((a, b) => Math.hypot(a.anchor.position.x - x, a.anchor.position.z - z) - Math.hypot(b.anchor.position.x - x, b.anchor.position.z - z))
      .filter((site, i, all) => all.slice(0, i).every(other => Math.hypot(site.anchor.position.x - other.anchor.position.x, site.anchor.position.z - other.anchor.position.z) > 2000)).slice(0, 3);
    this.corridor = new RoadCorridor([...this.corridor.edges, ...this.crossings.flatMap(site => site.edges)], this.options, grounds);
    for (const [id, mesh] of this.extraRoads) if (!this.renderRoutes.slice(1).some(route => route.id === id)) { mesh.dispose(); this.extraRoads.delete(id); }
  }
  get serviceSearchProgress(): number | null { return this.scout?.kind === 'service' ? this.scout.progress : null; }
  get junctionSearchProgress(): number | null { return this.scout?.kind === 'junction' ? this.scout.progress : null; }
  get landmarkSearchProgress(): number | null { return this.scout?.kind === 'landmark' ? this.scout.progress : null; }

  requestLandmarkView(): void {
    if (this.scout?.kind === 'landmark') { this.scout = undefined; this.landmarkStatus = '已取消定位。'; return; }
    if (this.scout || !this.roadReady || !this.options.landmarkBridges) return;
    this.landmarkStatus = '沿当前分支寻找可衔接的大桥，可再次点击取消。';
    this.scout = { road: this.road.fork(), kind: 'landmark', id: (this.roadSample?.distance ?? 0) + 200, progress: 0 };
  }

  inspectCrossing(camera: PerspectiveCamera): { heading: number; pitch: number } | undefined {
    const site = this.crossings[0];
    if (!this.roadReady || !site) return undefined;
    const p = site.anchor.position, heading = site.anchor.heading + Math.PI / 4;
    const x = p.x + Math.cos(heading) * 180, z = p.z + Math.sin(heading) * 180;
    const y = Math.max(p.y + 65, this.height.sample(x, z) + 40);
    camera.position.set(x - this.origin.x, y, z - this.origin.z);
    return { heading: Math.atan2(p.x - x, z - p.z), pitch: -Math.atan2(y - p.y + 20, 180) };
  }
  get passSearchProgress(): number | null { return this.scout?.kind === 'pass' ? this.scout.progress : null; }
  get routeStage(): string {
    if (this.network.active.id !== 'root') return this.network.active.id === 'back' ? '反向路线' : '岔路探索';
    const stage = this.height.route(this.roadSample?.position.z ?? 128)?.stage;
    return stage ? { valley: '山谷', climb: '上山', pass: '垭口', descent: '下山' }[stage] : '自由路线';
  }

  requestPassView(): void {
    if (this.scout || !this.roadReady || this.options.terrain !== 'alpine' || this.network.active.id !== 'root') return;
    const z = this.roadSample?.position.z ?? 128;
    let id = this.height.ranges.sample(z).id;
    while (this.height.ranges.passZ(id) > z - 1000) id++;
    this.scout = { road: this.road.fork(), kind: 'pass', id, progress: 0 };
  }

  requestServiceView(): void {
    if (this.scout || !this.roadReady) return;
    let id = Math.max(1, Math.floor((this.roadSample?.distance ?? 0) / 15000));
    while (serviceTarget(this.network.active.seed, id) < (this.roadSample?.distance ?? 0) + 1000) id++;
    this.scout = { road: this.road.fork(), kind: 'service', id, progress: 0 };
  }

  private advanceServiceView(camera: PerspectiveCamera): void {
    const scout = this.scout!;
    if (scout.kind === 'landmark') {
      const limit = scout.id + this.options.landmarkMax * 2 + 12000;
      const distance = scout.road.segments.at(-1)?.end.distance ?? scout.id;
      scout.road.advanceToDistance(Math.max(scout.id, distance) + 384);
      scout.progress = Math.min(1, (scout.road.segments.at(-1)?.end.distance ?? 0) / limit);
      const segment = scout.road.segments.find(s => s.start.structure?.landmark && s.start.structure.start > scout.id
        && s.start.distance >= s.start.structure.start - 1e-6);
      if (segment) {
        const sample = segment.sample(0); this.placeOnRoad(camera, sample, 6); this.roadReady = false;
        this.serviceView = { heading: sample.heading, pitch: -0.03 };
        this.landmarkStatus = `已到达 ${(sample.distance / 1000).toFixed(1)} km · ${(sample.structure!.end - sample.structure!.start).toFixed(0)} m 双塔斜拉桥。`;
        this.scout = undefined;
      } else if (distance > limit) {
        this.scout = undefined; this.landmarkStatus = '当前范围未找到可衔接桥位，请提高最大坡度或使用自然起伏。';
      }
      return;
    }
    if (scout.kind === 'junction') {
      const target = scout.id * JUNCTION_INTERVAL;
      const ready = scout.road.advanceToDistance(target + 1400);
      scout.progress = Math.min(1, (scout.road.segments.at(-1)?.end.distance ?? 0) / (target + 1400));
      if (!ready) return;
      const sample = scout.road.segments.find(s => s.start.distance <= target - 100 && s.end.distance >= target - 100)!.atDistance(target - 100);
      if (sample.structure?.landmark) { scout.id++; return; }
      const tunnels = new TunnelDetector(this.height, this.options).detect(scout.road.samples, []);
      if (tunnels.some(span => span.start.distance < target + 1200 && span.end.distance > target - junctionLead(this.options))) { scout.id++; return; }
      this.placeOnRoad(camera, sample, 6);
      this.roadReady = false;
      this.serviceView = { heading: sample.heading, pitch: -0.04 };
      this.scout = undefined;
      return;
    }
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
    const target = serviceTarget(this.network.active.seed, scout.id) + SERVICE_SEARCH_RADIUS + 4;
    const ready = scout.road.advanceToDistance(target);
    scout.progress = Math.min(1, (scout.road.segments.at(-1)?.end.distance ?? 0) / target);
    if (!ready) return;
    const site = this.network.active.servicePlanner.detect(scout.road.samples).find(site => site.id === scout.id);
    if (!site) { scout.id++; return; }
    const pad = site.ground.pads.at(-1)!, point = padPoint(pad, -pad.side * 75, -110, 75);
    const ground = this.height.sample(point.x, point.z);
    point.y = Math.max(point.y, ground + 35);
    camera.position.set(point.x - this.origin.x, point.y, point.z - this.origin.z);
    this.roadReady = false;
    this.serviceView = { heading: Math.atan2(pad.x - point.x, point.z - pad.z), pitch: -Math.atan2(point.y - pad.y, Math.hypot(pad.x - point.x, pad.z - point.z)) };
    this.scout = undefined;
  }

  private tunnelShelter(x: number, y: number, z: number): number {
    if (this.garages.some(garage => garage.shelter(x, y, z))) return 1;
    const service = this.renderServices.reduce((best, site) => Math.max(best, crossoverShelter(site.ground.crossover, x, y, z)), 0);
    if (service) return service;
    const sample = this.roadSample;
    if (!sample) return 0;
    const span = this.tunnels.find(tunnel => sample.distance >= tunnel.start.distance && sample.distance <= tunnel.end.distance);
    if (!span) return 0;
    const { right, normal } = roadFrame(sample), dx = x - sample.position.x, dy = y - sample.position.y, dz = z - sample.position.z;
    const lateral = dx * right.x + dy * right.y + dz * right.z, height = dx * normal.x + dy * normal.y + dz * normal.z;
    const profile = roadProfile(this.options), offset = Math.min(...profile.centers.map(center => Math.abs(lateral - center)));
    if (offset > profile.halfWidth + 0.65 || height < -0.5 || height > 4.2 + 3.3 * Math.sqrt(1 - (offset / (profile.halfWidth + 0.75)) ** 2)) return 0;
    return Math.max(0, Math.min(1, span.openStart ? 1 : (sample.distance - span.start.distance) / 8,
      span.openEnd ? 1 : (span.end.distance - sample.distance) / 8));
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
    const exposed = this.furniture.lampPositions.filter(point => !this.renderTunnels.some(span => span.start.routeId === point.sample.routeId
      && point.sample.distance >= span.start.distance - 120 && point.sample.distance <= span.end.distance + 120));
    const lamp = exposed.find(point => point.sample.distance > (this.roadSample?.distance ?? 0) + 100) ?? exposed[0] ?? this.furniture.lampPositions[0];
    if (!lamp) return undefined;
    this.placeOnRoad(camera, lamp.sample, 3);
    return { heading: lamp.sample.heading, pitch: Math.atan(lamp.sample.grade) };
  }

  private placeOnRoad(camera: PerspectiveCamera, sample: RoadSample, height: number): void {
    const offset = roadProfile(this.options).centers.at(-1)!, { right, normal } = roadFrame(sample), p = sample.position;
    camera.position.set(p.x + right.x * offset + normal.x * height - this.origin.x,
      p.y + right.y * offset + normal.y * height, p.z + right.z * offset + normal.z * height - this.origin.z);
  }

  groundHeight(x: number, z: number): number { return this.corridor.height(x, z, this.height.sample(x, z)); }

  sampleGround(x: number, z: number): GroundSample {
    const y = this.groundHeight(x, z);
    const normalY = 4 / Math.hypot(this.groundHeight(x - 2, z) - this.groundHeight(x + 2, z), 4, this.groundHeight(x, z - 2) - this.groundHeight(x, z + 2));
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
    const span = ahead.find(bridge => bridge.depth > 200) ?? ahead.find(bridge => bridge.depth >= 80) ?? ahead[0] ?? this.bridges[0];
    if (!span) return undefined;
    const sample = span.samples[Math.floor(span.samples.length / 2)];
    const distance = Math.max(180, Math.min(550, (span.end.distance - span.start.distance) * 0.7));
    const ground = (x: number, z: number) => this.corridor.height(x, z, this.height.sample(x, z));
    const viewpoints = [-1, 1].flatMap(side => [-Math.PI / 4, 0, Math.PI / 4].map(turn => {
      const angle = sample.heading + turn;
      const x = sample.position.x + Math.cos(angle) * distance * side, z = sample.position.z + Math.sin(angle) * distance * side;
      let y = Math.max(sample.position.y + distance * 0.35, ground(x, z) + 80);
      const steps = Math.ceil(distance / 4);
      for (let i = 1; i < steps; i++) {
        const t = i / steps, px = sample.position.x + (x - sample.position.x) * t, pz = sample.position.z + (z - sample.position.z) * t;
        y = Math.max(y, sample.position.y + (ground(px, pz) + 12 - sample.position.y) / t);
      }
      return { x, y, z, heading: angle - side * Math.PI / 2 };
    }));
    const { x, y, z, heading } = viewpoints.reduce((best, point) => point.y < best.y ? point : best);
    camera.position.set(x - this.origin.x, y, z - this.origin.z);
    return { heading, pitch: -Math.atan2(y - sample.position.y, distance) };
  }

  dispose(): void {
    this.garageMesh.dispose();
    for (const mesh of this.serviceGarages.values()) mesh.dispose(); this.serviceGarages.clear();
    for (const mesh of this.extraRoads.values()) mesh.dispose(); this.extraRoads.clear();
    this.chunks.dispose(); this.roadDebug.dispose(); this.roadMesh.dispose(); this.bridgeMesh.dispose();
    this.tunnelMesh.dispose(); this.furniture.dispose();
    this.roadside.dispose();
    this.serviceMesh.dispose(); this.parkedVehicles.dispose(); this.scout = undefined;
    this.trafficVehicles.dispose(); this.traffic.clear();
    this.signs.dispose();
    this.crossingMesh.dispose(); this.crossingPlanner.clear();
    this.junctionMesh.dispose();
    this.interchangeMesh.dispose();
  }
}
