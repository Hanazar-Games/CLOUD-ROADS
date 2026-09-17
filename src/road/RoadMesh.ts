import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, type Scene } from 'three';
import { createRoadMaterial } from './RoadMaterial';
import { MAX_ROAD_SEGMENTS, type RoadSpine } from './RoadSpine';
import { roadFrame } from './RoadFrame';
import { ROAD_SAMPLES } from './RoadSegment';

export class RoadMesh {
  readonly mesh = new Mesh(new BufferGeometry(), createRoadMaterial());
  private version = -1;
  private anchorX = 0;
  private anchorZ = 0;

  constructor(scene: Scene) {
    const rows = MAX_ROAD_SEGMENTS * ROAD_SAMPLES + 1;
    for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]] as const) {
      this.mesh.geometry.setAttribute(name, new BufferAttribute(new Float32Array(rows * 2 * size), size).setUsage(DynamicDrawUsage));
    }
    const indices = new Uint16Array((rows - 1) * 6);
    for (let i = 0; i < rows - 1; i++) indices.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2], i * 6);
    this.mesh.geometry.setIndex(new BufferAttribute(indices, 1));
    this.mesh.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  update(spine: RoadSpine, originX: number, originZ: number, nearRoute: boolean): void {
    if (this.version !== spine.version && spine.segments.length) {
      this.version = spine.version;
      const first = spine.segments[0].start;
      this.anchorX = first.position.x;
      this.anchorZ = first.position.z;
      const positions = this.mesh.geometry.getAttribute('position') as BufferAttribute;
      const normals = this.mesh.geometry.getAttribute('normal') as BufferAttribute;
      const uv = this.mesh.geometry.getAttribute('uv') as BufferAttribute;
      const cycleStart = Math.floor(first.distance / 12) * 12;
      for (const [i, sample] of spine.samples.entries()) {
        const { right, normal } = roadFrame(sample);
        for (let side = 0; side < 2; side++) {
          const index = i * 2 + side, offset = side === 0 ? -5.2 : 5.2;
          positions.setXYZ(index, sample.position.x - this.anchorX + right.x * offset, sample.position.y + right.y * offset, sample.position.z - this.anchorZ + right.z * offset);
          normals.setXYZ(index, normal.x, normal.y, normal.z);
          uv.setXY(index, offset, sample.distance - cycleStart);
        }
      }
      for (const name of ['position', 'normal', 'uv']) this.mesh.geometry.getAttribute(name).needsUpdate = true;
      this.mesh.geometry.setDrawRange(0, (spine.samples.length - 1) * 6);
      this.mesh.geometry.computeBoundingSphere();
    }
    this.mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
    this.mesh.visible = nearRoute && spine.segments.length > 0;
  }

  dispose(): void { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
