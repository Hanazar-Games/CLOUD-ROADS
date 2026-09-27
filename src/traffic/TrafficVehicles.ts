import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, type Scene } from 'three';
import { vehicleTemplate } from '../service/ParkedVehicles';
import { MAX_TRAFFIC, type TrafficSystem } from './TrafficSystem';
import type { VehicleKind } from '../vehicle/VehicleConfig';

export class TrafficVehicles {
  private readonly batches = new Map<VehicleKind, InstancedMesh[]>();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.65, alphaHash: true });
  private readonly box = new BoxGeometry();
  private readonly lamps = new InstancedMesh(this.box, new MeshBasicMaterial({ toneMapped: false }), MAX_TRAFFIC * 4);
  private readonly drivers = new InstancedMesh(this.box, new MeshStandardMaterial({ roughness: 0.9 }), MAX_TRAFFIC * 2);
  private readonly matrix = new Matrix4();
  private readonly local = new Matrix4();
  private readonly color = new Color();
  constructor(private readonly scene: Scene, readonly traffic: TrafficSystem) {
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float paintMask; attribute float glassMask; varying float vTrafficGlass;\n${shader.vertexShader}`.replace('#include <color_vertex>', `
        #include <color_vertex>
        vTrafficGlass = glassMask;
        #if defined(USE_INSTANCING_COLOR) && defined(USE_COLOR)
          vColor.xyz = color.xyz * mix(vec3(1.0), instanceColor, paintMask);
        #endif
      `);
      shader.fragmentShader = `varying float vTrafficGlass;\n${shader.fragmentShader}`.replace('#include <alphahash_fragment>',
        'diffuseColor.a *= mix(1.0, 0.28, vTrafficGlass);\n#include <alphahash_fragment>');
    };
    this.lamps.name = 'traffic-lamps'; this.drivers.name = 'traffic-drivers';
    this.lamps.count = this.drivers.count = 0; scene.add(this.lamps, this.drivers);
  }
  update(origin: { x: number; z: number }, darkness: number): void {
    const missing = this.traffic.entries.find(e => !this.batches.has(e.car.kind));
    if (missing) this.batches.set(missing.car.kind, vehicleTemplate(missing.car.kind).map((geometry, i) => {
      const mesh = new InstancedMesh(geometry, this.material, MAX_TRAFFIC); mesh.name = `traffic-${missing.car.kind}-${i}`;
      mesh.count = 0; mesh.receiveShadow = true; this.scene.add(mesh); return mesh;
    }));
    for (const meshes of this.batches.values()) for (const mesh of meshes) mesh.count = 0;
    this.lamps.count = this.drivers.count = 0;
    for (const { car } of this.traffic.entries) {
      const meshes = this.batches.get(car.kind); if (!meshes) continue;
      for (const [i, mesh] of meshes.entries()) {
        const body = i ? car.trailer! : car;
        this.matrix.makeRotationY(-body.heading).setPosition(body.x - origin.x, body.y, body.z - origin.z);
        this.matrix.multiply(this.local.makeRotationX(body.pitch)).multiply(this.local.makeRotationZ(body.roll));
        mesh.setMatrixAt(mesh.count, this.matrix); mesh.setColorAt(mesh.count++, this.color.setHex(car.paint));
      }
      this.matrix.makeRotationY(-car.heading).setPosition(car.x - origin.x, car.y, car.z - origin.z);
      this.matrix.multiply(this.local.makeRotationX(car.pitch)).multiply(this.local.makeRotationZ(car.roll));
      const p = car.profile;
      for (const [height, width, y, color] of [[0.46, 0.38, p.eye.y - 0.34, 0x314d60], [0.23, 0.2, p.eye.y, 0xbe9273]]) {
        this.local.makeScale(width, height, 0.23).setPosition(p.eye.x, y, -p.eye.along);
        this.drivers.setMatrixAt(this.drivers.count, this.local.premultiply(this.matrix));
        this.drivers.setColorAt(this.drivers.count++, this.color.setHex(color));
      }
      for (const end of [-1, 1]) for (const side of [-1, 1]) {
        this.local.makeScale(0.23, 0.09, 0.04).setPosition(side * p.width * 0.32, 0.02, end * (p.chassisLength / 2 + 0.045));
        this.lamps.setMatrixAt(this.lamps.count, this.local.premultiply(this.matrix));
        this.lamps.setColorAt(this.lamps.count++, this.color.setHex(end < 0 ? darkness > 0.2 ? 0xffedbb : 0x637075 : car.braking ? 0xff351c : darkness > 0.2 ? 0x992211 : 0x43110c));
      }
    }
    for (const mesh of [...this.batches.values()].flat().concat([this.lamps, this.drivers] as InstancedMesh[])) {
      mesh.visible = mesh.count > 0;
      if (mesh.count) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; mesh.computeBoundingSphere(); }
    }
  }
  dispose(): void {
    for (const meshes of this.batches.values()) for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
    for (const mesh of [this.lamps, this.drivers]) { mesh.removeFromParent(); mesh.material.dispose(); mesh.dispose(); }
    this.box.dispose(); this.material.dispose();
  }
}
