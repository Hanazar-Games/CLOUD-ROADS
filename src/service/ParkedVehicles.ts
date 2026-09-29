import { BufferGeometry, Color, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Scene, type Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VehicleMesh } from '../vehicle/VehicleMesh';
import { VehiclePhysics } from '../vehicle/VehiclePhysics';
import { VehicleSystems } from '../vehicle/VehicleSystems';
import type { VehicleKind } from '../vehicle/VehicleConfig';
import { ParkedFleet } from './ParkedFleet';
import type { ServiceArea } from './ServicePlanner';
import type { ParkedEntry } from './ServiceParking';
import type { Garage } from '../garage/Garage';
import { vehicleProxy } from '../vehicle/VehicleProxy';
import { addRetroreflection } from '../render/ReflectiveMaterial';

export function vehicleTemplate(kind: VehicleKind, roofClosed = false): BufferGeometry[] {
  const car = new VehiclePhysics(kind), model = new VehicleMesh(new Scene(), car.profile), parts: BufferGeometry[][] = [[]];
  car.reset(0, 0, 0, () => ({ height: 0, grip: 1 }));
  const systems = new VehicleSystems(); systems.roofOpen = roofClosed ? 0 : 1;
  model.sync(car, { x: 0, z: 0 }, systems); model.root.updateMatrixWorld(true);
  const trailers = car.trailers.map((_, i) => model.root.getObjectByName(`trailer-${i}`)!);
  const inverse = [model.root, ...trailers].map(root => root.matrixWorld.clone().invert()), transform = new Matrix4();
  for (let i = 0; i < trailers.length; i++) parts.push([]);
  model.root.traverse(object => {
    if (!(object instanceof Mesh) || object instanceof InstancedMesh || Array.isArray(object.material) || !object.visible) return;
    let part = 0;
    for (let parent = object.parent; parent && parent !== model.root; parent = parent.parent) {
      if (!parent.visible) return;
      const index = trailers.indexOf(parent); if (index >= 0) part = index + 1;
    }
    const material = object.material as MeshStandardMaterial;
    if (!material.color || !object.geometry.getAttribute('normal') || object.name === 'windshield-water') return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(transform.multiplyMatrices(inverse[part], object.matrixWorld));
    const vertexColors = material.vertexColors ? geometry.getAttribute('color') : undefined;
    for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    const count = geometry.getAttribute('position').count, mask = material.name === 'vehicle-paint' ? 1 : 0;
    const colors = new Float32Array(count * 3), color = mask ? new Color(0xffffff) : material.color;
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r * (vertexColors?.getX(i) ?? 1);
      colors[i * 3 + 1] = color.g * (vertexColors?.getY(i) ?? 1);
      colors[i * 3 + 2] = color.b * (vertexColors?.getZ(i) ?? 1);
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('glassMask', new Float32BufferAttribute(new Float32Array(count).fill(material.transparent && material.opacity < 0.9 ? 1 : 0), 1));
    geometry.setAttribute('paintMask', new Float32BufferAttribute(new Float32Array(count).fill(mask), 1)); parts[part].push(geometry);
    geometry.setAttribute('retroMask', new Float32BufferAttribute(new Float32Array(count).fill(Number(material.name === 'retro-reflector')), 1));
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
  detailDistance = 240;
  private detailSignature = '';
  private garageFloor: string | undefined;
  private garageEntries: readonly (readonly ParkedEntry[])[] = [];
  private extraEntries: ParkedEntry[] = [];
  private anchorX = 0; private anchorZ = 0;
  constructor(private readonly scene: Scene, seed: string, gravity = 9.81) {
    this.fleet = new ParkedFleet(seed, gravity);
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float paintMask;\n${shader.vertexShader}`.replace('#include <color_vertex>', `
        #include <color_vertex>
        #if defined(USE_INSTANCING_COLOR) && defined(USE_COLOR)
          vColor.xyz = color.xyz * mix(vec3(1.0), instanceColor, paintMask);
        #endif
      `);
    };
    addRetroreflection(this.material, true);
  }
  update(sites: readonly ServiceArea[], origin: { x: number; z: number }, camera: Vector3, garage?: Garage, serviceGarages: readonly Garage[] = []): void {
    const garages = [...garage ? [garage] : [], ...serviceGarages], entries = garages.map(g => g.entries);
    if (entries.length !== this.garageEntries.length || entries.some((e, i) => e !== this.garageEntries[i])) {
      this.garageEntries = entries; this.extraEntries = entries.flat();
    }
    this.fleet.sync(sites, this.extraEntries);
    const current = garages.find(g => g.floor(camera.x + origin.x, camera.y, camera.z + origin.z) !== undefined);
    const floor = `${current?.id}:${current?.floor(camera.x + origin.x, camera.y, camera.z + origin.z)}:${garages.map(g => g.loading).join(',')}`;
    if (floor !== this.garageFloor) { this.garageFloor = floor; this.version = -1; }
    const near = this.fleet.entries.filter(e => Math.hypot(e.x - camera.x - origin.x, e.z - camera.z - origin.z) < 1600
      && (e.slot < 0 || !e.id.startsWith('garage:') || garages.some(g => e.id.startsWith(`garage:${g.id}:`)
        && g.visibleFloor(Math.round((g.position.y - e.y) / 6), g.floor(camera.x + origin.x, camera.y, camera.z + origin.z)))));
    const key = (entry: typeof near[number]) => `${entry.kind}${Math.hypot(entry.x - camera.x - origin.x, entry.z - camera.z - origin.z) > this.detailDistance ? ':far' : entry.kind === 'roadster' && this.fleet.vehicle(entry).roofOpen < 0.05 ? ':closed' : ''}`;
    const counts = new Map<string, number>();
    for (const entry of near) counts.set(key(entry), (counts.get(key(entry)) ?? 0) + 1);
    for (const [key, count] of counts) {
      const meshes = this.batches.get(key);
      if (!meshes || meshes[0].instanceMatrix.count >= count) continue;
      this.batches.set(key, meshes.map(previous => {
        const mesh = new InstancedMesh(previous.geometry, this.material, 2 ** Math.ceil(Math.log2(count)));
        mesh.name = previous.name; mesh.receiveShadow = true; mesh.count = 0;
        previous.removeFromParent(); previous.dispose(); this.scene.add(mesh); return mesh;
      }));
      this.version = -1;
    }
    const missing = near.find(e => !this.batches.has(key(e)));
    if (missing) {
      const meshes = (key(missing).endsWith(':far') ? vehicleProxy(missing.kind) : vehicleTemplate(missing.kind, key(missing).endsWith(':closed'))).map((geometry, part) => {
        const mesh = new InstancedMesh(geometry, this.material, 256); mesh.count = 0; mesh.receiveShadow = true;
        mesh.name = `${missing.kind}:${part ? 'trailer' : 'vehicle'}`; this.scene.add(mesh); return mesh;
      });
      this.batches.set(key(missing), meshes); this.version = -1;
    }
    const anchorChanged = Math.hypot(camera.x + origin.x - this.anchorX, camera.z + origin.z - this.anchorZ) > 300;
    const signature = near.map(key).join('|');
    if (this.version !== this.fleet.version || anchorChanged || signature !== this.detailSignature) {
      this.detailSignature = signature;
      this.version = this.fleet.version; this.anchorX = camera.x + origin.x; this.anchorZ = camera.z + origin.z;
      for (const meshes of this.batches.values()) for (const mesh of meshes) mesh.count = 0;
      for (const entry of near) {
        const meshes = this.batches.get(key(entry)) ?? this.batches.get(entry.kind) ?? this.batches.get(`${entry.kind}:closed`) ?? this.batches.get(`${entry.kind}:far`);
        if (!meshes || meshes[0].count >= meshes[0].instanceMatrix.count) continue;
        const car = this.fleet.vehicle(entry);
        for (let i = 0; i < meshes.length; i++) {
          const body = i ? car.trailers[i - 1] : car, mesh = meshes[i];
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
