import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, Vector2, type Scene } from 'three';
import { MAX_ROAD_SEGMENTS } from '../road/RoadSpine';
import { ROAD_SAMPLES, type RoadSample } from '../road/RoadSegment';
import { roadFrame } from '../road/RoadFrame';
import type { RoadCorridor } from '../road/RoadCorridor';
import type { RoadTerrain } from '../road/RoadGenerator';
import type { BridgeSpan } from './BridgeDetector';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { roadProfile } from '../road/RoadProfile';
import { bridgeSpacing, bridgeTier } from './BridgeProfile';
import { BridgeDeck } from './BridgeDeck';
import { createConcreteMaterial } from './ConcreteMaterial';
import { isServiceAccess } from '../road/RoadProtection';

const CAPACITY = MAX_ROAD_SEGMENTS * ROAD_SAMPLES;
const RAIL_COLORS = [new Color(0x81949e), new Color(0xb0bec6), new Color(0xbb302b)];

export class BridgeMesh {
  private readonly geometry = new BoxGeometry();
  private readonly materialOrigin = new Vector2();
  private readonly material = createConcreteMaterial(this.materialOrigin);
  readonly deck: BridgeDeck;
  readonly parapets: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  readonly piers: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  readonly columns: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  readonly details: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  readonly railings: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  private readonly heights = new Map<number, number>();
  private readonly profile;
  private readonly matrix = new Matrix4();
  private version = -1;
  private anchorX = 0;
  private anchorZ = 0;
  private supports = 0;

