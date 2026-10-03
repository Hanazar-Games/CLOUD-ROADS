import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, type Scene } from 'three';
import type { Junction, NetworkRoute } from './RoadNetwork';
import type { RoadSample } from './RoadSegment';
import { roadFrame } from './RoadFrame';
import { roadProfile } from './RoadProfile';
import type { WorldOptions } from '../world/WorldOptions';
import { addRetroreflection } from '../render/ReflectiveMaterial';
import type { ServicePoint } from '../service/ServiceTerrain';

export class JunctionMesh {
  readonly parts = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0.15 }), 8192);
  readonly markings = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xeeeedd, roughness: 0.9 }), 4096);
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private readonly profile;
  private version = -1;
  private x = 0;
  private z = 0;

  constructor(scene: Scene, options: Readonly<WorldOptions>) {
    addRetroreflection(this.markings.material);
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
      for (const junction of junctions) for (const { a, b } of junction.protection?.barriers ?? []) {
        this.edge(a, b, 0.25, 0.22, 0.11, 0xbfc2bf);
        for (const height of [0.6, 1.15]) this.edge(a, b, 0.14, 0.18, height, 0x84959c);
        const posts = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4));
        for (let i = 0; i <= posts; i++) {
          const t = i / posts, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
          this.edge(p, { ...p, z: p.z + 0.12 }, 0.14, 1.4, 0.7, 0x84959c);
        }
      }
      for (const junction of junctions.filter(j => !j.interchange && j.kind !== 'crossroads')) for (const ramp of junction.ramps) {
        const road = routes.find(route => route.id === junction.route)?.road;
        const branch = routes.find(route => route.id === ramp.id)?.road;
        if (!road || !branch) continue;
        const at = (distance: number) => road.segments.find(s => distance >= s.start.distance && distance <= s.end.distance)?.atDistance(distance);
        const approach = at(ramp.sample.distance - 90);
        if (approach) {
          for (const side of [-1, 1]) {
            this.box(this.parts, approach, side * (width + 1.8), 3.5, 0.38, 7, 0.38, 0x78868b);
            this.box(this.parts, approach, side * (width + 1.8), 0.25, 0.8, 0.5, 0.8, 0xb4b2a7);
            this.box(this.parts, approach, side * (width + 1.8), 0.53, 0.65, 0.06, 0.65, 0x515f63);
            for (const dx of [-0.22, 0.22]) for (const dz of [-0.22, 0.22])
              this.box(this.parts, approach, side * (width + 1.8) + dx, 0.58, 0.07, 0.09, 0.07, 0xadb4b3, 0, dz);
          }
          for (const height of [6.4, 7]) this.box(this.parts, approach, 0, height, width * 2 + 4, 0.18, 0.26, 0x78868b);
          for (let offset = -width; offset <= width; offset += 2) this.box(this.parts, approach, offset, 6.7, 0.12, 0.7, 0.16, 0x78868b);
          for (let offset = -width; offset < width; offset += 2) {
            this.box(this.parts, approach, offset + 1, 6.7, Math.hypot(2, 0.6), 0.09, 0.12, 0x8b999d, 0, 0, Math.atan2(0.6, 2) * (Math.floor(offset / 2) % 2 ? -1 : 1));
            this.box(this.parts, approach, offset + 1, 6.36, 1.9, 0.08, 0.72, 0x586b72, 0, 0.55);
          }
        }
        for (const ahead of [160, 80]) {
          const sample = at(ramp.sample.distance - ahead);
          if (!sample) continue;
          const lane = this.profile.lanes.filter(lane => lane.direction === 1).at(-1)!.offset;
          this.box(this.markings, sample, lane, 0.03, 0.16, 0.025, 6);
          for (const side of [-1, 1]) this.box(this.markings, sample, lane + side * 0.5, 0.035, 0.16, 0.025, 1.5, 0xeeeedd, -side * 0.75, 2.1);
          this.box(this.markings, sample, lane + 0.85, 0.035, 0.16, 0.025, 2.8, 0xeeeedd, 0.75, 0.7);
          for (const side of [-1, 1]) this.box(this.markings, sample, lane + 1.8 - Math.sin(0.75) * 0.5 + side * Math.cos(0.75) * 0.35,
            0.035, 0.16, 0.025, 1.2, 0xeeeedd, 0.75 - side * 0.6, 1.75 - Math.cos(0.75) * 0.5 - side * Math.sin(0.75) * 0.35);
        }
        for (let distance = 8; distance < 260; distance += 12) {
          const sample = at(ramp.sample.distance + distance);
          if (sample) this.box(this.markings, sample, width - 1.2, 0.04, 0.23, 0.025, 4);
        }
        const terminal = at(ramp.sample.distance + 285);
        if (terminal) {
          for (let i = 0; i < 5; i++) {
            this.box(this.parts, terminal, width + 0.6, 0.46, 0.55 + i * 0.07, 0.72, 0.62, i % 2 ? 0x3b4445 : 0xe5b845, 0, i * 0.68 - 1.5);
            this.box(this.parts, terminal, width + 0.6, 0.84, 0.5 + i * 0.07, 0.04, 0.5, 0xbfc4c0, 0, i * 0.68 - 1.5);
          }
          this.box(this.parts, terminal, width + 0.6, 1.55, 0.85, 0.6, 0.12, 0x235954, 0, 2.4);
          this.box(this.parts, terminal, width + 0.6, 1, 0.1, 1, 0.1, 0x7a8789, 0, 2.4);
          for (const side of [-1, 1]) this.box(this.parts, terminal, width + 0.6 + side * 0.18, 1.55, 0.12, 0.42, 0.13, 0xf6f1cf, side * 0.45, 2.32);
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
        const end = Math.min(1500, branch.segments.at(-1)?.end.distance ?? 0);
        for (let distance = 320; distance < end; distance += 24) {
          const sample = branch.segments.find(s => s.start.distance <= distance && s.end.distance >= distance)?.atDistance(distance);
          if (!sample) continue;
          for (const side of [-1, 1]) {
            const offset = side * (width + 0.22);
            this.box(this.parts, sample, offset, 0.72, 0.12, 1.25, 0.14, 0x84918f);
            this.box(this.markings, sample, offset, 1.25, 0.2, 0.16, 0.09, side > 0 ? 0xece8ce : 0xe5b34c);
            if (Math.abs(sample.curvature) > 0.002 && side === -Math.sign(sample.curvature)) {
              this.box(this.parts, sample, offset, 1.72, 0.7, 0.45, 0.09, 0x344b4b);
              this.box(this.markings, sample, offset, 1.72, 0.17, 0.34, 0.11, 0xf1d577, side * 0.6);
            }
          }
          if (junction.kind === 'stack' && sample.elevated && distance % 96 === 32) {
            for (const center of this.profile.centers) {
              this.box(this.markings, sample, center, 0.035, this.profile.width, 0.015, 0.1, 0x7a7c77);
              this.box(this.markings, sample, center, 0.035, this.profile.width, 0.015, 0.06, 0xb2b4ad, 0, 0.16);
            }
            for (const side of [-1, 1]) {
              this.box(this.parts, sample, side * (width + 0.2), -0.45, 0.34, 0.7, 0.4, 0x536466);
              this.box(this.parts, sample, side * (width + 0.45), -0.7, 0.62, 0.18, 0.42, 0x536466);
              this.box(this.parts, sample, side * (width + 0.23), 0.9, 0.22, 0.34, 0.1, 0xe3d7b2);
            }
          }
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

  private edge(a: ServicePoint, b: ServicePoint, width: number, height: number, lift: number, color: number): void {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (length < 1e-8) return;
    if (this.parts.count >= this.parts.instanceMatrix.count) throw new Error('Junction protection capacity exceeded');
    const overlap = 1 + 0.04 / length;
    this.matrix.set(-dz / length * width, 0, dx * overlap, (a.x + b.x) / 2 - this.x,
      0, height, (b.y - a.y) * overlap, (a.y + b.y) / 2 + lift,
      dx / length * width, 0, dz * overlap, (a.z + b.z) / 2 - this.z, 0, 0, 0, 1);
    this.parts.setMatrixAt(this.parts.count, this.matrix); this.parts.setColorAt(this.parts.count++, this.color.setHex(color));
  }

  private box(mesh: InstancedMesh, sample: RoadSample, offset: number, height: number, width: number, tall: number, length: number, color = 0xeeeedd, turn = 0, along = 0, roll = 0): void {
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Junction detail capacity exceeded');
    const { right: r, normal: n } = roadFrame(sample), t = sample.tangent, p = sample.position, cos = Math.cos(turn), sin = Math.sin(turn);
    this.matrix.set((r.x * cos - t.x * sin) * width, n.x * tall, -(t.x * cos + r.x * sin) * length, p.x - this.x + r.x * offset + n.x * height + t.x * along,
      (r.y * cos - t.y * sin) * width, n.y * tall, -(t.y * cos + r.y * sin) * length, p.y + r.y * offset + n.y * height + t.y * along,
      (r.z * cos - t.z * sin) * width, n.z * tall, -(t.z * cos + r.z * sin) * length, p.z - this.z + r.z * offset + n.z * height + t.z * along, 0, 0, 0, 1);
    if (roll) {
      const c = Math.cos(roll), s = Math.sin(roll), e = this.matrix.elements;
      for (let row = 0; row < 3; row++) {
        const x = e[row] / width, y = e[row + 4] / tall;
        e[row] = (x * c + y * s) * width; e[row + 4] = (y * c - x * s) * tall;
      }
    }
    mesh.setMatrixAt(mesh.count, this.matrix); mesh.setColorAt(mesh.count++, this.color.setHex(color));
  }

  dispose(): void {
    for (const mesh of [this.parts, this.markings]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }
  }
}
