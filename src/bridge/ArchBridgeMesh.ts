import { BoxGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, Vector3, type MeshStandardMaterial, type Scene } from 'three';
import type { RoadSample } from '../road/RoadSegment';
import { roadProfile } from '../road/RoadProfile';
import { roadFrame } from '../road/RoadFrame';
import type { WorldOptions } from '../world/WorldOptions';

export const archAlignment = (samples: readonly RoadSample[]): boolean => samples.length > 1 && samples.every(sample =>
  Math.abs(sample.grade) <= 0.01 && Math.abs(sample.curvature) <= 0.0002
  && Math.abs(sample.heading - samples[0].heading) <= 0.01 && Math.abs(sample.bank) <= 0.01);

export class ArchBridgeMesh {
  readonly ribs: InstancedMesh;
  readonly posts: InstancedMesh;
  bayCount = 0;
  private readonly geometry = new BoxGeometry();
  private readonly matrix = new Matrix4();
  private readonly profile;
  private anchorX = 0;
  private anchorZ = 0;

  constructor(scene: Scene, material: MeshStandardMaterial, options: Readonly<WorldOptions>) {
    this.profile = roadProfile(options);
    this.ribs = new InstancedMesh(this.geometry, material, 32768);
    this.posts = new InstancedMesh(this.geometry, material, 32768);
    for (const mesh of [this.ribs, this.posts]) {
      mesh.count = 0; mesh.visible = false; mesh.castShadow = mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage); scene.add(mesh);
    }
  }

  reset(anchorX: number, anchorZ: number): void {
    this.anchorX = anchorX; this.anchorZ = anchorZ;
    this.ribs.count = this.posts.count = this.bayCount = 0;
  }

  add(samples: readonly RoadSample[]): void {
    const a = samples[0], b = samples.at(-1)!;
    const length = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z), rise = length * 0.25;
    const lateral = Math.min(1.5, this.profile.halfWidth * 0.4);
    const point = (t: number, offset: number, arch: boolean) => {
      const sample = samples[Math.round(t * (samples.length - 1))], p = sample.position, { right: r, normal: n } = roadFrame(sample);
      const depth = arch ? 3.5 : 2.94;
      return new Vector3(p.x + r.x * offset - n.x * depth,
        p.y + r.y * offset - n.y * depth - (arch ? rise * (2 * t - 1) ** 2 : 0), p.z + r.z * offset - n.z * depth);
    };
    for (const center of this.profile.centers) {
      for (const side of [-1, 1]) {
        const offset = center + side * lateral;
        for (let i = 0; i < 16; i++) this.beam(this.ribs, point(i / 16, offset, true), point((i + 1) / 16, offset, true), 1.25, 1.15);
        for (const t of [0.125, 0.25, 0.375, 0.625, 0.75, 0.875])
          this.beam(this.posts, point(t, offset, true), point(t, offset, false), 0.7, 0.8);
      }
      for (const t of [0, 0.25, 0.5, 0.75, 1]) this.beam(this.posts,
        point(t, center - lateral, true), point(t, center + lateral, true), 0.75, 0.9);
    }
    this.bayCount++;
  }

  private beam(mesh: InstancedMesh, a: Vector3, b: Vector3, width: number, depth: number): void {
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Arch bridge capacity exceeded');
    const y = b.clone().sub(a), length = y.length(); y.normalize();
    const x = new Vector3(0, 1, 0).cross(y);
    if (x.lengthSq() < 0.01) x.set(0, 0, 1).cross(y);
    x.normalize(); const z = x.clone().cross(y).normalize(), middle = a.clone().add(b).multiplyScalar(0.5);
    this.matrix.set(x.x * width, y.x * (length + 0.04), z.x * depth, middle.x - this.anchorX,
      x.y * width, y.y * (length + 0.04), z.y * depth, middle.y,
      x.z * width, y.z * (length + 0.04), z.z * depth, middle.z - this.anchorZ, 0, 0, 0, 1);
    mesh.setMatrixAt(mesh.count++, this.matrix);
  }

  update(originX: number, originZ: number, visible: boolean, changed: boolean): void {
    for (const mesh of [this.ribs, this.posts]) {
      if (changed) {
        mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16); mesh.instanceMatrix.needsUpdate = true;
        if (mesh.count) mesh.computeBoundingSphere();
      }
      mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ); mesh.visible = visible && mesh.count > 0;
    }
  }

  dispose(): void {
    for (const mesh of [this.ribs, this.posts]) { mesh.removeFromParent(); mesh.dispose(); }
    this.geometry.dispose();
  }
}
