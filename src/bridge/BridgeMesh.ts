import { BoxGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, type Scene } from 'three';
import { MAX_ROAD_SEGMENTS } from '../road/RoadSpine';
import { ROAD_SAMPLES, type RoadSample } from '../road/RoadSegment';
import { roadFrame } from '../road/RoadFrame';
import type { RoadCorridor } from '../road/RoadCorridor';
import type { RoadTerrain } from '../road/RoadGenerator';
import type { BridgeSpan } from './BridgeDetector';

const CAPACITY = MAX_ROAD_SEGMENTS * ROAD_SAMPLES;

export class BridgeMesh {
  private readonly geometry = new BoxGeometry();
  private readonly material = new MeshStandardMaterial({ color: 0xa8a99c, roughness: 0.92 });
  readonly deck = new InstancedMesh(this.geometry, this.material, CAPACITY * 3);
  readonly piers = new InstancedMesh(this.geometry, this.material, CAPACITY);
  private readonly matrix = new Matrix4();
  private version = -1;
  private anchorX = 0;
  private anchorZ = 0;

  constructor(scene: Scene) {
    for (const mesh of [this.deck, this.piers]) {
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
      this.deck.count = this.piers.count = 0;
      for (const span of spans) {
        for (let i = 1; i < span.samples.length; i++) {
          const a = span.samples[i - 1], b = span.samples[i], sample = this.between(a, b, 0.5);
          const { right, normal } = roadFrame(sample), { x, y, z } = sample.position;
          const length = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z)
            + 11.4 * Math.sin(Math.abs(b.heading - a.heading) / 2) + 0.03;
          this.box(this.deck, x - normal.x * 1.04, y - normal.y * 1.04, z - normal.z * 1.04, 11.2, 2, length, sample);
          for (const side of [-5.45, 5.45]) this.box(this.deck, x + right.x * side + normal.x * 0.45,
            y + right.y * side + normal.y * 0.45, z + right.z * side + normal.z * 0.45, 0.35, 0.8, length, sample);
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
      for (const mesh of [this.deck, this.piers]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.count) { mesh.computeBoundingBox(); mesh.computeBoundingSphere(); }
      }
    }
    for (const mesh of [this.deck, this.piers]) {
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
    const { x, y, z } = sample.position;
    const ground = (px: number, pz: number) => {
      const natural = terrain.sample(px, pz);
      return Math.min(natural, corridor.height(px, pz, natural));
    };
    const width = abutment ? 11.2 : Math.min(6, Math.max(3.2, (y - ground(x, z)) * 0.012));
    const footing = width + 2;
    let bottom = Math.min(ground(x, z), y - 5);
    for (const dx of [-footing / 2, footing / 2]) for (const dz of [-footing / 2, footing / 2]) bottom = Math.min(bottom, ground(x + dx, z + dz));
    bottom -= 4;
    const top = y - 2.64, base = bottom + 2;
    this.box(this.piers, x, bottom + 1.5, z, footing, 3, footing);
    this.box(this.piers, x, (base + top) / 2, z, width, top - base, abutment ? 4 : width);
    const { normal } = roadFrame(sample);
    this.box(this.piers, x - normal.x * 2.64, y - normal.y * 2.64, z - normal.z * 2.64, 11.2, 1.2, 4, sample);
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
    for (const mesh of [this.deck, this.piers]) { mesh.removeFromParent(); mesh.dispose(); }
    this.geometry.dispose();
    this.material.dispose();
  }
}
