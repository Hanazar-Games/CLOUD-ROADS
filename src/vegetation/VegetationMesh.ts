import { Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, type Scene } from 'three';
import { CHUNK_SIZE, VIEW_RADII } from '../world/ChunkPlanner';
import { plantGeometry } from './PlantGeometry';
import { distantPlant, GROUND_DETAIL_RADIUS, MEADOW_DETAIL_RADIUS, MEADOW_GRID, PLANT_GRID, TREE_DETAIL_RADIUS, TREE_FINE_RADIUS } from './VegetationConfig';
import type { SeasonState } from '../season/SeasonState';
import { seasonMaterial } from '../season/SeasonMaterial';

interface PlantChunk { x: number; z: number; plants: Float32Array; entries: PlantInstance[]; ring: number; near: boolean; fine: boolean }
interface PlantInstance { chunk: PlantChunk; offset: number; batch: PlantBatch; index: number }
interface PlantBatch {
  key: string; layer: number; x: number; z: number; mesh: InstancedMesh; entries: PlantInstance[]; min: number; max: number;
}
const KINDS = ['pine', 'cactus', 'broadleaf', 'shrub', 'rock', 'grass', 'pine', 'cactus', 'broadleaf', 'meadow', 'flowers', 'flowerSpikes', 'autumn', 'autumn', 'pine', 'cactus', 'broadleaf', 'autumn'] as const;
const distantLayer = (layer: number) => layer >= 6 && layer <= 8 || layer === 13;
const detailLevel = (layer: number) => distantLayer(layer) ? 'distant' : layer >= 14 ? 'middle' : 'near';
const deciduous = (layer: number) => KINDS[layer] === 'broadleaf' || KINDS[layer] === 'autumn';

