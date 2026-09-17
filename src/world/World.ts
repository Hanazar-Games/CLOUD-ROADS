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

export class World {
  readonly origin = new FloatingOrigin();
  readonly chunks: ChunkManager;
  readonly height: HeightFunction;
  readonly road: RoadSpine;
  readonly roadDebug: RoadDebug;
  readonly roadMesh: RoadMesh;
  roadSample: RoadSample | undefined;
  roadReady = false;
  private readonly forward = new Vector3();
  private corridor = new RoadCorridor([]);
  private corridorVersion = -1;

  constructor(scene: Scene, readonly seed: string) {
    this.height = new HeightFunction(seed);
    this.chunks = new ChunkManager(scene, seed, new TerrainWorkers());
    this.road = new RoadSpine(seed);
    this.roadDebug = new RoadDebug(scene);
    this.roadMesh = new RoadMesh(scene);
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
      this.corridor = RoadCorridor.fromSamples(this.road.samples);
      this.corridorVersion = this.road.version;
    }
    this.chunks.update(x, z, this.forward, this.roadReady ? this.corridor : null);
    this.roadSample = this.road.nearZ(Math.min(128, z));
    const nearRoute = !!this.roadSample && Math.abs(this.roadSample.position.x - x) < 3500;
    this.roadDebug.update(this.road, this.origin.x, this.origin.z, nearRoute);
    this.roadMesh.update(this.road, this.origin.x, this.origin.z, nearRoute);
  }

  inspectRoad(camera: PerspectiveCamera): number | undefined {
    const sample = this.roadSample;
    if (!sample) return undefined;
    camera.position.set(sample.position.x - this.origin.x, sample.position.y + 25, sample.position.z - this.origin.z);
    return sample.heading;
  }

  dispose(): void { this.chunks.dispose(); this.roadDebug.dispose(); this.roadMesh.dispose(); }
}
