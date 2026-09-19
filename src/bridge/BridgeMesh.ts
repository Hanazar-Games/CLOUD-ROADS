import { BoxGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, type Scene } from 'three';
import { MAX_ROAD_SEGMENTS } from '../road/RoadSpine';
import { ROAD_SAMPLES, type RoadSample } from '../road/RoadSegment';
import { roadFrame } from '../road/RoadFrame';
import type { RoadCorridor } from '../road/RoadCorridor';
import type { RoadTerrain } from '../road/RoadGenerator';
import type { BridgeSpan } from './BridgeDetector';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { roadProfile } from '../road/RoadProfile';

const CAPACITY = MAX_ROAD_SEGMENTS * ROAD_SAMPLES;

export class BridgeMesh {
  private readonly geometry = new BoxGeometry();
  private readonly material = new MeshStandardMaterial({ color: 0xa8a99c, roughness: 0.92 });
  readonly deck: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  readonly piers: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  readonly details: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  private readonly profile;
  private readonly matrix = new Matrix4();
  private version = -1;
  private anchorX = 0;
  private anchorZ = 0;

  constructor(scene: Scene, options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.profile = roadProfile(options);
    this.deck = new InstancedMesh(this.geometry, this.material, CAPACITY * (this.profile.centers.length === 1 ? 3 : 4));
    this.piers = new InstancedMesh(this.geometry, this.material, CAPACITY * this.profile.centers.length);
    this.details = new InstancedMesh(this.geometry, new MeshStandardMaterial({ color: 0x586a71, metalness: 0.45, roughness: 0.6 }), CAPACITY * 8);
    for (const mesh of [this.deck, this.piers, this.details]) {
      mesh.count = 0;
      mesh.visible = false;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      scene.add(mesh);
    }
  }

  get pierCount(): number { return this.piers.count / 3; }

