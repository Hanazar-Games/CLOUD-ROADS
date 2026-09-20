import { Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, type Scene } from 'three';
import { CHUNK_SIZE, VIEW_RADII } from '../world/ChunkPlanner';
import { plantGeometry } from './PlantGeometry';
import { distantPlant, GROUND_DETAIL_RADIUS, MEADOW_DETAIL_RADIUS, MEADOW_GRID, PLANT_GRID, TREE_DETAIL_RADIUS } from './VegetationConfig';

interface PlantChunk { x: number; z: number; plants: Float32Array; entries: PlantInstance[]; ring: number; near: boolean }
interface PlantInstance { chunk: PlantChunk; offset: number; batch: number; index: number }
const TREE_CAPACITY = (TREE_DETAIL_RADIUS * 2 + 1) ** 2 * PLANT_GRID ** 2;
const GROUND_CAPACITY = (GROUND_DETAIL_RADIUS * 2 + 1) ** 2 * PLANT_GRID ** 2;
const FAR_CAPACITY = (VIEW_RADII.at(-1)! * 2 + 1) ** 2 * PLANT_GRID ** 2 / 4;
const MEADOW_CAPACITY = (MEADOW_DETAIL_RADIUS * 2 + 1) ** 2 * MEADOW_GRID ** 2;

export class VegetationMesh {
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  readonly trees = new InstancedMesh(plantGeometry('pine'), this.material, TREE_CAPACITY);
  readonly cacti = new InstancedMesh(plantGeometry('cactus'), this.material, TREE_CAPACITY);
  readonly broadleaf = new InstancedMesh(plantGeometry('broadleaf'), this.material, TREE_CAPACITY);
  readonly shrubs = new InstancedMesh(plantGeometry('shrub'), this.material, GROUND_CAPACITY);
  readonly rocks = new InstancedMesh(plantGeometry('rock'), this.material, GROUND_CAPACITY);
  readonly grass = new InstancedMesh(plantGeometry('grass'), this.material, GROUND_CAPACITY);
  readonly distant = ['pine', 'cactus', 'broadleaf'].map(kind => new InstancedMesh(plantGeometry(kind as 'pine' | 'cactus' | 'broadleaf', true), this.material, FAR_CAPACITY));
  readonly meadow = new InstancedMesh(plantGeometry('meadow'), this.material, MEADOW_CAPACITY);
  readonly flowers = new InstancedMesh(plantGeometry('flowers'), this.material, MEADOW_CAPACITY);
  private readonly meshes = [this.trees, this.cacti, this.broadleaf, this.shrubs, this.rocks, this.grass, ...this.distant, this.meadow, this.flowers];
  private readonly entries: PlantInstance[][] = this.meshes.map(() => []);
  private readonly changed = this.meshes.map(() => ({ min: Infinity, max: -1 }));
  private readonly chunks = new Map<string, PlantChunk>();
  private readonly dirty = new Set<PlantChunk>();
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private anchorX = 0; private anchorZ = 0;
  private centerX = 0; private centerZ = 0;
  enabled = true;

  constructor(scene: Scene) {
    for (const [i, mesh] of this.meshes.entries()) {
      mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false;
      mesh.castShadow = i < 5; mesh.receiveShadow = i < 6 || i >= 9;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.setColorAt(0, this.color); mesh.instanceColor!.setUsage(DynamicDrawUsage);
      scene.add(mesh);
    }
  }

  get count(): number { return this.meshes.reduce((sum, mesh) => sum + mesh.count, 0); }
  get distantCount(): number { return this.distant.reduce((sum, mesh) => sum + mesh.count, 0); }
  get canopyCount(): number { return this.trees.count + this.broadleaf.count + this.cacti.count + this.distantCount; }
  get groundCount(): number { return this.shrubs.count + this.rocks.count + this.grass.count + this.meadow.count + this.flowers.count; }

  setChunk(key: string, x: number, z: number, plants: Float32Array): void {
    this.removeChunk(key);
    const chunk: PlantChunk = { x, z, plants, entries: [], ring: -1, near: false };
    this.chunks.set(key, chunk); this.dirty.add(chunk);
  }

  removeChunk(key: string): void {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    this.removeInstances(chunk); this.dirty.delete(chunk); this.chunks.delete(key);
  }

  setViewCenter(x: number, z: number): void {
    if (x === this.centerX && z === this.centerZ) return;
    this.centerX = x; this.centerZ = z;
    for (const chunk of this.chunks.values()) if (this.detail(chunk) !== chunk.ring || this.near(chunk) !== chunk.near) this.dirty.add(chunk);
  }

