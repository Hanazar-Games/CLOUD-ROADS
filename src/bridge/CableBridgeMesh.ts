import { BoxGeometry, CylinderGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3, type Scene } from 'three';
import type { RoadSample } from '../road/RoadSegment';
import type { BridgeSpan } from './BridgeDetector';
import type { RoadTerrain } from '../road/RoadGenerator';
import type { RoadCorridor } from '../road/RoadCorridor';
import { roadProfile } from '../road/RoadProfile';
import type { WorldOptions } from '../world/WorldOptions';
import { bridgeDeckDepth, BRIDGE_SPACING } from './BridgeProfile';

interface CableSpan { routeId?: string; start: number; end: number; towers: RoadSample[]; at: (distance: number) => RoadSample }

export function cableSpans(spans: readonly BridgeSpan[], terrain: RoadTerrain, corridor: RoadCorridor, options: Readonly<WorldOptions>): CableSpan[] {
  const result: CableSpan[] = [], visited = new Set<string>(), profile = roadProfile(options);
  for (const span of spans) for (const anchor of span.samples) {
    const plan = anchor.structure;
    if (plan?.kind !== 'bridge' || Math.abs(plan.grade) > 0.01 || plan.end - plan.start < 480
      || anchor.distance < plan.start || anchor.distance > plan.end || Math.abs(anchor.curvature) > 1e-8
      || Math.abs(anchor.heading - plan.heading) > 1e-8 || Math.abs(anchor.grade - plan.grade) > 1e-8) continue;
    const key = `${anchor.routeId ?? ''}:${plan.start}`;
    if (visited.has(key)) continue;
    const length = plan.end - plan.start >= 960 ? 576 : 384;
    const center = Math.round((plan.start + plan.end) / (2 * BRIDGE_SPACING)) * BRIDGE_SPACING;
    const start = center - length / 2, end = center + length / 2;
    if (start < plan.start + 24 || end > plan.end - 24 || end < span.start.distance || start > span.end.distance) continue;
    visited.add(key);
    const speed = Math.hypot(1, plan.grade), sin = Math.sin(plan.heading), cos = Math.cos(plan.heading);
    const at = (distance: number): RoadSample => {
      const along = (distance - anchor.distance) / speed;
      return { ...anchor, distance, bank: 0, curvature: 0, tangent: { x: sin / speed, y: plan.grade / speed, z: -cos / speed },
        position: { x: anchor.position.x + sin * along, y: anchor.position.y + plan.grade * along, z: anchor.position.z - cos * along } };
    };
    const towers = [at(center - length / 4), at(center + length / 4)];
    if (towers.some(s => corridor.crossesBelow(s, profile.outerHalfWidth + 20)
      || profile.centers.some(offset => s.position.y - terrain.sample(s.position.x + cos * offset, s.position.z + sin * offset) <= 200))) continue;
    if (span.samples.some(s => s.distance >= start && s.distance <= end && (Math.abs(s.curvature) > 1e-8 || Math.abs(s.bank) > 1e-8
      || Math.abs(s.grade - plan.grade) > 1e-8 || Math.abs(s.heading - plan.heading) > 1e-8))) continue;
    if (Array.from({ length: 37 }, (_, i) => at(start + length * i / 36)).some(s => profile.centers.some(offset =>
      s.position.y - terrain.sample(s.position.x + cos * offset, s.position.z + sin * offset) < 8))) continue;
    result.push({ routeId: anchor.routeId, start, end, towers, at });
  }
  return result;
}

export class CableBridgeMesh {
  readonly towers: InstancedMesh;
  readonly stays: InstancedMesh;
  spanCount = 0;
  private readonly matrix = new Matrix4();
  private anchorX = 0; private anchorZ = 0;
  private readonly profile;
  constructor(scene: Scene, material: MeshStandardMaterial, private readonly options: Readonly<WorldOptions>) {
    this.profile = roadProfile(options);
    this.towers = new InstancedMesh(new BoxGeometry(), material, 1024);
    this.stays = new InstancedMesh(new CylinderGeometry(0.5, 0.5, 1, 6), new MeshStandardMaterial({ color: 0xc6ced0, metalness: 0.55, roughness: 0.45 }), 8192);
    for (const mesh of [this.towers, this.stays]) {
      mesh.count = 0; mesh.visible = false; mesh.castShadow = mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage); scene.add(mesh);
    }
  }

  rebuild(spans: readonly CableSpan[], anchorX: number, anchorZ: number): void {
    this.anchorX = anchorX; this.anchorZ = anchorZ; this.towers.count = this.stays.count = 0; this.spanCount = spans.length;
    for (const span of spans) for (const tower of span.towers) {
      const width = this.profile.outerHalfWidth * 2 + 0.8, reach = (span.end - span.start) / 4, height = reach * 0.42;
      const cos = Math.cos(tower.heading), sin = Math.sin(tower.heading);
      const point = (sample: RoadSample, offset: number, y: number) => new Vector3(sample.position.x + cos * offset, sample.position.y + y, sample.position.z + sin * offset);
      const column = 2.2 + reach / 120, lateral = width / 2 + column / 2 + 0.3;
      for (const side of [-1, 1]) {
        this.beam(this.towers, point(tower, side * lateral, -bridgeDeckDepth(this.options) - 0.51), point(tower, side * lateral, height), column, column * 1.15, tower.heading);
        for (const direction of [-1, 1]) for (let i = 1; i <= 12; i++) {
          const along = reach * i / 12, attach = span.at(tower.distance + direction * along);
          this.beam(this.stays, point(tower, side * lateral, height * (0.55 + i / 12 * 0.38)), point(attach, side * (width / 2 - 0.1), 0.35), 0.24, 0.24, tower.heading);
        }
      }
      for (const y of [12, height - 1.4]) this.beam(this.towers, point(tower, -lateral, y), point(tower, lateral, y), column, 2.8, tower.heading);
    }
    for (const mesh of [this.towers, this.stays]) {
      mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16); mesh.instanceMatrix.needsUpdate = true;
      if (mesh.count) mesh.computeBoundingSphere();
    }
  }

  private beam(mesh: InstancedMesh, a: Vector3, b: Vector3, width: number, depth: number, heading: number): void {
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Cable bridge capacity exceeded');
    const direction = b.clone().sub(a), length = direction.length(); direction.normalize();
    const x = new Vector3(Math.cos(heading), 0, Math.sin(heading));
    if (Math.abs(x.dot(direction)) > 0.98) x.set(-Math.sin(heading), 0, Math.cos(heading));
    x.addScaledVector(direction, -x.dot(direction)).normalize(); const z = x.clone().cross(direction);
    const center = a.clone().add(b).multiplyScalar(0.5); center.x -= this.anchorX; center.z -= this.anchorZ;
    this.matrix.set(x.x * width, direction.x * (length + 0.02), z.x * depth, center.x,
      x.y * width, direction.y * (length + 0.02), z.y * depth, center.y,
      x.z * width, direction.z * (length + 0.02), z.z * depth, center.z, 0, 0, 0, 1);
    mesh.setMatrixAt(mesh.count++, this.matrix);
  }

  update(originX: number, originZ: number, visible: boolean): void {
    for (const mesh of [this.towers, this.stays]) { mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ); mesh.visible = visible && mesh.count > 0; }
  }
  dispose(): void {
    for (const mesh of [this.towers, this.stays]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
    (this.stays.material as MeshStandardMaterial).dispose();
  }
}
