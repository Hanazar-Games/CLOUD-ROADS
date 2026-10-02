import { DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3, type BufferGeometry, type Scene } from 'three';
import { roadFrame } from '../road/RoadFrame';
import type { RoadSample } from '../road/RoadSegment';

export class NearbyDetails {
  readonly mesh;
  private readonly placements: Matrix4[] = [];
  private readonly cells = new Map<string, number[]>();
  private readonly selected = new Set<number>();
  private readonly lastCamera = new Vector3(Infinity, Infinity, Infinity);
  private readonly matrix = new Matrix4();
  private anchorX = 0;
  private anchorZ = 0;
  private level = -1;
  private distanceScale = 1;

  constructor(scene: Scene, geometry: BufferGeometry, name: string, capacity = 64) {
    this.mesh = new InstancedMesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.25 }), capacity);
    this.mesh.name = name; this.mesh.count = 0; this.mesh.visible = false; this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage); scene.add(this.mesh);
  }

  clear(anchorX: number, anchorZ: number): void {
    this.anchorX = anchorX; this.anchorZ = anchorZ; this.placements.length = 0; this.level = -1;
    this.cells.clear(); this.selected.clear();
    this.mesh.count = 0; this.mesh.visible = false;
  }

  add(matrix: Matrix4): void {
    const e = matrix.elements, key = `${Math.floor(e[12] / 128)},${Math.floor(e[14] / 128)}`;
    let cell = this.cells.get(key);
    if (!cell) { cell = []; this.cells.set(key, cell); }
    cell.push(this.placements.length); this.placements.push(matrix.clone()); this.level = -1;
  }

  addRoad(sample: RoadSample, offset: number, height: number, facing = 1): void {
    const { right: r, normal: n } = roadFrame(sample), p = sample.position;
    const b = { x: r.y * n.z - r.z * n.y, y: r.z * n.x - r.x * n.z, z: r.x * n.y - r.y * n.x };
    this.matrix.set(r.x * facing, n.x, b.x * facing, p.x - this.anchorX + r.x * offset + n.x * height,
      r.y * facing, n.y, b.y * facing, p.y + r.y * offset + n.y * height,
      r.z * facing, n.z, b.z * facing, p.z - this.anchorZ + r.z * offset + n.z * height, 0, 0, 0, 1);
    this.add(this.matrix);
  }

  update(camera: { x: number; y: number; z: number }, originX: number, originZ: number, level: number, visible = true, distanceScale = 1): void {
    this.mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
    const detail = visible ? level : 0;
    const scale = Number.isFinite(distanceScale) ? Math.max(0, Math.min(2, distanceScale)) : 1;
    if (detail !== this.level || scale !== this.distanceScale || this.lastCamera.distanceToSquared(camera) >= 64) {
      this.level = detail; this.distanceScale = scale; this.lastCamera.copy(camera);
      const radius = (detail >= 2 ? 160 : detail >= 1 ? 80 : 0) * scale;
      const x = camera.x - this.anchorX, z = camera.z - this.anchorZ;
      const nearby: { i: number; distance: number }[] = [];
      if (radius) for (let cx = Math.floor((x - radius) / 128); cx <= Math.floor((x + radius) / 128); cx++) {
        for (let cz = Math.floor((z - radius) / 128); cz <= Math.floor((z + radius) / 128); cz++) {
          const cell = this.cells.get(`${cx},${cz}`); if (!cell) continue;
          for (const i of cell) {
            const e = this.placements[i].elements, distance = (e[12] - x) ** 2 + (e[13] - camera.y) ** 2 + (e[14] - z) ** 2;
            if (distance < radius * radius) nearby.push({ i, distance });
          }
        }
      }
      nearby.sort((a, b) => a.distance - b.distance || a.i - b.i);
      nearby.length = Math.min(nearby.length, this.mesh.instanceMatrix.count);
      if (nearby.length !== this.selected.size || nearby.some(p => !this.selected.has(p.i))) {
        this.selected.clear(); this.mesh.count = nearby.length;
        for (const [i, p] of nearby.entries()) { this.mesh.setMatrixAt(i, this.placements[p.i]); this.selected.add(p.i); }
        if (this.mesh.count) {
          this.mesh.instanceMatrix.clearUpdateRanges(); this.mesh.instanceMatrix.addUpdateRange(0, this.mesh.count * 16);
          this.mesh.instanceMatrix.needsUpdate = true; this.mesh.computeBoundingSphere();
        }
      }
    }
    this.mesh.visible = detail > 0 && this.mesh.count > 0;
  }

  dispose(): void {
    this.placements.length = 0; this.mesh.removeFromParent(); this.mesh.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.cells.clear(); this.selected.clear();
  }
}
