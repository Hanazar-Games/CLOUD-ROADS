import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector4, type Scene } from 'three';
import { barrierGeometry } from './RoadHardwareGeometry';
import { createRoadMaterial } from './RoadMaterial';
import { MAX_ROAD_SEGMENTS, type RoadSpine } from './RoadSpine';
import { roadFrame } from './RoadFrame';
import { ROAD_SAMPLES } from './RoadSegment';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { roadProfile } from './RoadProfile';
import type { ServiceArea } from '../service/ServicePlanner';

export class RoadMesh {
  readonly mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  readonly barriers: InstancedMesh<BufferGeometry, MeshStandardMaterial>;
  private readonly profile;
  private readonly matrix = new Matrix4();
  private version = -1;
  private anchorX = 0;
  private anchorZ = 0;
  private readonly access = Array.from({ length: 4 }, () => new Vector4(-1, -1, -1, -1));

  constructor(scene: Scene, options: Readonly<WorldOptions> = DEFAULT_OPTIONS, capacity = MAX_ROAD_SEGMENTS) {
    this.profile = roadProfile(options);
    this.barriers = new InstancedMesh(barrierGeometry(), new MeshStandardMaterial({ color: 0xb6b5a9, roughness: 0.9 }),
      options.roadType === 'highway' ? capacity * ROAD_SAMPLES * 2 : 1);
    this.mesh = new Mesh(new BufferGeometry(), createRoadMaterial(options, this.access));
    const strips = this.profile.centers.length, stride = strips * 2;
    const rows = capacity * ROAD_SAMPLES + 1;
    for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]] as const) {
      this.mesh.geometry.setAttribute(name, new BufferAttribute(new Float32Array(rows * stride * size), size).setUsage(DynamicDrawUsage));
    }
    const indices = new Uint16Array((rows - 1) * strips * 6);
    for (let i = 0; i < rows - 1; i++) for (let strip = 0; strip < strips; strip++) {
      const a = i * stride + strip * 2, b = a + stride;
      indices.set([a, a + 1, b, a + 1, b + 1, b], (i * strips + strip) * 6);
    }
    this.mesh.geometry.setIndex(new BufferAttribute(indices, 1));
    this.mesh.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.barriers.count = 0;
    this.barriers.visible = false;
    this.barriers.castShadow = this.barriers.receiveShadow = true;
    this.barriers.instanceMatrix.setUsage(DynamicDrawUsage);
    scene.add(this.mesh, this.barriers);
  }

  update(spine: Pick<RoadSpine, 'version' | 'segments' | 'samples'>, originX: number, originZ: number, nearRoute: boolean, services: readonly ServiceArea[] = []): void {
    if (this.version !== spine.version && spine.segments.length) {
      this.version = spine.version;
      const first = spine.segments[0].start;
      this.anchorX = first.position.x;
      this.anchorZ = first.position.z;
      const positions = this.mesh.geometry.getAttribute('position') as BufferAttribute;
      const normals = this.mesh.geometry.getAttribute('normal') as BufferAttribute;
      const uv = this.mesh.geometry.getAttribute('uv') as BufferAttribute;
      const cycleStart = Math.floor(first.distance / 78000) * 78000; // Shared period of 12 m dashes, 2 km arrows and 1.3 m grooves.
      this.access.forEach((range, i) => {
        const distance = services[i]?.sample.distance;
        if (distance === undefined) range.set(-1, -1, -1, -1);
        else range.set(distance - cycleStart - 230, distance - cycleStart - 155, distance - cycleStart + 155, distance - cycleStart + 230);
      });
      const { centers, halfWidth } = this.profile, stride = centers.length * 2;
      this.barriers.count = 0;
      for (const [i, sample] of spine.samples.entries()) {
        const { right, normal } = roadFrame(sample);
        for (const [strip, center] of centers.entries()) for (let side = 0; side < 2; side++) {
          const index = i * stride + strip * 2 + side, offset = center + (side === 0 ? -halfWidth : halfWidth);
          positions.setXYZ(index, sample.position.x - this.anchorX + right.x * offset, sample.position.y + right.y * offset, sample.position.z - this.anchorZ + right.z * offset);
          normals.setXYZ(index, normal.x, normal.y, normal.z);
          uv.setXY(index, offset, sample.distance - cycleStart);
        }
        if (centers.length === 2 && i > 0 && sample.opening === undefined) {
          const previous = spine.samples[i - 1];
          const length = sample.distance - previous.distance + 0.08;
          const scale = Math.hypot(1, sample.grade);
          for (const side of [-1.8, 1.8]) {
            this.matrix.set(right.x * 0.35, normal.x * 0.85, -Math.sin(sample.heading) / scale * length,
              (sample.position.x + previous.position.x) / 2 - this.anchorX + right.x * side + normal.x * 0.425,
              right.y * 0.35, normal.y * 0.85, -sample.grade / scale * length,
              (sample.position.y + previous.position.y) / 2 + right.y * side + normal.y * 0.425,
              right.z * 0.35, normal.z * 0.85, Math.cos(sample.heading) / scale * length,
              (sample.position.z + previous.position.z) / 2 - this.anchorZ + right.z * side + normal.z * 0.425,
              0, 0, 0, 1);
            this.barriers.setMatrixAt(this.barriers.count++, this.matrix);
          }
        }
      }
      for (const name of ['position', 'normal', 'uv']) this.mesh.geometry.getAttribute(name).needsUpdate = true;
      this.mesh.geometry.setDrawRange(0, (spine.samples.length - 1) * centers.length * 6);
      this.mesh.geometry.computeBoundingSphere();
      this.barriers.instanceMatrix.needsUpdate = true;
      if (this.barriers.count) this.barriers.computeBoundingSphere();
    }
    this.mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
    this.mesh.visible = nearRoute && spine.segments.length > 0;
    this.barriers.position.copy(this.mesh.position);
    this.barriers.visible = nearRoute && this.barriers.count > 0;
  }

  dispose(): void {
    for (const mesh of [this.mesh, this.barriers]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
    this.barriers.dispose();
  }
}
