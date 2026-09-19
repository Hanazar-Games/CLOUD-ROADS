import { BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, type Scene } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHUNK_SIZE, VIEW_RADIUS } from '../world/ChunkPlanner';

const CAPACITY = (VIEW_RADIUS * 2 + 1) ** 2 * 14 ** 2;

function colored(geometry: BufferGeometry, color: string): BufferGeometry {
  const rgb = new Color(color), colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function plantGeometry(desert: boolean): BufferGeometry {
  const pieces = desert ? [
    colored(new CylinderGeometry(0.4, 0.55, 6, 7).translate(0, 3, 0), '#6e8050'),
    colored(new CylinderGeometry(0.3, 0.34, 1.8, 6).rotateZ(Math.PI / 2).translate(0.8, 2.6, 0), '#7c8c58'),
    colored(new CylinderGeometry(0.27, 0.34, 2.3, 6).translate(1.6, 3.6, 0), '#7c8c58'),
    colored(new CylinderGeometry(0.27, 0.32, 1.5, 6).rotateZ(Math.PI / 2).translate(-0.7, 3.7, 0), '#64784b'),
    colored(new CylinderGeometry(0.24, 0.3, 1.7, 6).translate(-1.35, 4.4, 0), '#64784b'),
  ] : [
    colored(new CylinderGeometry(0.28, 0.65, 7, 5).translate(0, 3.5, 0), '#5c4933'),
    colored(new ConeGeometry(4.1, 9, 7).translate(0, 7.4, 0), '#38573a'),
    colored(new ConeGeometry(3.3, 7.5, 7).rotateY(0.45).translate(0, 10.8, 0), '#456345'),
    colored(new ConeGeometry(2.2, 6.5, 7).translate(0, 13.9, 0), '#547552'),
  ];
  const geometry = mergeGeometries(pieces)!;
  for (const piece of pieces) piece.dispose();
  return geometry;
}

export class VegetationMesh {
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  readonly trees = new InstancedMesh(plantGeometry(false), this.material, CAPACITY);
  readonly cacti = new InstancedMesh(plantGeometry(true), this.material, CAPACITY);
  private readonly chunks = new Map<string, { x: number; z: number; plants: Float32Array }>();
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private dirty = false;
  private anchorX = 0;
  private anchorZ = 0;
  enabled = true;

  constructor(scene: Scene) {
    for (const mesh of [this.trees, this.cacti]) {
      mesh.count = 0;
      mesh.visible = false;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.setColorAt(0, this.color);
      mesh.instanceColor!.setUsage(DynamicDrawUsage);
      scene.add(mesh);
    }
  }

  get count(): number { return this.trees.count + this.cacti.count; }

  setChunk(key: string, x: number, z: number, plants: Float32Array): void {
    this.chunks.set(key, { x, z, plants });
    this.dirty = true;
  }

  removeChunk(key: string): void { if (this.chunks.delete(key)) this.dirty = true; }

  update(originX: number, originZ: number): void {
    if (this.dirty) {
      this.dirty = false;
      this.anchorX = originX;
      this.anchorZ = originZ;
      this.trees.count = this.cacti.count = 0;
      for (const { x, z, plants } of this.chunks.values()) for (let i = 0; i < plants.length; i += 7) {
        const mesh = plants[i + 5] === 0 ? this.trees : this.cacti;
        if (mesh.count >= CAPACITY) throw new Error('Vegetation instance capacity exceeded');
        const scale = plants[i + 3], angle = plants[i + 4], cos = Math.cos(angle) * scale, sin = Math.sin(angle) * scale;
        this.matrix.set(cos, 0, sin, x * CHUNK_SIZE + plants[i] - this.anchorX,
          0, scale, 0, plants[i + 1], -sin, 0, cos, z * CHUNK_SIZE + plants[i + 2] - this.anchorZ, 0, 0, 0, 1);
        mesh.setMatrixAt(mesh.count, this.matrix);
        mesh.setColorAt(mesh.count++, this.color.setScalar(plants[i + 6]));
      }
      for (const mesh of [this.trees, this.cacti]) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.clearUpdateRanges();
        mesh.instanceColor!.addUpdateRange(0, mesh.count * 3);
        mesh.instanceColor!.needsUpdate = true;
        if (mesh.count) mesh.computeBoundingSphere();
      }
    }
    for (const mesh of [this.trees, this.cacti]) {
      mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
      mesh.visible = this.enabled && mesh.count > 0;
    }
  }

  dispose(): void {
    this.chunks.clear();
    for (const mesh of [this.trees, this.cacti]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
    this.material.dispose();
  }
}
