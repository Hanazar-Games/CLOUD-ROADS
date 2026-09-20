import { BoxGeometry, CylinderGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3, type Scene } from 'three';
import type { BridgeSpan } from './BridgeDetector';
import type { RoadSample } from '../road/RoadSegment';
import type { RoadTerrain } from '../road/RoadGenerator';
import { roadProfile } from '../road/RoadProfile';
import { roadFrame } from '../road/RoadFrame';
import { RoadIndex } from '../road/RoadIndex';
import type { WorldOptions } from '../world/WorldOptions';

export const CABLE_SPACING = 384;

export class CableBridgeMesh {
  readonly towers: InstancedMesh;
  readonly cables = new InstancedMesh(new CylinderGeometry(0.5, 0.5, 1, 5),
    new MeshStandardMaterial({ color: 0xd9dddc, metalness: 0.62, roughness: 0.38 }), 16384);
  towerCount = 0;
  private readonly matrix = new Matrix4();
  private readonly profile;
  private anchorX = 0; private anchorZ = 0;

  constructor(scene: Scene, material: MeshStandardMaterial, options: Readonly<WorldOptions>) {
    this.profile = roadProfile(options);
    this.towers = new InstancedMesh(new BoxGeometry(), material, 16384);
    for (const mesh of [this.towers, this.cables]) {
      mesh.count = 0; mesh.visible = false; mesh.castShadow = mesh === this.towers; mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage); scene.add(mesh);
    }
  }

  reset(anchorX: number, anchorZ: number): void {
    this.anchorX = anchorX; this.anchorZ = anchorZ;
    this.towers.count = this.cables.count = this.towerCount = 0;
  }

  add(sample: RoadSample, span: BridgeSpan, terrain: RoadTerrain): void {
    const p = sample.position, shaft = Math.max(3.6, Math.min(10, (p.y - terrain.sample(p.x, p.z)) * 0.014));
    const half = this.profile.outerHalfWidth + shaft / 2 + 1.2;
    const r = { x: Math.cos(sample.heading), z: Math.sin(sample.heading) };
    const local = span.samples.filter(s => Math.abs(s.distance - sample.distance) <= CABLE_SPACING / 2 + 8);
    const road = new RoadIndex(local.slice(1).map((s, i) => ({ a: local[i].position, b: s.position })));
    const top = Math.max(p.y + 78, ...local.map(s => s.position.y + 68));
    const tapered = Math.floor(sample.distance / CABLE_SPACING) % 2 === 1;
    const topHalf = tapered ? half * 0.35 : half;
    const point = (side: number, width: number, y: number) => new Vector3(p.x + r.x * side * width, y, p.z + r.z * side * width);
    const footingHalf = shaft * 1.25;
    const base = Math.min(...[-1, 1].flatMap(side => [-footingHalf, footingHalf].flatMap(dx => [-footingHalf, footingHalf].map(dz =>
      terrain.sample(p.x + r.x * side * half + dx, p.z + r.z * side * half + dz))))) - 5;
    for (const side of [-1, 1]) {
      this.beam(this.towers, point(side, half, base), point(side, half, base + 4), shaft * 2.5, shaft * 2.5);
      this.beam(this.towers, point(side, half, base + 3), point(side, half, p.y + 9), shaft, shaft * 1.2);
      this.beam(this.towers, point(side, half, p.y + 9), point(side, topHalf, top), shaft * 0.8, shaft);
    }
    for (let y = base + 48; y < p.y - 28; y += 48) this.beam(this.towers, point(-1, half, y), point(1, half, y), 2.6, 3.8);
    const { right, normal } = roadFrame(sample);
    const cap = (side: number) => new Vector3(p.x + right.x * side * half - normal.x * 4,
      p.y + right.y * side * half - normal.y * 4, p.z + right.z * side * half - normal.z * 4);
    this.beam(this.towers, cap(-1), cap(1), 2.2, 6);
    this.beam(this.towers, point(-1, topHalf, top - 2), point(1, topHalf, top - 2), 3, 4);
    for (const side of [-1, 1]) for (const direction of [-1, 1]) for (let reach = 24; reach <= 168; reach += 24) {
      const distance = sample.distance + direction * reach;
      const index = local.findIndex(s => s.distance >= distance);
      if (index < 1) continue;
      const a = local[index - 1], b = local[index], t = (distance - a.distance) / (b.distance - a.distance);
      const heading = a.heading + (b.heading - a.heading) * t, y = a.position.y + (b.position.y - a.position.y) * t;
      const offset = side * (this.profile.outerHalfWidth + 0.65);
      const anchor = new Vector3(a.position.x + (b.position.x - a.position.x) * t + Math.cos(heading) * offset,
        y + 0.55 + (a.bank + (b.bank - a.bank) * t) * offset, a.position.z + (b.position.z - a.position.z) * t + Math.sin(heading) * offset);
      const head = point(side, topHalf, top - 7 - (168 - reach) * 0.1);
      let clear = true;
      const steps = Math.ceil(head.distanceTo(anchor) / 2);
      for (let i = 1; i <= steps; i++) {
        const q = head.clone().lerp(anchor, i / steps), nearest = road.nearest(q.x, q.z, this.profile.outerHalfWidth);
        if (!nearest || nearest.distanceSquared > (this.profile.outerHalfWidth - 0.2) ** 2) continue;
        const s = local[nearest.index], end = local[nearest.index + 1], { normal } = roadFrame(s);
        const x = s.position.x + (end.position.x - s.position.x) * nearest.t, z = s.position.z + (end.position.z - s.position.z) * nearest.t;
        const surface = s.position.y + (end.position.y - s.position.y) * nearest.t - (normal.x * (q.x - x) + normal.z * (q.z - z)) / normal.y;
        if (q.y < surface + 7 && q.y > surface - 2) { clear = false; break; }
      }
      if (clear) this.beam(this.cables, anchor, head, 0.19, 0.19);
    }
    this.towerCount++;
  }

  private beam(mesh: InstancedMesh, a: Vector3, b: Vector3, width: number, depth: number): void {
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Cable bridge capacity exceeded');
    const y = b.clone().sub(a), length = y.length(); y.normalize();
    const x = new Vector3(0, 0, 1).cross(y);
    if (x.lengthSq() < 0.01) x.set(1, 0, 0).cross(y);
    x.normalize(); const z = x.clone().cross(y).normalize(), middle = a.clone().add(b).multiplyScalar(0.5);
    this.matrix.set(x.x * width, y.x * length, z.x * depth, middle.x - this.anchorX,
      x.y * width, y.y * length, z.y * depth, middle.y,
      x.z * width, y.z * length, z.z * depth, middle.z - this.anchorZ, 0, 0, 0, 1);
    mesh.setMatrixAt(mesh.count++, this.matrix);
  }

  update(originX: number, originZ: number, visible: boolean, changed: boolean): void {
    for (const mesh of [this.towers, this.cables]) {
      if (changed) {
        mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16); mesh.instanceMatrix.needsUpdate = true;
        if (mesh.count) mesh.computeBoundingSphere();
      }
      mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ); mesh.visible = visible && mesh.count > 0;
    }
  }

  dispose(): void {
    for (const mesh of [this.towers, this.cables]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
    (this.cables.material as MeshStandardMaterial).dispose();
  }
}
