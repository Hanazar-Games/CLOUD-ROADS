import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Scene, type Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VehicleMesh } from '../vehicle/VehicleMesh';
import { VehiclePhysics } from '../vehicle/VehiclePhysics';
import { VehicleSystems } from '../vehicle/VehicleSystems';
import type { VehicleKind } from '../vehicle/VehicleConfig';
import { ParkedFleet } from './ParkedFleet';
import type { ServiceArea } from './ServicePlanner';

function template(kind: VehicleKind): BufferGeometry[] {
  const car = new VehiclePhysics(kind), model = new VehicleMesh(new Scene(), car.profile), parts: BufferGeometry[][] = [[]];
  car.reset(0, 0, 0, () => ({ height: 0, grip: 1 }));
  model.sync(car, { x: 0, z: 0 }, new VehicleSystems()); model.root.updateMatrixWorld(true);
  const trailer = model.root.getObjectByName('trailer'), inverse = [model.root.matrixWorld.clone().invert()], transform = new Matrix4();
  if (trailer) { inverse.push(trailer.matrixWorld.clone().invert()); parts.push([]); }
  model.root.traverse(object => {
    if (!(object instanceof Mesh) || object instanceof InstancedMesh || Array.isArray(object.material) || !object.visible) return;
    let part = 0;
    for (let parent = object.parent; parent && parent !== model.root; parent = parent.parent) {
      if (!parent.visible) return;
      if (parent === trailer) part = 1;
    }
    const material = object.material as MeshStandardMaterial;
    if (!material.color || !object.geometry.getAttribute('normal') || object.name === 'windshield-water') return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(transform.multiplyMatrices(inverse[part], object.matrixWorld));
    for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3), color = material.color;
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); parts[part].push(geometry);
  });
  const geometries = parts.map(group => mergeGeometries(group)!);
  parts.flat().forEach(p => p.dispose()); model.dispose(); return geometries;
}

export class ParkedVehicles {
  readonly fleet: ParkedFleet;
  private readonly batches = new Map<VehicleKind, InstancedMesh[]>();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
  private readonly matrix = new Matrix4();
  private readonly tilt = new Matrix4();
  private version = -1;
  private anchorX = 0; private anchorZ = 0;
  constructor(private readonly scene: Scene, seed: string) { this.fleet = new ParkedFleet(seed); }
  update(sites: readonly ServiceArea[], origin: { x: number; z: number }, camera: Vector3): void {
    this.fleet.sync(sites);
    const near = this.fleet.entries.filter(e => Math.hypot(e.x - camera.x - origin.x, e.z - camera.z - origin.z) < 1600);
    const missing = near.find(e => !this.batches.has(e.kind));
    if (missing) {
      const meshes = template(missing.kind).map((geometry, part) => {
        const mesh = new InstancedMesh(geometry, this.material, 256); mesh.count = 0; mesh.receiveShadow = true;
        mesh.name = `${missing.kind}:${part ? 'trailer' : 'vehicle'}`; this.scene.add(mesh); return mesh;
      });
      this.batches.set(missing.kind, meshes); this.version = -1;
    }
    const anchorChanged = Math.hypot(camera.x + origin.x - this.anchorX, camera.z + origin.z - this.anchorZ) > 300;
    if (this.version !== this.fleet.version || anchorChanged) {
      this.version = this.fleet.version; this.anchorX = camera.x + origin.x; this.anchorZ = camera.z + origin.z;
      for (const meshes of this.batches.values()) for (const mesh of meshes) mesh.count = 0;
      for (const entry of near) {
        const meshes = this.batches.get(entry.kind); if (!meshes || meshes[0].count >= 256) continue;
        const car = this.fleet.vehicle(entry);
        for (let i = 0; i < meshes.length; i++) {
          const body = i ? car.trailer! : car, mesh = meshes[i];
          this.matrix.makeRotationY(-body.heading).setPosition(body.x - this.anchorX, body.y, body.z - this.anchorZ);
          this.matrix.multiply(this.tilt.makeRotationX(body.pitch));
          this.matrix.multiply(this.tilt.makeRotationZ(body.roll));
          mesh.setMatrixAt(mesh.count++, this.matrix);
        }
      }
      for (const meshes of this.batches.values()) for (const mesh of meshes) if (mesh.count) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
    }
    for (const meshes of this.batches.values()) for (const mesh of meshes) { mesh.position.set(this.anchorX - origin.x, 0, this.anchorZ - origin.z); mesh.visible = mesh.count > 0; }
  }
  get drawBatches(): number { return [...this.batches.values()].flat().filter(m => m.count > 0).length; }
  dispose(): void { for (const meshes of this.batches.values()) for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); } this.material.dispose(); }
}