  update(spans: readonly BridgeSpan[], corridor: RoadCorridor, terrain: RoadTerrain, version: number,
    originX: number, originZ: number, nearRoute: boolean): void {
    if (this.version !== version) {
      this.version = version;
      this.anchorX = spans[0]?.start.position.x ?? 0;
      this.anchorZ = spans[0]?.start.position.z ?? 0;
      this.deck.count = this.piers.count = this.details.count = 0;
      const deckWidth = this.profile.halfWidth * 2 + 0.8;
      for (const span of spans) {
        for (let i = 1; i < span.samples.length; i++) {
          const a = span.samples[i - 1], b = span.samples[i], sample = this.between(a, b, 0.5);
          const { right, normal } = roadFrame(sample), { x, y, z } = sample.position;
          const length = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z)
            + (this.profile.outerHalfWidth * 2 + 1) * Math.sin(Math.abs(b.heading - a.heading) / 2) + 0.03;
          for (const center of this.profile.centers) {
            this.box(this.deck, x + right.x * center - normal.x * 1.04, y + right.y * center - normal.y * 1.04,
              z + right.z * center - normal.z * 1.04, deckWidth, 2, length, sample);
            const sides = this.profile.centers.length === 1 ? [-deckWidth / 2 + 0.15, deckWidth / 2 - 0.15]
              : [center + Math.sign(center) * (deckWidth / 2 - 0.15)];
            for (const side of sides) {
              this.box(this.deck, x + right.x * side + normal.x * 0.45,
                y + right.y * side + normal.y * 0.45, z + right.z * side + normal.z * 0.45, 0.35, 0.8, length, sample);
              this.box(this.details, x + right.x * side + normal.x * 1.35, y + right.y * side + normal.y * 1.35,
                z + right.z * side + normal.z * 1.35, 0.16, 0.16, length, sample);
              if (Math.floor(a.distance / 6) !== Math.floor(b.distance / 6)) this.box(this.details,
                x + right.x * side + normal.x * 1.1, y + right.y * side + normal.y * 1.1,
                z + right.z * side + normal.z * 1.1, 0.14, 0.6, 0.14, sample);
            }
            for (const offset of [-deckWidth * 0.28, deckWidth * 0.28]) this.box(this.details,
              x + right.x * (center + offset) - normal.x * 2.45, y + right.y * (center + offset) - normal.y * 2.45,
              z + right.z * (center + offset) - normal.z * 2.45, 0.65, 1, length, sample);
          }
        }
        this.support(span.start, true, corridor, terrain);
        let index = 1;
        for (let distance = span.start.distance + 32; distance < span.end.distance - 16; distance += 32) {
          while (span.samples[index].distance < distance) index++;
          const a = span.samples[index - 1], b = span.samples[index];
          this.support(this.between(a, b, (distance - a.distance) / (b.distance - a.distance)), false, corridor, terrain);
        }
        this.support(span.end, true, corridor, terrain);
      }
      for (const mesh of [this.deck, this.piers, this.details]) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.count) { mesh.computeBoundingBox(); mesh.computeBoundingSphere(); }
      }
    }
    for (const mesh of [this.deck, this.piers, this.details]) {
      mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
      mesh.visible = nearRoute && mesh.count > 0;
    }
  }

  private between(a: RoadSample, b: RoadSample, t: number): RoadSample {
    return { ...a,
      position: { x: a.position.x + (b.position.x - a.position.x) * t,
        y: a.position.y + (b.position.y - a.position.y) * t, z: a.position.z + (b.position.z - a.position.z) * t },
      heading: a.heading + (b.heading - a.heading) * t, grade: a.grade + (b.grade - a.grade) * t,
      bank: a.bank + (b.bank - a.bank) * t, distance: a.distance + (b.distance - a.distance) * t,
    };
  }

  private support(sample: RoadSample, abutment: boolean, corridor: RoadCorridor, terrain: RoadTerrain): void {
    const { right } = roadFrame(sample);
    for (const offset of this.profile.centers) this.supportCarriageway({ ...sample, position: {
      x: sample.position.x + right.x * offset, y: sample.position.y + right.y * offset, z: sample.position.z + right.z * offset,
    } }, abutment, corridor, terrain);
  }

  private supportCarriageway(sample: RoadSample, abutment: boolean, corridor: RoadCorridor, terrain: RoadTerrain): void {
    const { x, y, z } = sample.position;
    const ground = (px: number, pz: number) => {
      const natural = terrain.sample(px, pz);
      return Math.min(natural, corridor.height(px, pz, natural));
    };
    const deckWidth = this.profile.halfWidth * 2 + 0.8;
    const width = abutment ? deckWidth : Math.min(6, Math.max(3.2, (y - ground(x, z)) * 0.012));
    const footing = width + 2;
    let bottom = Math.min(ground(x, z), y - 5);
    for (const dx of [-footing / 2, footing / 2]) for (const dz of [-footing / 2, footing / 2]) bottom = Math.min(bottom, ground(x + dx, z + dz));
    bottom -= 4;
    const top = y - 2.64, base = bottom + 2;
    this.box(this.piers, x, bottom + 1.5, z, footing, 3, footing);
    this.box(this.piers, x, (base + top) / 2, z, width, top - base, abutment ? 4 : width);
    const { normal } = roadFrame(sample);
    this.box(this.piers, x - normal.x * 2.64, y - normal.y * 2.64, z - normal.z * 2.64, deckWidth, 1.2, 4, sample);
  }

  private box(mesh: InstancedMesh, x: number, y: number, z: number, width: number, height: number, length: number, sample?: RoadSample): void {
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Bridge instance capacity exceeded');
    const frame = sample ? roadFrame(sample) : { right: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
    const { right: r, normal: n } = frame;
    const scale = sample ? Math.hypot(1, sample.grade) : 1;
    const b = sample ? { x: -Math.sin(sample.heading) / scale, y: -sample.grade / scale, z: Math.cos(sample.heading) / scale } : { x: 0, y: 0, z: 1 };
    this.matrix.set(r.x * width, n.x * height, b.x * length, x - this.anchorX,
      r.y * width, n.y * height, b.y * length, y,
      r.z * width, n.z * height, b.z * length, z - this.anchorZ, 0, 0, 0, 1);
    mesh.setMatrixAt(mesh.count++, this.matrix);
  }

  dispose(): void {
    for (const mesh of [this.deck, this.piers, this.details]) { mesh.removeFromParent(); mesh.dispose(); }
    this.details.material.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
