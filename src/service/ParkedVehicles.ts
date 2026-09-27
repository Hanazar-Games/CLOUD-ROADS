import { BufferGeometry, Color, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Scene, type Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VehicleMesh } from '../vehicle/VehicleMesh';
import { VehiclePhysics } from '../vehicle/VehiclePhysics';
import { VehicleSystems } from '../vehicle/VehicleSystems';
import type { VehicleKind } from '../vehicle/VehicleConfig';
import { ParkedFleet } from './ParkedFleet';
import type { ServiceArea } from './ServicePlanner';

export function vehicleTemplate(kind: VehicleKind, roofClosed = false): BufferGeometry[] {
  const car = new VehiclePhysics(kind), model = new VehicleMesh(new Scene(), car.profile), parts: BufferGeometry[][] = [[]];
  car.reset(0, 0, 0, () => ({ height: 0, grip: 1 }));
  const systems = new VehicleSystems(); systems.roofOpen = roofClosed ? 0 : 1;
  model.sync(car, { x: 0, z: 0 }, systems); model.root.updateMatrixWorld(true);
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
    const count = geometry.getAttribute('position').count, mask = material.name === 'vehicle-paint' ? 1 : 0;
    const colors = new Float32Array(count * 3), color = mask ? new Color(0xffffff) : material.color;
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('glassMask', new Float32BufferAttribute(new Float32Array(count).fill(material.transparent && material.opacity < 0.9 ? 1 : 0), 1));
    geometry.setAttribute('paintMask', new Float32BufferAttribute(new Float32Array(count).fill(mask), 1)); parts[part].push(geometry);
  });
  const geometries = parts.map(group => mergeGeometries(group)!);
  parts.flat().forEach(p => p.dispose()); model.dispose(); return geometries;
}

export class ParkedVehicles {
  readonly fleet: ParkedFleet;
  private readonly batches = new Map<string, InstancedMesh[]>();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
  private readonly matrix = new Matrix4();
  private readonly tilt = new Matrix4();
  private readonly color = new Color();
  private version = -1;
  private anchorX = 0; private anchorZ = 0;
  constructor(private readonly scene: Scene, seed: string) {
    this.fleet = new ParkedFleet(seed);
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float paintMask;\n${shader.vertexShader}`.replace('#include <color_vertex>', `
        #include <color_vertex>
        #if defined(USE_INSTANCING_COLOR) && defined(USE_COLOR)
          vColor.xyz = color.xyz * mix(vec3(1.0), instanceColor, paintMask);
        #endif
      `);
    };
  }
  update(sites: readonly ServiceArea[], origin: { x: number; z: number }, camera: Vector3): void {
    this.fleet.sync(sites);
    const near = this.fleet.entries.filter(e => Math.hypot(e.x - camera.x - origin.x, e.z - camera.z - origin.z) < 1600);
    const key = (entry: typeof near[number]) => `${entry.kind}${entry.kind === 'roadster' && this.fleet.vehicle(entry).roofOpen < 0.05 ? ':closed' : ''}`;
    const missing = near.find(e => !this.batches.has(key(e)));
    if (missing) {
      const meshes = vehicleTemplate(missing.kind, key(missing).endsWith(':closed')).map((geometry, part) => {
        const mesh = new InstancedMesh(geometry, this.material, 256); mesh.count = 0; mesh.receiveShadow = true;
        mesh.name = `${missing.kind}:${part ? 'trailer' : 'vehicle'}`; this.scene.add(mesh); return mesh;
      });
      this.batches.set(key(missing), meshes); this.version = -1;
    }
    const anchorChanged = Math.hypot(camera.x + origin.x - this.anchorX, camera.z + origin.z - this.anchorZ) > 300;
    if (this.version !== this.fleet.version || anchorChanged) {
      this.version = this.fleet.version; this.anchorX = camera.x + origin.x; this.anchorZ = camera.z + origin.z;
      for (const meshes of this.batches.values()) for (const mesh of meshes) mesh.count = 0;
      for (const entry of near) {
        const meshes = this.batches.get(key(entry)); if (!meshes || meshes[0].count >= 256) continue;
        const car = this.fleet.vehicle(entry);
        for (let i = 0; i < meshes.length; i++) {
          const body = i ? car.trailer! : car, mesh = meshes[i];
          this.matrix.makeRotationY(-body.heading).setPosition(body.x - this.anchorX, body.y, body.z - this.anchorZ);
          this.matrix.multiply(this.tilt.makeRotationX(body.pitch));
          this.matrix.multiply(this.tilt.makeRotationZ(body.roll));
          mesh.setMatrixAt(mesh.count, this.matrix); mesh.setColorAt(mesh.count++, this.color.setHex(car.paint));
        }
      }
      for (const meshes of this.batches.values()) for (const mesh of meshes) if (mesh.count) {
        mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; mesh.computeBoundingSphere();
      }
    }
    for (const meshes of this.batches.values()) for (const mesh of meshes) { mesh.position.set(this.anchorX - origin.x, 0, this.anchorZ - origin.z); mesh.visible = mesh.count > 0; }
  }
  get drawBatches(): number { return [...this.batches.values()].flat().filter(m => m.count > 0).length; }
  dispose(): void { for (const meshes of this.batches.values()) for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); } this.material.dispose(); }
}