export class VegetationMesh {
  private readonly materials = KINDS.map(() => new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  private readonly geometries = KINDS.map((kind, layer) => plantGeometry(kind === 'autumn' ? 'broadleaf' : kind, detailLevel(layer)));
  private readonly bare = KINDS.map((_, layer) => deciduous(layer) ? plantGeometry('bare', detailLevel(layer)) : null);
  private readonly blossom = KINDS.map((_, layer) => deciduous(layer) ? plantGeometry('blossom', detailLevel(layer)) : null);
  private readonly seedheads = plantGeometry('seedheads');
  private season?: SeasonState;
  private readonly batches = new Map<string, PlantBatch>();
  private readonly chunks = new Map<string, PlantChunk>();
  private readonly dirty = new Set<PlantChunk>();
  private readonly changed = new Set<PlantBatch>();
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private centerX = 0; private centerZ = 0;
  enabled = true;

  constructor(private readonly scene: Scene) {}

  setSeason(season: SeasonState): void {
    if (this.season !== season) this.materials.forEach((material, layer) => seasonMaterial(material, season,
      deciduous(layer) ? 'foliage' : KINDS[layer] === 'pine' ? 'evergreen' : ['grass', 'meadow', 'shrub'].includes(KINDS[layer]) ? 'grass' : 'structure'));
    this.season = season;
    for (const batch of this.batches.values()) {
      const geometry = this.geometry(batch.layer);
      if (batch.mesh.geometry !== geometry) { batch.mesh.geometry = geometry; batch.mesh.computeBoundingSphere(); }
    }
  }

  private geometry(layer: number) {
    if (this.season?.kind === 'autumn' && (layer === 10 || layer === 11)) return this.seedheads;
    return (this.season?.kind === 'winter' ? this.bare[layer] : this.season?.kind === 'spring' ? this.blossom[layer] : null) ?? this.geometries[layer];
  }

  private visible(layer: number): boolean { return this.enabled && !(this.season?.kind === 'winter' && (layer === 10 || layer === 11)); }

  get count(): number { return this.countLayers(() => true); }
  get distantCount(): number { return this.countLayers(distantLayer); }
  get canopyCount(): number { return this.countLayers(layer => layer < 3 || distantLayer(layer) || layer >= 12); }
  get groundCount(): number { return this.count - this.canopyCount; }
  get meadowCount(): number { return this.countLayers(layer => layer === 9); }
  get flowerCount(): number { return this.season?.kind === 'winter' || this.season?.kind === 'autumn' ? 0 : this.countLayers(layer => layer === 10 || layer === 11); }

  private countLayers(include: (layer: number) => boolean): number {
    let total = 0;
    for (const batch of this.batches.values()) if (include(batch.layer)) total += batch.mesh.count;
    return total;
  }

  setChunk(key: string, x: number, z: number, plants: Float32Array): void {
    this.removeChunk(key);
    const chunk: PlantChunk = { x, z, plants, entries: [], ring: -1, near: false, fine: false };
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
    for (const chunk of this.chunks.values()) if (this.detail(chunk) !== chunk.ring || this.within(chunk, MEADOW_DETAIL_RADIUS) !== chunk.near
      || this.within(chunk, TREE_FINE_RADIUS) !== chunk.fine) this.dirty.add(chunk);
  }

  private within(chunk: PlantChunk, radius: number): boolean {
    return Math.max(Math.abs(chunk.x - this.centerX), Math.abs(chunk.z - this.centerZ)) <= radius;
  }

  private detail(chunk: PlantChunk): number {
    const distance = Math.max(Math.abs(chunk.x - this.centerX), Math.abs(chunk.z - this.centerZ));
    return distance <= GROUND_DETAIL_RADIUS ? 0 : distance <= TREE_DETAIL_RADIUS ? 1 : distance <= VIEW_RADII.at(-1)! ? 2 : 3;
  }

  private batch(layer: number, chunk: PlantChunk): PlantBatch {
    const far = distantLayer(layer), meadow = layer >= 9 && layer <= 11;
    const size = far ? 8 : meadow ? 1 : 2;
    const x = Math.floor(chunk.x / size) * size, z = Math.floor(chunk.z / size) * size, key = `${layer}:${x},${z}`;
    let batch = this.batches.get(key);
    if (!batch) {
      const capacity = size ** 2 * (meadow ? MEADOW_GRID ** 2 : PLANT_GRID ** 2 / (far ? 4 : 1));
      const mesh = new InstancedMesh(this.geometry(layer), this.materials[layer], capacity);
      mesh.name = `vegetation-${KINDS[layer]}${detailLevel(layer) === 'near' ? '' : `-${detailLevel(layer)}`}`;
      mesh.count = 0; mesh.visible = false;
      mesh.castShadow = layer < 5 || layer === 12 || layer >= 14; mesh.receiveShadow = layer < 6 || layer >= 9;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.setColorAt(0, this.color); mesh.instanceColor!.setUsage(DynamicDrawUsage);
      this.scene.add(mesh);
      batch = { key, layer, x: x * CHUNK_SIZE, z: z * CHUNK_SIZE, mesh, entries: [], min: Infinity, max: -1 };
      this.batches.set(key, batch);
    }
    return batch;
  }

  private removeInstances(chunk: PlantChunk): void {
    for (const entry of chunk.entries) {
      const { batch } = entry, last = batch.entries.pop()!;
      if (last !== entry) { batch.entries[entry.index] = last; last.index = entry.index; this.write(last); }
      batch.mesh.count = batch.entries.length; this.changed.add(batch);
    }
    chunk.entries.length = 0;
  }

  private write(entry: PlantInstance): void {
    const { chunk, offset: i, batch, index } = entry, p = chunk.plants, scale = p[i + 3], angle = p[i + 4];
    const cos = Math.cos(angle) * scale, sin = Math.sin(angle) * scale;
    this.matrix.set(cos, 0, sin, chunk.x * CHUNK_SIZE + p[i] - batch.x,
      0, scale * (0.9 + (angle / (Math.PI * 2)) * 0.22), 0, p[i + 1], -sin, 0, cos, chunk.z * CHUNK_SIZE + p[i + 2] - batch.z, 0, 0, 0, 1);
    batch.mesh.setMatrixAt(index, this.matrix);
    const kind = p[i + 5];
    this.color.setHex(kind === 3 ? 0x83944d : kind === 4 ? 0xbda575 : kind === 6 ? 0x8c9b50 : 0xffffff).multiplyScalar(p[i + 6]);
    batch.mesh.setColorAt(index, this.color);
    batch.min = Math.min(batch.min, index); batch.max = Math.max(batch.max, index); this.changed.add(batch);
  }

  update(originX: number, originZ: number): void {
    for (const chunk of this.dirty) this.removeInstances(chunk);
    for (const chunk of this.dirty) {
      chunk.ring = this.detail(chunk); chunk.near = this.within(chunk, MEADOW_DETAIL_RADIUS); chunk.fine = this.within(chunk, TREE_FINE_RADIUS);
      if (chunk.ring === 3) continue;
      for (let i = 0; i < chunk.plants.length; i += 7) {
        const kind = chunk.plants[i + 5], far = chunk.ring === 2;
        if ((kind >= 7 && kind <= 9 && !chunk.near) || (chunk.ring > 0 && kind >= 3 && kind !== 10) || (far && !distantPlant(chunk.x * CHUNK_SIZE + chunk.plants[i], chunk.z * CHUNK_SIZE + chunk.plants[i + 2]))) continue;
        const layer = kind === 10 ? far ? 13 : chunk.fine ? 12 : 17 : kind >= 7 ? kind + 2 : far ? 6 + kind : kind <= 2 ? chunk.fine ? kind : 14 + kind : kind <= 4 ? 3 : kind - 1;
        const batch = this.batch(layer, chunk);
        if (batch.entries.length >= batch.mesh.instanceMatrix.count) throw new Error('Vegetation instance capacity exceeded');
        const entry = { chunk, offset: i, batch, index: batch.entries.length };
        batch.entries.push(entry); chunk.entries.push(entry); batch.mesh.count = batch.entries.length; this.write(entry);
      }
    }
    this.dirty.clear();
    for (const batch of this.changed) {
      const { mesh } = batch;
      if (!mesh.count) {
        mesh.removeFromParent(); mesh.dispose(); this.batches.delete(batch.key);
        continue;
      }
      if (batch.max >= batch.min) {
        for (const range of mesh.instanceMatrix.updateRanges) { batch.min = Math.min(batch.min, range.start / 16); batch.max = Math.max(batch.max, (range.start + range.count) / 16 - 1); }
        mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceColor!.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(batch.min * 16, (batch.max - batch.min + 1) * 16); mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.addUpdateRange(batch.min * 3, (batch.max - batch.min + 1) * 3); mesh.instanceColor!.needsUpdate = true;
      }
      mesh.computeBoundingSphere(); batch.min = Infinity; batch.max = -1;
    }
    this.changed.clear();
    for (const batch of this.batches.values()) {
      batch.mesh.position.set(batch.x - originX, 0, batch.z - originZ); batch.mesh.visible = this.visible(batch.layer);
    }
  }

  dispose(): void {
    this.chunks.clear(); this.dirty.clear(); this.changed.clear();
    for (const { mesh } of this.batches.values()) { mesh.removeFromParent(); mesh.dispose(); }
    this.batches.clear();
    [...this.geometries, ...this.bare, ...this.blossom].forEach(geometry => geometry?.dispose());
    this.seedheads.dispose();
    this.materials.forEach(material => material.dispose());
  }
}
