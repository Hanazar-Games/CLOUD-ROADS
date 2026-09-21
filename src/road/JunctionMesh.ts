import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, type Scene } from 'three';
import type { Junction, NetworkRoute } from './RoadNetwork';
import type { RoadSample } from './RoadSegment';
import { roadFrame } from './RoadFrame';
import { roadProfile } from './RoadProfile';
import type { WorldOptions } from '../world/WorldOptions';

export class JunctionMesh {
  readonly parts = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0.15 }), 2048);
  readonly markings = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xeeeedd, roughness: 0.9 }), 4096);
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private readonly profile;
  private version = -1;
  private x = 0;
  private z = 0;

  constructor(scene: Scene, options: Readonly<WorldOptions>) {
    this.profile = roadProfile(options);
    for (const mesh of [this.parts, this.markings]) { mesh.count = 0; mesh.visible = false; mesh.receiveShadow = true; scene.add(mesh); }
    this.parts.castShadow = true;
  }

  update(junctions: readonly Junction[], routes: readonly NetworkRoute[], version: number, originX: number, originZ: number): void {
    if (this.version !== version) {
      this.version = version;
      this.x = junctions[0]?.sample.position.x ?? 0; this.z = junctions[0]?.sample.position.z ?? 0;
      this.parts.count = this.markings.count = 0;
      const width = this.profile.outerHalfWidth;
      for (const junction of junctions) {
        const road = routes.find(route => route.id === junction.route)?.road;
        const branch = routes.find(route => route.id === junction.exits[0])?.road;
        if (!road || !branch) continue;
        const at = (distance: number) => road.segments.find(s => distance >= s.start.distance && distance <= s.end.distance)?.atDistance(distance);
        const approach = at(junction.distance - 90);
        if (approach) {
          for (const side of [-1, 1]) {
            this.box(this.parts, approach, side * (width + 1.8), 3.5, 0.38, 7, 0.38, 0x78868b);
            this.box(this.parts, approach, side * (width + 1.8), 0.25, 0.8, 0.5, 0.8, 0xb4b2a7);
          }
          for (const height of [6.4, 7]) this.box(this.parts, approach, 0, height, width * 2 + 4, 0.18, 0.26, 0x78868b);
          for (let offset = -width; offset <= width; offset += 2) this.box(this.parts, approach, offset, 6.7, 0.12, 0.7, 0.16, 0x78868b);
        }
        for (const ahead of [160, 80]) {
          const sample = at(junction.distance - ahead);
          if (!sample) continue;
          const lane = this.profile.centers.at(-1)! + (this.profile.halfWidth - 1.2) / 2;
          this.box(this.markings, sample, lane, 0.03, 0.16, 0.025, 6);
          for (const side of [-1, 1]) this.box(this.markings, sample, lane + side * 0.5, 0.035, 0.16, 0.025, 1.5, 0xeeeedd, -side * 0.75, 2.1);
          this.box(this.markings, sample, lane + 0.85, 0.035, 0.16, 0.025, 2.8, 0xeeeedd, 0.75, 0.7);
          for (const side of [-1, 1]) this.box(this.markings, sample, lane + 1.8 - Math.sin(0.75) * 0.5 + side * Math.cos(0.75) * 0.35,
            0.035, 0.16, 0.025, 1.2, 0xeeeedd, 0.75 - side * 0.6, 1.75 - Math.cos(0.75) * 0.5 - side * Math.sin(0.75) * 0.35);
        }
        for (let distance = 8; distance < 260; distance += 12) {
          const sample = at(junction.distance + distance);
          if (sample) this.box(this.markings, sample, width - 1.2, 0.04, 0.23, 0.025, 4);
        }
        const terminal = at(junction.distance + 285);
        if (terminal) {
          this.box(this.parts, terminal, width + 0.35, 0.47, 0.65, 0.78, 3.6, 0xddaf40);
          for (let i = -1; i <= 1; i++) this.box(this.parts, terminal, width + 0.35, 0.88, 0.68, 0.04, 0.4, 0x303a3c, 0, i);
        }
        for (let distance = 60; distance <= 240; distance += 12) {
          const sample = branch.segments.find(s => s.start.distance <= distance && s.end.distance >= distance)?.atDistance(distance);
          if (!sample) continue;
          this.box(this.markings, sample, width - 1.2, 0.04, 0.22, 0.025, 4);
          // Hatch the inside shoulder only after it separates from the main road.
          const parent = road.nearest(sample.position.x, sample.position.z)!;
          if (Math.hypot(parent.position.x - sample.position.x, parent.position.z - sample.position.z) > width * 2 - 2)
            this.box(this.markings, sample, -width + 0.65, 0.04, 0.15, 0.025, 1.4, 0xeeeedd, 0.65);
        }
      }
      for (const mesh of [this.parts, this.markings]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (mesh.count) mesh.computeBoundingSphere();
      }
    }
    for (const mesh of [this.parts, this.markings]) { mesh.position.set(this.x - originX, 0, this.z - originZ); mesh.visible = mesh.count > 0; }
  }

  private box(mesh: InstancedMesh, sample: RoadSample, offset: number, height: number, width: number, tall: number, length: number, color = 0xeeeedd, turn = 0, along = 0): void {
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Junction detail capacity exceeded');
    const { right: r, normal: n } = roadFrame(sample), t = sample.tangent, p = sample.position, cos = Math.cos(turn), sin = Math.sin(turn);
    this.matrix.set((r.x * cos - t.x * sin) * width, n.x * tall, -(t.x * cos + r.x * sin) * length, p.x - this.x + r.x * offset + n.x * height + t.x * along,
      (r.y * cos - t.y * sin) * width, n.y * tall, -(t.y * cos + r.y * sin) * length, p.y + r.y * offset + n.y * height + t.y * along,
      (r.z * cos - t.z * sin) * width, n.z * tall, -(t.z * cos + r.z * sin) * length, p.z - this.z + r.z * offset + n.z * height + t.z * along, 0, 0, 0, 1);
    mesh.setMatrixAt(mesh.count, this.matrix); mesh.setColorAt(mesh.count++, this.color.setHex(color));
  }

  dispose(): void {
    for (const mesh of [this.parts, this.markings]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }
  }
}
