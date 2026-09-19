import { BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, type Scene } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHUNK_SIZE, VIEW_RADIUS } from '../world/ChunkPlanner';

const CAPACITY = (VIEW_RADIUS * 2 + 1) ** 2 * 14 ** 2;

function colored(geometry: BufferGeometry, color: string): BufferGeometry {
  const rgb = new Color(color), colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function plantGeometry(kind: 'pine' | 'cactus' | 'broadleaf' | 'shrub'): BufferGeometry {
  const pieces = kind === 'shrub' ? [
    colored(new IcosahedronGeometry(1.2, 0).scale(1, 0.7, 1).translate(0, 0.7, 0), '#ffffff'),
    colored(new IcosahedronGeometry(0.85, 0).scale(1, 0.8, 1).translate(0.8, 0.5, 0.4), '#d4dfbd'),
    colored(new IcosahedronGeometry(0.8, 0).scale(1, 0.75, 1).translate(-0.6, 0.5, -0.6), '#c0cda9'),
  ] : kind === 'broadleaf' ? [
    colored(new CylinderGeometry(0.24, 0.55, 8, 7).translate(0, 4, 0), '#655744'),
    colored(new CylinderGeometry(0.12, 0.26, 4, 5).rotateZ(-0.7).translate(1.1, 6.3, 0), '#78634b'),
    colored(new IcosahedronGeometry(3.5, 0).scale(1, 1.1, 0.9).translate(0, 9, 0), '#667c42'),
    colored(new IcosahedronGeometry(2.6, 0).translate(2.1, 7.4, 0.3), '#728a4b'),
    colored(new IcosahedronGeometry(2.5, 0).translate(-2, 7.7, 0.7), '#58713d'),
    colored(new IcosahedronGeometry(2.2, 0).translate(0.5, 7.4, -2), '#71864a'),
  ] : kind === 'cactus' ? [
    colored(new CylinderGeometry(0.4, 0.55, 6, 7).translate(0, 3, 0), '#6e8050'),
    colored(new CylinderGeometry(0.3, 0.34, 1.8, 6).rotateZ(Math.PI / 2).translate(0.8, 2.6, 0), '#7c8c58'),
    colored(new CylinderGeometry(0.27, 0.34, 2.3, 6).translate(1.6, 3.6, 0), '#7c8c58'),
    colored(new CylinderGeometry(0.27, 0.32, 1.5, 6).rotateZ(Math.PI / 2).translate(-0.7, 3.7, 0), '#64784b'),
    colored(new CylinderGeometry(0.24, 0.3, 1.7, 6).translate(-1.35, 4.4, 0), '#64784b'),
  ] : [
    colored(new CylinderGeometry(0.28, 0.65, 7, 5).translate(0, 3.5, 0), '#5c4933'),
    colored(new ConeGeometry(3.8, 8.5, 9).rotateY(0.2).translate(0.15, 7.1, -0.2), '#38573a'),
    colored(new ConeGeometry(3.1, 7.4, 8).rotateY(0.6).translate(-0.35, 10.6, 0.3), '#456345'),
    colored(new ConeGeometry(2, 6.3, 7).translate(0.2, 13.8, 0), '#5c7752'),
    colored(new ConeGeometry(1.4, 3.5, 6).translate(1.65, 5.4, -0.6), '#3c603d'),
  ];
  const normalized = pieces.map(piece => piece.index ? piece.toNonIndexed() : piece);
  const geometry = mergeGeometries(normalized)!;
  for (let i = 0; i < pieces.length; i++) if (normalized[i] !== pieces[i]) normalized[i].dispose();
  for (const piece of pieces) piece.dispose();
  return geometry;
}

export class VegetationMesh {
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  readonly trees = new InstancedMesh(plantGeometry('pine'), this.material, CAPACITY);
  readonly cacti = new InstancedMesh(plantGeometry('cactus'), this.material, CAPACITY);
  readonly broadleaf = new InstancedMesh(plantGeometry('broadleaf'), this.material, CAPACITY);
  readonly shrubs = new InstancedMesh(plantGeometry('shrub'), this.material, CAPACITY);
  private readonly meshes = [this.trees, this.cacti, this.broadleaf, this.shrubs];
  private readonly chunks = new Map<string, { x: number; z: number; plants: Float32Array }>();
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private dirty = false;
  private anchorX = 0;
  private anchorZ = 0;
  enabled = true;

  constructor(scene: Scene) {
    for (const mesh of this.meshes) {
      mesh.count = 0;
      mesh.visible = false;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.setColorAt(0, this.color);
      mesh.instanceColor!.setUsage(DynamicDrawUsage);
      scene.add(mesh);
    }
  }

  get count(): number { return this.meshes.reduce((sum, mesh) => sum + mesh.count, 0); }

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
      for (const mesh of this.meshes) mesh.count = 0;
      for (const { x, z, plants } of this.chunks.values()) for (let i = 0; i < plants.length; i += 7) {
        const kind = plants[i + 5], mesh = kind === 0 ? this.trees : kind === 1 ? this.cacti : kind === 2 ? this.broadleaf : this.shrubs;
        if (mesh.count >= CAPACITY) throw new Error('Vegetation instance capacity exceeded');
        const scale = plants[i + 3], angle = plants[i + 4], cos = Math.cos(angle) * scale, sin = Math.sin(angle) * scale;
        this.matrix.set(cos, 0, sin, x * CHUNK_SIZE + plants[i] - this.anchorX,
          0, scale, 0, plants[i + 1], -sin, 0, cos, z * CHUNK_SIZE + plants[i + 2] - this.anchorZ, 0, 0, 0, 1);
        mesh.setMatrixAt(mesh.count, this.matrix);
        this.color.setHex(kind === 3 ? 0x708745 : kind === 4 ? 0xbda575 : 0xffffff).multiplyScalar(plants[i + 6]);
        mesh.setColorAt(mesh.count++, this.color);
      }
      for (const mesh of this.meshes) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.clearUpdateRanges();
        mesh.instanceColor!.addUpdateRange(0, mesh.count * 3);
        mesh.instanceColor!.needsUpdate = true;
        if (mesh.count) mesh.computeBoundingSphere();
      }
    }
    for (const mesh of this.meshes) {
      mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
      mesh.visible = this.enabled && mesh.count > 0;
    }
  }

  dispose(): void {
    this.chunks.clear();
    for (const mesh of this.meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
    this.material.dispose();
  }
}
