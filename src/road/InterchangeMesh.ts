import { BoxGeometry, BufferGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector2, type Scene } from 'three';
import type { HighwayInterchange } from './HighwayInterchange';
import type { ServicePoint } from '../service/ServiceTerrain';
import type { RoadCorridor } from './RoadCorridor';
import type { RoadTerrain } from './RoadGenerator';
import { createConcreteMaterial } from '../bridge/ConcreteMaterial';
import { addRetroreflection } from '../render/ReflectiveMaterial';
import { accessQuads } from './SurfaceRibbon';
import { appendRibbonSlab } from './RibbonGeometry';
import { createPavementMaterial } from './PavementMaterial';
import type { PavementTextures } from './PavementTextures';

export class InterchangeMesh {
  private readonly pavementOrigin = new Vector2();
  readonly pavement: Mesh<BufferGeometry, MeshStandardMaterial>;
  private readonly concreteOrigin = new Vector2();
  readonly decks = new InstancedMesh(new BoxGeometry(), createConcreteMaterial(this.concreteOrigin), 12000);
  readonly slabs = new Mesh(new BufferGeometry(), this.decks.material);
  readonly rails = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xa6b2b8, metalness: 0.6, roughness: 0.48 }), 20000);
  readonly markings = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xeee9d6, roughness: 0.85 }), 12000);
  private readonly matrix = new Matrix4();
  private plans: readonly HighwayInterchange[] = [];
  private signature = '';
  private x = 0; private z = 0;

  constructor(scene: Scene, textures?: PavementTextures) {
    this.pavement = new Mesh(new BufferGeometry(), createPavementMaterial(this.pavementOrigin, textures));
    addRetroreflection(this.markings.material);
    this.pavement.name = 'interchange-ramp-pavement';
    for (const mesh of [this.pavement, this.slabs, this.decks, this.rails, this.markings]) { mesh.visible = false; mesh.receiveShadow = true; scene.add(mesh); }
    this.slabs.castShadow = true;
    this.decks.castShadow = this.rails.castShadow = true;
  }

  update(plans: readonly HighwayInterchange[], origin: { x: number; z: number }, corridor: RoadCorridor, terrain: RoadTerrain): void {
    this.concreteOrigin.set(origin.x, origin.z);
    const signature = plans.map(p => p.id).join('|');
    if (signature !== this.signature || plans.some((p, i) => p !== this.plans[i])) {
      this.signature = signature; this.plans = plans;
      this.x = plans[0]?.center.position.x ?? 0; this.z = plans[0]?.center.position.z ?? 0;
      this.pavementOrigin.set(this.x % 40, this.z % 40);
      this.decks.count = this.rails.count = this.markings.count = 0;
      const positions: number[] = [], slabs: number[] = [];
      for (const plan of plans) {
        const ribbons = accessQuads(plan.ground.access), rims = accessQuads(plan.ground.access, 0.25);
        let ribbon = 0;
        for (const ramp of plan.ramps) for (let i = 1; i < ramp.points.length; i++) {
          const a = ramp.points[i - 1], b = ramp.points[i], length = Math.hypot(b.x - a.x, b.z - a.z), nx = (a.z - b.z) / length, nz = (b.x - a.x) / length;
          const side = (p: typeof a, offset: number) => ({ x: p.x + nx * offset, y: p.y + (p.slopeX * nx + p.slopeZ * nz) * offset, z: p.z + nz * offset });
          const q = ribbons[ribbon], { leftA, rightA, leftB, rightB } = q;
          for (const p of [leftA, rightA, leftB, rightA, rightB, leftB]) positions.push(p.x - this.x, p.y + 0.015, p.z - this.z);
          appendRibbonSlab(slabs, q, rims[ribbon++], { x: this.x, z: this.z }, 1.4);
          for (const offset of [-3.3, 3.3]) if (i > 14 && i < ramp.points.length - 14 || i % 3 === 0)
            this.edge(this.markings, side(a, offset), side(b, offset), 0.12, 0.02, 0.04);
          if (i % 24 === 12) {
            const along = (d: number, offset = 0) => ({ x: a.x + (b.x - a.x) / length * d + nx * offset, y: a.y + (b.y - a.y) / length * d, z: a.z + (b.z - a.z) / length * d + nz * offset });
            this.edge(this.markings, along(-2), along(2), 0.18, 0.02, 0.045);
            for (const s of [-1, 1]) this.edge(this.markings, along(0.7, s * 0.7), along(2), 0.18, 0.02, 0.045);
          }
          if (i % 8 === 0 && !corridor.crossesBelow({ ...plan.center, position: a, routeId: `${plan.id}:ramp`, distance: i * 6 }, 9)) {
            const floor = terrain.sample(a.x, a.z), height = a.y - 1.45 - floor;
            if (height > 2) {
              const width = Math.min(6, 1.5 + height * 0.02);
              this.edge(this.decks, { ...a, y: floor + height / 2 }, { ...a, x: a.x + 0.01, y: floor + height / 2, z: a.z + 2 }, width, height, 0);
              this.edge(this.decks, { ...a, y: floor + 0.3 }, { ...a, x: a.x + 0.01, y: floor + 0.3, z: a.z + 3.5 }, width + 2, 0.6, 0);
            }
          }
        }
        for (const [i, { a, b }] of plan.ground.barriers.entries()) {
          for (const y of [0.55, 1.05]) this.edge(this.rails, a, b, 0.13, 0.15, y);
          const length = Math.hypot(b.x - a.x, b.z - a.z);
          const posts = Math.max(1, Math.ceil(length / 4));
          for (let i = 0; i <= posts; i++) {
            const t = i / posts, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
            this.edge(this.rails, p, { ...p, z: p.z + 0.12 }, 0.13, 1.2, 0.6);
          }
          if (i % 2 === 0 && length > 0.1) {
            const t = Math.min(0.5, 0.3 / length);
            this.edge(this.markings, a, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, 0.18, 0.11, 1.05);
          }
        }
      }
      for (const [mesh, data] of [[this.pavement, positions], [this.slabs, slabs]] as const) {
        mesh.geometry.dispose(); mesh.geometry = new BufferGeometry();
        mesh.geometry.setAttribute('position', new Float32BufferAttribute(data, 3));
        mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
      }
      for (const mesh of [this.decks, this.rails, this.markings]) {
        mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
        mesh.instanceMatrix.needsUpdate = true; if (mesh.count) mesh.computeBoundingSphere();
      }
    }
    for (const mesh of [this.pavement, this.slabs, this.decks, this.rails, this.markings]) { mesh.position.set(this.x - origin.x, 0, this.z - origin.z); mesh.visible = plans.length > 0; }
  }

  private edge(mesh: InstancedMesh, a: ServicePoint, b: ServicePoint, width: number, height: number, lift: number): void {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (length < 1e-8) return;
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Interchange geometry capacity exceeded');
    this.matrix.set(-dz / length * width, 0, dx, (a.x + b.x) / 2 - this.x,
      0, height, b.y - a.y, (a.y + b.y) / 2 + lift, dx / length * width, 0, dz, (a.z + b.z) / 2 - this.z, 0, 0, 0, 1);
    mesh.setMatrixAt(mesh.count++, this.matrix);
  }

  dispose(): void {
    this.slabs.removeFromParent(); this.slabs.geometry.dispose();
    for (const mesh of [this.pavement, this.decks, this.rails, this.markings]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); if (mesh instanceof InstancedMesh) mesh.dispose(); }
  }
}
