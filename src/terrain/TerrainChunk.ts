import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, MeshStandardMaterial } from 'three';
import { CHUNK_SIZE, type ChunkRequest, type TerrainCells } from '../world/ChunkPlanner';
import type { TerrainData } from './TerrainGenerator';
import { createTerrainLayout } from './TerrainTopology';

export class TerrainChunk {
  readonly mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  x = 0;
  z = 0;

  constructor(readonly cells: TerrainCells, material: MeshStandardMaterial) {
    const geometry = new BufferGeometry();
    const layout = createTerrainLayout(cells);
    const length = layout.coordinates.length / 2 * 3;
    for (const name of ['position', 'normal', 'color']) {
      geometry.setAttribute(name, new BufferAttribute(new Float32Array(length), 3).setUsage(DynamicDrawUsage));
    }
    geometry.setIndex(new BufferAttribute(layout.indices, 1));
    this.mesh = new Mesh(geometry, material);
    this.mesh.castShadow = cells !== 8;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
  }

  apply(request: ChunkRequest, data: TerrainData, originX: number, originZ: number): void {
    this.x = request.x;
    this.z = request.z;
    for (const [name, array] of [['position', data.positions], ['normal', data.normals], ['color', data.colors]] as const) {
      const attribute = this.mesh.geometry.getAttribute(name) as BufferAttribute;
      attribute.set(array);
      attribute.needsUpdate = true;
    }
    this.mesh.geometry.computeBoundingSphere();
    this.setOrigin(originX, originZ);
    this.mesh.visible = true;
  }

  setOrigin(x: number, z: number): void {
    this.mesh.position.set(this.x * CHUNK_SIZE - x, 0, this.z * CHUNK_SIZE - z);
  }

  dispose(): void { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); }
}
