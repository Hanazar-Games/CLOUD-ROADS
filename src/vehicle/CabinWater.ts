import { BoxGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VehicleEquipment } from './VehicleEquipment';

const ease = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export class CabinWater {
  readonly stock: InstancedMesh;
  readonly held: Mesh;
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.28 });
  private readonly bottle: BufferGeometry;
  private readonly hand: BufferGeometry;
  private readonly start = new Vector3();
  private readonly end = new Vector3();

  constructor(parent: Group, private readonly storage: Vector3, private readonly lid: Group) {
    const paint = (geometry: BufferGeometry, hex: number) => {
      const color = new Color(hex), values = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < values.length; i += 3) color.toArray(values, i);
      geometry.setAttribute('color', new Float32BufferAttribute(values, 3)); return geometry;
    };
    const parts = [
      paint(new CylinderGeometry(0.032, 0.034, 0.17, 12).translate(0, 0.09, 0), 0x87d4e8),
      paint(new CylinderGeometry(0.014, 0.032, 0.038, 12).translate(0, 0.194, 0), 0x87d4e8),
      paint(new CylinderGeometry(0.019, 0.019, 0.023, 10).translate(0, 0.222, 0), 0x22658c),
      paint(new CylinderGeometry(0.034, 0.035, 0.05, 12).translate(0, 0.09, 0), 0xe3f3ef),
    ];
    this.bottle = mergeGeometries(parts)!;
    const glove = paint(new BoxGeometry(0.065, 0.085, 0.045).translate(0.035, 0.065, 0.025), 0x24343d);
    const cuff = paint(new BoxGeometry(0.065, 0.045, 0.06).translate(0.045, 0.005, 0.035), 0x708c92);
    const neck = paint(new CylinderGeometry(0.014, 0.014, 0.023, 12, 1, true).translate(0, 0.223, 0), 0x87d4e8);
    const rim = paint(new TorusGeometry(0.012, 0.002, 4, 12).rotateX(Math.PI / 2).translate(0, 0.235, 0), 0xbfeaf0);
    const opening = paint(new CylinderGeometry(0.012, 0.012, 0.001, 12).translate(0, 0.214, 0), 0x18464e);
    this.hand = mergeGeometries([...parts.filter((_, i) => i !== 2), glove, cuff, neck, rim, opening])!;
    for (const part of [...parts, glove, cuff, neck, rim, opening]) part.dispose();
    this.stock = new InstancedMesh(this.bottle, this.material, 6); this.stock.name = 'fridge-water';
    const matrix = new Matrix4();
    for (let i = 0; i < 6; i++) this.stock.setMatrixAt(i, matrix.makeTranslation(storage.x + (i % 2 - 0.5) * 0.09, storage.y, storage.z + (Math.floor(i / 2) - 1) * 0.1));
    this.stock.instanceMatrix.needsUpdate = true; this.stock.castShadow = true;
    this.held = new Mesh(this.hand, this.material); this.held.name = 'drinking-water'; this.held.visible = false;
    const root = new Group(); root.name = 'cabin-water'; root.add(this.stock, this.held); parent.add(root);
  }
  update(equipment: VehicleEquipment, seat: { x: number; y: number; along: number }): void {
    const t = equipment.drinkTime;
    this.stock.count = equipment.waterBottles;
    this.lid.rotation.x = equipment.drinking ? 1.15 * ease(t / 0.35) * (1 - ease((t - 0.8) / 0.5)) : 0;
    this.held.visible = equipment.drinking && t > 0.35;
    if (!this.held.visible) return;
    this.start.copy(this.storage);
    this.end.set(seat.x + 0.09, seat.y - 0.18, -seat.along - 0.33);
    if (this.start.distanceTo(this.end) > 1.2) this.start.set(this.end.x + 0.08, this.end.y - 0.45, this.end.z + 0.12);
    const lift = ease((t - 0.35) / 0.85), lower = ease((t - 3) / 1);
    this.held.position.lerpVectors(this.start, this.end, lift);
    this.held.position.y -= lower * 0.38;
    this.held.rotation.set(0.95 * ease((t - 1.2) / 0.45) * (1 - lower), 0, -0.14 * lift);
  }
  dispose(): void {
    this.stock.dispose(); this.stock.removeFromParent(); this.held.removeFromParent();
    this.bottle.dispose(); this.hand.dispose(); this.material.dispose();
  }
}
