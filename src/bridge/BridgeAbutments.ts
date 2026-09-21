import { BufferAttribute, BufferGeometry, Mesh, Vector3, type MeshStandardMaterial, type Scene } from 'three';
import type { RoadSample } from '../road/RoadSegment';
import type { RoadTerrain } from '../road/RoadGenerator';
import type { RoadCorridor } from '../road/RoadCorridor';
import type { BridgeSpan } from './BridgeDetector';
import { roadFrame } from '../road/RoadFrame';
import { roadProfile } from '../road/RoadProfile';
import type { WorldOptions } from '../world/WorldOptions';

export class BridgeAbutments {
  readonly mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  endCount = 0;
  private anchorX = 0; private anchorZ = 0;
  constructor(scene: Scene, material: MeshStandardMaterial, private readonly options: Readonly<WorldOptions>) {
    this.mesh = new Mesh(new BufferGeometry(), material); this.mesh.visible = false;
    this.mesh.castShadow = this.mesh.receiveShadow = true; scene.add(this.mesh);
  }

  rebuild(spans: readonly BridgeSpan[], terrain: RoadTerrain, corridor: RoadCorridor, anchorX: number, anchorZ: number): void {
    this.anchorX = anchorX; this.anchorZ = anchorZ; this.endCount = 0;
    const positions: number[] = [], profile = roadProfile(this.options);
    const add = (sample: RoadSample, direction: number) => {
      if (corridor.crossesBelow(sample, profile.outerHalfWidth + 20)) return;
      this.endCount++;
      const { right: r } = roadFrame(sample), p = sample.position;
      const vertex = (along: number, offset: number, upper: boolean) => {
        const x = p.x + sample.tangent.x * along + r.x * offset, z = p.z + sample.tangent.z * along + r.z * offset;
        const pavement = p.y + sample.tangent.y * along + r.y * offset, ground = terrain.sample(x, z);
        const top = Math.max(pavement - 0.12, Math.min(pavement + 0.3, corridor.height(x, z, ground) + 0.2));
        return new Vector3(x - anchorX, upper ? top : Math.min(top - 0.65, ground - 0.8), z - anchorZ);
      };
      for (const center of profile.centers) for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
        const points: Vector3[] = [];
        for (const step of [i, i + 1]) for (const upper of [false, true]) for (const edge of [-0.25, 0.25])
          points.push(vertex(direction * step * 2, center + side * (profile.halfWidth + 0.4 + step * 0.4) + edge, upper));
        if (points.some(point => corridor.distance(point.x + anchorX, point.z + anchorZ, profile.outerHalfWidth + 1) < profile.outerHalfWidth + 0.05)) continue;
        const faces = [[0, 2, 1], [1, 2, 3], [4, 5, 6], [5, 7, 6], [0, 4, 2], [2, 4, 6], [1, 3, 5], [3, 7, 5], [2, 6, 3], [3, 6, 7], [0, 1, 4], [1, 5, 4]];
        for (const face of faces) for (const index of direction < 0 ? face : [...face].reverse()) positions.push(...points[index].toArray());
      }
    };
    for (const span of spans) { if (!span.openStart) add(span.start, -1); if (!span.openEnd) add(span.end, 1); }
    this.mesh.geometry.dispose(); this.mesh.geometry = new BufferGeometry();
    this.mesh.geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    this.mesh.geometry.computeVertexNormals(); this.mesh.geometry.setDrawRange(0, positions.length / 3);
    if (positions.length) this.mesh.geometry.computeBoundingSphere();
  }
  update(originX: number, originZ: number, visible: boolean): void {
    this.mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ); this.mesh.visible = visible && this.endCount > 0;
  }
  dispose(): void { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); }
}
