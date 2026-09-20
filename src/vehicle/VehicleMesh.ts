import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, SpotLight, TorusGeometry, TubeGeometry, Vector3, type BufferGeometry, type Scene } from 'three';
import { WHEEL_POINTS, WHEEL_RADIUS, type VehiclePhysics } from './VehiclePhysics';

export class VehicleMesh {
  readonly root = new Group();
  readonly chassis = new Group();
  private readonly materials: MeshStandardMaterial[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly wheelPivots: Group[] = [];
  private readonly tires: Group[] = [];
  private readonly springs: Mesh[] = [];
  private readonly steering = new Group();
  private readonly tail;
  private readonly headlight = new SpotLight(0xffeed0, 0, 100, 0.6, 0.65, 1.6);

  constructor(scene: Scene) {
    const paint = this.material(0xb9cbb3, 0.4, 0.25), trim = this.material(0x202b2c), rubber = this.material(0x171c1d);
    const metal = this.material(0xaeb9b5, 0.35, 0.7), leather = this.material(0x675447);
    const glass = this.material(0xc3e2e4, 0.15, 0.1); glass.transparent = true; glass.opacity = 0.16; glass.depthWrite = false;
    this.tail = this.material(0xca3932); this.tail.emissive.setHex(0xff3020);
    const lamp = this.material(0xffefcf); lamp.emissive.setHex(0xffeed0); lamp.emissiveIntensity = 0.7;
    this.root.add(this.chassis); this.root.visible = false; scene.add(this.root);
    const box = this.geometry(new BoxGeometry());
    const block = (w: number, h: number, l: number, x: number, y: number, z: number, material = paint, parent = this.chassis) => {
      const mesh = new Mesh(box, material); mesh.scale.set(w, h, l); mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    const shape = new Shape();
    shape.moveTo(-0.74, -2.05); shape.lineTo(0.74, -2.05); shape.lineTo(0.92, -1.65);
    shape.lineTo(0.92, 1.6); shape.lineTo(0.7, 2.05); shape.lineTo(-0.7, 2.05);
    shape.lineTo(-0.92, 1.6); shape.lineTo(-0.92, -1.65); shape.closePath();
    const shell = new Mesh(this.geometry(new ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 1, steps: 1 })), paint);
    shell.rotation.x = -Math.PI / 2; shell.position.y = -0.34; shell.castShadow = shell.receiveShadow = true; this.chassis.add(shell);
    block(1.69, 0.12, 1.25, 0, 0.1, -1.35);
    block(1.68, 0.16, 0.63, 0, 0.12, 1.6);
    block(1.75, 0.1, 0.1, 0, -0.17, -2.1, trim);
    block(1.55, 0.1, 0.1, 0, -0.2, 2.1, trim);
    for (const side of [-1, 1]) {
      block(0.15, 0.3, 1.92, side * 0.84, 0.09, 0.22);
      block(0.05, 0.04, 0.2, side * 0.94, 0.17, 0.5, metal);
      block(0.5, 0.09, 0.055, side * 0.53, 0.02, -2.09, lamp);
      block(0.56, 0.09, 0.055, side * 0.52, 0.04, 2.09, this.tail);
      block(0.03, 0.22, 0.035, side * 0.86, 0.34, -0.66, trim);
      block(0.2, 0.035, 0.045, side * 0.93, 0.44, -0.66, trim);
      block(0.22, 0.12, 0.13, side * 1.03, 0.44, -0.64, paint);
      block(0.19, 0.09, 0.012, side * 1.03, 0.44, -0.569, metal);
      block(0.56, 0.16, 0.65, side * 0.43, 0.03, 0.4, leather);
      const seat = block(0.57, 0.58, 0.17, side * 0.43, 0.33, 0.83, leather); seat.rotation.x = -0.14;
      block(0.29, 0.2, 0.14, side * 0.43, 0.69, 0.88, leather);
      const pillar = block(0.035, 0.87, 0.035, side * 0.8, 0.65, -0.74, metal); pillar.rotation.x = 0.27;
    }
    const windshield = block(1.55, 0.81, 0.014, 0, 0.65, -0.74, glass); windshield.rotation.x = 0.27;
    block(1.65, 0.035, 0.045, 0, 1.07, -0.63, metal);
    block(1.58, 0.15, 0.3, 0, 0.25, -0.64, trim);
    block(0.2, 0.17, 0.8, 0, 0.09, 0.2, trim);
    this.steering.position.set(-0.43, 0.42, -0.4); this.steering.rotation.x = -0.25; this.chassis.add(this.steering);
    const ring = new Mesh(this.geometry(new TorusGeometry(0.155, 0.018, 6, 24)), trim); this.steering.add(ring);
    block(0.27, 0.027, 0.025, 0, 0, 0, metal, this.steering);
    block(0.035, 0.14, 0.03, 0, -0.065, 0, metal, this.steering);
    const tireGeometry = this.geometry(new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.24, 16));
    const rimGeometry = this.geometry(new CylinderGeometry(0.21, 0.21, 0.25, 12));
    const coil = this.geometry(new TubeGeometry(new CatmullRomCurve3(Array.from({ length: 65 }, (_, i) => new Vector3(Math.cos(i * Math.PI / 4) * 0.065, i / 64, Math.sin(i * Math.PI / 4) * 0.065))), 64, 0.012, 4, false));
    for (const point of WHEEL_POINTS) {
      const pivot = new Group(), spin = new Group(); pivot.add(spin); this.root.add(pivot);
      pivot.position.set(point.x, 0, -point.along);
      const tire = new Mesh(tireGeometry, rubber), rim = new Mesh(rimGeometry, metal);
      tire.rotation.z = rim.rotation.z = Math.PI / 2; tire.castShadow = true; spin.add(tire, rim);
      for (let i = 0; i < 5; i++) {
        const spoke = block(0.26, 0.025, 0.37, 0, 0, 0, trim, spin); spoke.rotation.x = i * Math.PI / 5;
      }
      const spring = new Mesh(coil, metal); this.root.add(spring); this.springs.push(spring);
      this.wheelPivots.push(pivot); this.tires.push(spin);
    }
    this.headlight.position.set(0, 0.05, -1.95); this.headlight.target.position.set(0, -1, -30);
    this.chassis.add(this.headlight, this.headlight.target);
  }

  sync(car: VehiclePhysics, origin: { x: number; z: number }, night: number): void {
    this.root.position.set(car.x - origin.x, car.y, car.z - origin.z);
    this.root.rotation.y = -car.heading;
    this.chassis.rotation.set(car.pitch, 0, car.roll, 'YXZ');
    for (let i = 0; i < 4; i++) {
      const wheel = this.wheelPivots[i], p = WHEEL_POINTS[i];
      wheel.position.y = car.wheels[i].height - car.y;
      wheel.rotation.y = i < 2 ? -car.steering : 0;
      this.tires[i].rotation.x = -car.wheelAngle;
      const spring = this.springs[i];
      spring.position.set(p.x * 0.78, wheel.position.y, -p.along);
      spring.scale.y = Math.max(0.08, -wheel.position.y + Math.sin(car.pitch) * p.along + Math.sin(car.roll) * p.x);
    }
    this.steering.rotation.z = -car.steering * 2;
    this.tail.emissiveIntensity = car.braking || car.parked ? 2 : 0.15 + night * 0.6;
    this.headlight.intensity = night * 160;
  }

  private material(color: number, roughness = 0.8, metalness = 0): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ color, roughness, metalness }); this.materials.push(material); return material;
  }
  private geometry<T extends BufferGeometry>(geometry: T): T { this.geometries.push(geometry); return geometry; }
  dispose(): void {
    this.root.removeFromParent(); this.headlight.dispose();
    this.geometries.forEach(geometry => geometry.dispose()); this.materials.forEach(material => material.dispose());
  }
}
