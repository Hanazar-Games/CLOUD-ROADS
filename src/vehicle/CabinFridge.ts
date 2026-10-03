import { Group, Vector3 } from 'three';
import type { VehicleDetailKit } from './VehicleDetails';
import type { VehicleProfile } from './VehicleConfig';

export function cabinFridge(p: VehicleProfile, parent: Group, kit: VehicleDetailKit, detailed = true): { indicator: Group; lid: Group; storage: Vector3 } {
  const root = new Group(), bike = p.shape === 'motorcycle';
  root.name = 'vehicle-fridge'; parent.add(root);
  root.position.set(0, bike ? 0.63 : p.eye.y - 0.81, bike ? 0.84 : -p.eye.along + (p.bus ? -0.24 : 0.06));
  const { panel, block, trim, metal } = kit, w = bike ? 0.42 : p.bus ? 0.38 : 0.28, h = bike ? 0.3 : 0.36, l = bike ? 0.44 : 0.48;
  panel(w, 0.035, l, 0, -h / 2 + 0.0175, 0, metal, root);
  for (const side of [-1, 1]) {
    panel(0.025, h, l, side * (w / 2 - 0.0125), 0, 0, metal, root);
    panel(w, h, 0.025, 0, 0, side * (l / 2 - 0.0125), metal, root);
    block(0.014, 0.012, l, side * (w / 2 - 0.018), h / 2, 0, trim, root);
    block(w, 0.012, 0.014, 0, h / 2, side * (l / 2 - 0.018), trim, root);
  }
  const lid = new Group(); lid.name = 'fridge-lid'; lid.position.set(0, h / 2 + 0.016, l / 2); root.add(lid);
  panel(w + 0.012, 0.04, l + 0.012, 0, 0, -l / 2, metal, lid);
  block(w * 0.6, 0.028, 0.028, 0, 0.032, -l + 0.07, trim, lid);
  block(w * 0.42, 0.032, 0.018, 0, h * 0.3, -l / 2 - 0.012, trim, root);
  for (let i = 0; i < 4; i++) block(w * 0.56, 0.01, 0.008, 0, -h * 0.24 + i * 0.022, -l / 2 - 0.007, trim, root);
  for (const side of [-1, 1]) {
    block(0.035, 0.045, l * 0.78, side * w * 0.3, -h / 2 - 0.02, 0, trim, root);
    block(0.06, 0.024, 0.034, side * w * 0.28, h / 2 - 0.005, l / 2 + 0.012, trim, root);
    if (bike) block(0.025, 0.2, 0.035, side * w * 0.34, -h / 2 - 0.07, 0, metal, root);
  }
  root.updateMatrixWorld(true);
  const storage = root.position.clone().add(new Vector3(0, -h / 2 + 0.04, 0));
  if (!detailed) for (const child of [...lid.children]) root.attach(child);
  for (const child of [...root.children]) parent.attach(child);
  root.position.add({ x: -w * 0.21, y: 0.014, z: -l / 2 - 0.016 });
  return { indicator: root, lid, storage };
}