  private near(chunk: PlantChunk): boolean {
    return Math.max(Math.abs(chunk.x - this.centerX), Math.abs(chunk.z - this.centerZ)) <= MEADOW_DETAIL_RADIUS;
  }

  private detail(chunk: PlantChunk): number {
    const distance = Math.max(Math.abs(chunk.x - this.centerX), Math.abs(chunk.z - this.centerZ));
    return distance <= GROUND_DETAIL_RADIUS ? 0 : distance <= TREE_DETAIL_RADIUS ? 1 : distance <= VIEW_RADII.at(-1)! ? 2 : 3;
  }

  private removeInstances(chunk: PlantChunk): void {
    for (const entry of chunk.entries) {
      const entries = this.entries[entry.batch], last = entries.pop()!;
      if (last !== entry) { entries[entry.index] = last; last.index = entry.index; this.write(last); }
      this.meshes[entry.batch].count = entries.length;
    }
    chunk.entries.length = 0;
  }

  private write(entry: PlantInstance): void {
    const { chunk, offset: i, batch, index } = entry, p = chunk.plants, scale = p[i + 3], angle = p[i + 4];
    const cos = Math.cos(angle) * scale, sin = Math.sin(angle) * scale;
    this.matrix.set(cos, 0, sin, chunk.x * CHUNK_SIZE + p[i] - this.anchorX,
      0, scale * (0.9 + (angle / (Math.PI * 2)) * 0.22), 0, p[i + 1], -sin, 0, cos, chunk.z * CHUNK_SIZE + p[i + 2] - this.anchorZ, 0, 0, 0, 1);
    const mesh = this.meshes[batch], kind = p[i + 5];
    mesh.setMatrixAt(index, this.matrix);
    this.color.setHex(kind === 3 ? 0x83944d : kind === 4 ? 0xbda575 : kind === 6 ? 0x8c9b50 : 0xffffff).multiplyScalar(p[i + 6]);
    mesh.setColorAt(index, this.color);
    const changed = this.changed[batch]; changed.min = Math.min(changed.min, index); changed.max = Math.max(changed.max, index);
  }

  update(originX: number, originZ: number): void {
    if (Math.abs(originX - this.anchorX) > 16384 || Math.abs(originZ - this.anchorZ) > 16384) {
      this.anchorX = originX; this.anchorZ = originZ;
      for (const entries of this.entries) for (const entry of entries) this.write(entry);
    }
    for (const chunk of this.dirty) this.removeInstances(chunk);
    for (const chunk of this.dirty) {
      chunk.ring = this.detail(chunk);
      chunk.near = this.near(chunk);
      if (chunk.ring === 3) continue;
      for (let i = 0; i < chunk.plants.length; i += 7) {
        const kind = chunk.plants[i + 5], far = chunk.ring === 2;
        if ((kind >= 7 && !chunk.near) || (chunk.ring > 0 && kind >= 3) || (far && !distantPlant(chunk.x * CHUNK_SIZE + chunk.plants[i], chunk.z * CHUNK_SIZE + chunk.plants[i + 2]))) continue;
        const batch = kind >= 7 ? kind + 2 : far ? 6 + kind : kind <= 2 ? kind : kind <= 4 ? 3 : kind - 1;
        const entries = this.entries[batch], mesh = this.meshes[batch];
        if (entries.length >= mesh.instanceMatrix.count) throw new Error('Vegetation instance capacity exceeded');
        const entry = { chunk, offset: i, batch, index: entries.length };
        entries.push(entry); chunk.entries.push(entry); mesh.count = entries.length; this.write(entry);
      }
    }
    this.dirty.clear();
    for (const [i, mesh] of this.meshes.entries()) {
      const changed = this.changed[i];
      if (changed.max >= changed.min && mesh.count) {
        for (const range of mesh.instanceMatrix.updateRanges) { changed.min = Math.min(changed.min, range.start / 16); changed.max = Math.max(changed.max, (range.start + range.count) / 16 - 1); }
        mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceColor!.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(changed.min * 16, (changed.max - changed.min + 1) * 16); mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.addUpdateRange(changed.min * 3, (changed.max - changed.min + 1) * 3); mesh.instanceColor!.needsUpdate = true;
      }
      changed.min = Infinity; changed.max = -1;
      mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ); mesh.visible = this.enabled && mesh.count > 0;
    }
  }

  dispose(): void {
    this.chunks.clear(); this.dirty.clear(); this.entries.forEach(entries => { entries.length = 0; });
    for (const mesh of this.meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
    this.material.dispose();
  }
}
