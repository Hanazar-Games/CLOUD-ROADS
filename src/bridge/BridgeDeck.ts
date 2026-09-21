import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, type MeshStandardMaterial } from 'three';
import type { BridgeSpan } from './BridgeDetector';
import { roadFrame } from '../road/RoadFrame';
import { roadProfile } from '../road/RoadProfile';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { bridgeDeckDepth } from './BridgeProfile';

export class BridgeDeck extends Mesh<BufferGeometry, MeshStandardMaterial> {
  private readonly profile;
  private readonly depth;

  constructor(material: MeshStandardMaterial, options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    super(new BufferGeometry(), material);
    this.profile = roadProfile(options);
    this.depth = bridgeDeckDepth(options);
    for (const name of ['position', 'normal']) this.geometry.setAttribute(name, new BufferAttribute(new Float32Array(0), 3).setUsage(DynamicDrawUsage));
    this.geometry.setIndex(new BufferAttribute(new Uint32Array(0), 1).setUsage(DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
  }

  rebuild(spans: readonly BridgeSpan[], anchorX: number, anchorZ: number): void {
    const width = this.profile.halfWidth * 2 + 0.8;
    const section = [[-width / 2, -0.04], [width / 2, -0.04], [width / 2, -0.55],
      [width * 0.32, -this.depth], [-width * 0.32, -this.depth], [-width / 2, -0.55]];
    const vertices = spans.reduce((sum, span) => sum + span.samples.length * 12 + 12, 0) * this.profile.centers.length;
    const indices = spans.reduce((sum, span) => sum + (span.samples.length - 1) * 36 + 24, 0) * this.profile.centers.length;
    const vertexCapacity = this.geometry.getAttribute('position').count, indexCapacity = this.geometry.getIndex()!.count;
    if (vertices > vertexCapacity || indices > indexCapacity) {
      this.geometry.dispose();
      this.geometry = new BufferGeometry();
      const capacity = 2 ** Math.ceil(Math.log2(Math.max(vertices, vertexCapacity)));
      for (const name of ['position', 'normal']) this.geometry.setAttribute(name, new BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage));
      this.geometry.setIndex(new BufferAttribute(new Uint32Array(2 ** Math.ceil(Math.log2(Math.max(indices, indexCapacity)))), 1).setUsage(DynamicDrawUsage));
    }
    const positions = this.geometry.getAttribute('position') as BufferAttribute;
    const normals = this.geometry.getAttribute('normal') as BufferAttribute;
    const index = this.geometry.getIndex()!;
    let vertex = 0, triangle = 0;
    const face = (a: number, b: number, c: number) => { index.setX(triangle++, a); index.setX(triangle++, b); index.setX(triangle++, c); };
    for (const span of spans) for (const center of this.profile.centers) {
      const base = vertex;
      for (const sample of span.samples) {
        const { right: r, normal: n } = roadFrame(sample), p = sample.position;
        for (let side = 0; side < 6; side++) {
          const a = section[side], b = section[(side + 1) % 6], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
          for (const [offset, height] of [a, b]) {
            positions.setXYZ(vertex, p.x - anchorX + r.x * (center + offset) + n.x * height,
              p.y + r.y * (center + offset) + n.y * height, p.z - anchorZ + r.z * (center + offset) + n.z * height);
            normals.setXYZ(vertex++, (-r.x * dy + n.x * dx) / length, (-r.y * dy + n.y * dx) / length, (-r.z * dy + n.z * dx) / length);
          }
        }
      }
      for (let row = 1; row < span.samples.length; row++) for (let side = 0; side < 6; side++) {
        const a = base + (row - 1) * 12 + side * 2, b = a + 12;
        face(a, a + 1, b); face(a + 1, b + 1, b);
      }
      for (const [sample, direction] of [[span.start, -1], [span.end, 1]] as const) {
        const { right: r, normal: n } = roadFrame(sample), p = sample.position, cap = vertex;
        for (const [offset, height] of section) {
          positions.setXYZ(vertex, p.x - anchorX + r.x * (center + offset) + n.x * height,
            p.y + r.y * (center + offset) + n.y * height, p.z - anchorZ + r.z * (center + offset) + n.z * height);
          normals.setXYZ(vertex++, sample.tangent.x * direction, sample.tangent.y * direction, sample.tangent.z * direction);
        }
        for (let i = 1; i < 5; i++) {
          if (direction < 0) face(cap, cap + i + 1, cap + i); else face(cap, cap + i, cap + i + 1);
        }
      }
    }
    (positions.array as Float32Array).fill(0, vertex * 3);
    for (const attribute of [positions, normals, index]) {
      attribute.clearUpdateRanges(); attribute.addUpdateRange(0, attribute === index ? triangle : vertex * 3); attribute.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, triangle);
    if (triangle) { this.geometry.computeBoundingBox(); this.geometry.computeBoundingSphere(); }
  }
}