  constructor(scene: Scene, private readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.profile = roadProfile(options);
    this.deck = new BridgeDeck(this.material, options);
    this.parapets = new InstancedMesh(this.geometry, this.material, CAPACITY * 3);
    this.piers = new InstancedMesh(this.geometry, this.material, CAPACITY * this.profile.centers.length * 2);
    const column = new BoxGeometry(), vertices = column.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const taper = vertices.getY(i) > 0 ? 0.7 : 1;
      vertices.setXYZ(i, vertices.getX(i) * taper, vertices.getY(i), vertices.getZ(i) * taper);
    }
    column.computeVertexNormals();
    this.columns = new InstancedMesh(column, this.material, CAPACITY * this.profile.centers.length);
    this.details = new InstancedMesh(this.geometry, new MeshStandardMaterial({ color: 0x586a71, metalness: 0.45, roughness: 0.6 }), CAPACITY * 8);
    this.railings = new InstancedMesh(this.geometry, new MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.44 }), CAPACITY * 12);
    this.deck.visible = false;
    this.deck.castShadow = this.deck.receiveShadow = true;
    scene.add(this.deck);
    for (const mesh of [this.parapets, this.piers, this.columns, this.details, this.railings]) {
      mesh.count = 0;
      mesh.visible = false;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      scene.add(mesh);
    }
  }

  get pierCount(): number { return this.supports; }

  update(spans: readonly BridgeSpan[], corridor: RoadCorridor, terrain: RoadTerrain, version: number,
    originX: number, originZ: number, nearRoute: boolean, services: readonly { start: number; end: number }[] = []): void {
    if (this.version !== version) {
      this.version = version;
      this.anchorX = spans[0]?.start.position.x ?? 0;
      this.anchorZ = spans[0]?.start.position.z ?? 0;
      this.parapets.count = this.piers.count = this.columns.count = this.details.count = this.railings.count = this.supports = 0;
      this.deck.rebuild(spans, this.anchorX, this.anchorZ);
      const active = new Set<number>();
      const heightAt = (sample: RoadSample) => {
        active.add(sample.distance);
        let height = this.heights.get(sample.distance);
        if (height === undefined) {
          const { right } = roadFrame(sample), { x, y, z } = sample.position;
          height = Math.max(...this.profile.centers.map(center => y + right.y * center - terrain.sample(x + right.x * center, z + right.z * center)));
          this.heights.set(sample.distance, height);
        }
        return height;
      };
      const deckWidth = this.profile.halfWidth * 2 + 0.8;
      for (const span of spans) {
        for (let i = 1; i < span.samples.length; i++) {
          const a = span.samples[i - 1], b = span.samples[i], sample = this.between(a, b, 0.5);
          const { right, normal } = roadFrame(sample), { x, y, z } = sample.position;
          const tier = bridgeTier(heightAt(sample)), color = RAIL_COLORS[tier];
          const length = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z)
            + (this.profile.outerHalfWidth * 2 + 1) * Math.sin(Math.abs(b.heading - a.heading) / 2) + 0.03;
          for (const center of this.profile.centers) {
            const sides = this.profile.centers.length === 1 ? [-deckWidth / 2 + 0.15, deckWidth / 2 - 0.15]
              : [center + Math.sign(center) * (deckWidth / 2 - 0.15)];
            for (const side of sides) {
              if (isServiceAccess(this.options, services, sample.distance, Math.sign(side))) continue;
              const base = tier ? 0.12 : 0.45;
              this.box(this.parapets, x + right.x * side + normal.x * base,
                y + right.y * side + normal.y * base, z + right.z * side + normal.z * base, 0.35, tier ? 0.2 : 0.8, length, sample);
              for (const level of tier ? [0.4, 0.92, 1.45] : [1.35]) this.railing(sample, side, level, 0.16, 0.16, length, color);
              if (Math.floor(a.distance / 4) !== Math.floor(b.distance / 4)) this.railing(sample, side, tier ? 0.8 : 1.1, 0.18, tier ? 1.5 : 0.6, 0.18, color);
              if (tier) for (const direction of [-1, 1]) this.railing(sample, side, 0.92, 0.09, 0.09,
                Math.hypot(length, 0.9), color, direction * Math.atan2(0.9, length));
            }
            if (Math.abs(sample.curvature) > 0.0015 && Math.floor(a.distance / 24) !== Math.floor(b.distance / 24)) {
              this.box(this.parapets, x + right.x * center - normal.x * 2.4, y + right.y * center - normal.y * 2.4,
                z + right.z * center - normal.z * 2.4, deckWidth * 0.9, 1.15, 0.65, sample);
            }
          }
        }
        if (!span.openStart) this.support(span.start, true, corridor, terrain);
        let index = 1;
        const first = span.start.distance + (span.openStart ? 0 : 12), last = span.end.distance - (span.openEnd ? 0 : 12);
        for (let distance = Math.ceil(first / 48) * 48; distance < last - 1e-6; distance += 48) {
          while (span.samples[index].distance < distance) index++;
          const a = span.samples[index - 1], b = span.samples[index];
          const point = this.between(a, b, (distance - a.distance) / (b.distance - a.distance));
          if (distance % bridgeSpacing(heightAt(point)) !== 0) continue;
          this.support(point, false, corridor, terrain);
        }
        if (!span.openEnd) this.support(span.end, true, corridor, terrain);
      }
      for (const distance of this.heights.keys()) if (!active.has(distance)) this.heights.delete(distance);
      if (this.railings.instanceColor) { this.railings.instanceColor.setUsage(DynamicDrawUsage); this.railings.instanceColor.needsUpdate = true; }
      for (const mesh of [this.parapets, this.piers, this.columns, this.details, this.railings]) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.count) { mesh.computeBoundingBox(); mesh.computeBoundingSphere(); }
      }
    }
    this.materialOrigin.set(originX % 4096, originZ % 4096);
    this.deck.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
    this.deck.visible = nearRoute && this.deck.geometry.drawRange.count > 0;
    for (const mesh of [this.parapets, this.piers, this.columns, this.details, this.railings]) {
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
    const height = y - ground(x, z), tier = bridgeTier(height), tall = !abutment && tier > 0;
    const width = abutment ? deckWidth : Math.min(deckWidth * (tier === 2 ? 0.58 : 0.48), Math.max(tier === 2 ? 3.2 : 2.4, height * (tier === 2 ? 0.024 : 0.016)));
    const separation = tall ? deckWidth * (tier === 2 ? 0.31 : 0.27) : 0;
    const footing = width + separation * 2 + 2;
    let bottom = Math.min(ground(x, z), y - 5);
    for (const dx of [-footing / 2, footing / 2]) for (const dz of [-footing / 2, footing / 2]) bottom = Math.min(bottom, ground(x + dx, z + dz));
    bottom -= 4;
    const base = bottom + 2;
    this.box(this.piers, x, bottom + 1.5, z, footing, 3, footing);
    const upright = { ...sample, grade: 0, bank: 0 }, verticalFrame = roadFrame(upright), { right, normal } = roadFrame(sample);
    for (const offset of tall ? [-separation, separation] : [0]) {
      const dx = verticalFrame.right.x * offset, dz = verticalFrame.right.z * offset;
      const top = y - (4.65 + normal.x * dx + normal.z * dz) / normal.y
        + (Math.abs(normal.x) + Math.abs(normal.z)) * width / (2 * normal.y) + 0.02;
      this.box(this.columns, x + dx, (base + top) / 2, z + dz, width, top - base, abutment ? 4 : width, upright);
    }
    const bracing = tier === 2 ? 28 : 38;
    if (tall) for (let level = base + bracing; level < y - 22.65; level += bracing) this.box(this.piers,
      x, level, z, separation * 2 + width * 0.75, tier === 2 ? 2.2 : 1.5, width * 0.85, upright);
    this.box(this.piers, x - normal.x * 4.05, y - normal.y * 4.05, z - normal.z * 4.05,
      Math.max(deckWidth, separation * 2 + width * 0.7 + 1), 1.2, tier === 2 ? 6 : 4, sample);
    for (const offset of [-deckWidth * 0.28, deckWidth * 0.28]) this.box(this.details,
      x + right.x * offset - normal.x * 3.2, y + right.y * offset - normal.y * 3.2, z + right.z * offset - normal.z * 3.2,
      1.2, 0.5, 1.4, sample);
    this.box(this.details, x + normal.x * 0.015, y + normal.y * 0.015, z + normal.z * 0.015,
      deckWidth - 0.8, 0.02, 0.09, sample);
    this.supports++;
  }

  private railing(sample: RoadSample, side: number, level: number, width: number, height: number, length: number, color: Color, tilt = 0): void {
    const { right, normal } = roadFrame(sample), { x, y, z } = sample.position;
    this.box(this.railings, x + right.x * side + normal.x * level, y + right.y * side + normal.y * level,
      z + right.z * side + normal.z * level, width, height, length, sample, tilt);
    this.railings.setColorAt(this.railings.count - 1, color);
  }

  private box(mesh: InstancedMesh, x: number, y: number, z: number, width: number, height: number, length: number, sample?: RoadSample, tilt = 0): void {
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Bridge instance capacity exceeded');
    const frame = sample ? roadFrame(sample) : { right: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
    const { right: r, normal: n } = frame;
    const scale = sample ? Math.hypot(1, sample.grade) : 1;
    const b = sample ? { x: -Math.sin(sample.heading) / scale, y: -sample.grade / scale, z: Math.cos(sample.heading) / scale } : { x: 0, y: 0, z: 1 };
    const c = Math.cos(tilt), s = Math.sin(tilt);
    this.matrix.set(r.x * width, (n.x * c - b.x * s) * height, (b.x * c + n.x * s) * length, x - this.anchorX,
      r.y * width, (n.y * c - b.y * s) * height, (b.y * c + n.y * s) * length, y,
      r.z * width, (n.z * c - b.z * s) * height, (b.z * c + n.z * s) * length, z - this.anchorZ, 0, 0, 0, 1);
    mesh.setMatrixAt(mesh.count++, this.matrix);
  }

  dispose(): void {
    this.deck.removeFromParent(); this.deck.geometry.dispose();
    for (const mesh of [this.parapets, this.piers, this.columns, this.details, this.railings]) { mesh.removeFromParent(); mesh.dispose(); }
    this.heights.clear(); this.railings.material.dispose();
    this.columns.geometry.dispose();
    this.details.material.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
