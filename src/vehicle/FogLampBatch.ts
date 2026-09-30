import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, type Scene } from 'three';
import type { VehiclePhysics } from './VehiclePhysics';

export class FogLampBatch {
  readonly mesh: InstancedMesh<BoxGeometry, MeshBasicMaterial>;
  private readonly body = new Matrix4();
  private readonly local = new Matrix4();
  private readonly color = new Color();

  constructor(scene: Scene, capacity: number, name: string) {
    this.mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial({ toneMapped: false }), capacity * 4);
    this.mesh.name = name; this.mesh.count = 0; this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage); scene.add(this.mesh);
  }

  update(cars: readonly VehiclePhysics[], origin: { x: number; z: number }, on: boolean): void {
    const mesh = this.mesh; mesh.count = 0;
    if (on) for (const car of cars) {
      if (car.ignition === 'off' || mesh.count + 4 > mesh.instanceMatrix.count) continue;
      const p = car.profile;
      for (const rear of [false, true]) {
        const trailer = rear ? p.trailers?.at(-1) : undefined, body = rear ? car.trailers.at(-1) ?? car : car;
        this.body.makeRotationY(-body.heading).setPosition(body.x - origin.x, body.y, body.z - origin.z);
        this.body.multiply(this.local.makeRotationX(body.pitch)).multiply(this.local.makeRotationZ(body.roll));
        const z = rear ? trailer ? trailer.length - trailer.front + 0.08 : p.chassisLength / 2 + 0.08 : -p.chassisLength / 2 - 0.08;
        for (const side of [-1, 1]) {
          this.local.makeScale(p.shape === 'motorcycle' ? 0.07 : 0.19, 0.08, 0.035).setPosition(side * p.width * 0.27, -0.16, z);
          mesh.setMatrixAt(mesh.count, this.local.premultiply(this.body));
          mesh.setColorAt(mesh.count++, this.color.setHex(rear ? 0xff2010 : 0xffe2a0).multiplyScalar(rear ? 2 : 2.5));
        }
      }
    }
    mesh.visible = mesh.count > 0;
    if (mesh.count) {
      for (const attribute of [mesh.instanceMatrix, mesh.instanceColor!]) {
        attribute.setUsage(DynamicDrawUsage); attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, mesh.count * attribute.itemSize); attribute.needsUpdate = true;
      }
      mesh.computeBoundingSphere();
    }
  }

  dispose(): void { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose(); }
}
