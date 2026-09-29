import { Group, type Mesh } from 'three';
import type { VehicleProfile } from './VehicleConfig';
import type { VehicleDetailKit } from './VehicleDetails';
import type { VehicleFittings } from './VehicleFittings';

export function busBody(p: VehicleProfile, parent: Group, kit: VehicleDetailKit, fittings: VehicleFittings, rideHeight: number): { windshield: Mesh; windows: Group[]; width: number; height: number } {
  const { block, panel, paint, trim, metal, glass, lamp } = kit, w = p.width, nose = -p.length / 2, end = p.length / 2;
  const top = p.height - rideHeight, decks = p.bus!.rows.length, floor = p.eye.y - 1.2, lowerRoof = decks > 1 ? floor + p.bus!.deckHeight : top;
  block(w - 0.7, 0.18, p.length - 0.1, 0, -0.36, 0, trim, parent);
  block(w - 0.08, 0.1, p.length - 0.12, 0, floor, 0, trim, parent);
  panel(w - 0.08, 0.1, p.length - 0.12, 0, top - 0.05, 0, paint, parent);
  panel(w * 0.7, 0.1, 2, 0, top + 0.01, 1.2, metal, parent);
  const sidePanel = (side: number, from: number, to: number, bottom: number, ceiling: number, material = paint) => {
    if (to > from && ceiling > bottom) {
      if (bottom < p.radius * 2 - rideHeight + 0.06) kit.wheelPanel(from, to, bottom, ceiling, side * (w / 2 - 0.03), material, parent);
      else block(0.065, ceiling - bottom, to - from, side * (w / 2 - 0.03), (ceiling + bottom) / 2, (from + to) / 2, material, parent);
    }
  };
  const bayLength = Math.min(3, p.length * 0.28), bayTop = Math.max(-0.1, floor - 0.07);
  for (const side of [-1, 1]) {
    if (side === -1) sidePanel(side, nose, nose + 1.45, -0.3, floor + 0.1);
    sidePanel(side, nose + 1.45, -bayLength / 2, -0.3, floor + 0.1);
    sidePanel(side, bayLength / 2, end, -0.3, floor + 0.1);
    sidePanel(side, -bayLength / 2, bayLength / 2, bayTop, floor + 0.1);
    const bay = fittings.hinge('cargo', parent, side * w / 2, bayTop, 0, 'z', side * 1.5);
    const bayPanel = kit.wheelPanel(-bayLength / 2, bayLength / 2, -0.3, bayTop, 0, paint, bay); bayPanel.position.y = -bayTop;
    for (const z of [-bayLength / 2 + 0.08, bayLength / 2 - 0.08]) block(0.02, bayTop + 0.22, 0.016, side * 0.037, -(bayTop + 0.3) / 2, z, trim, bay);
    block(0.02, 0.045, 0.18, side * 0.04, -(bayTop + 0.3) * 0.75, 0, metal, bay);
    for (let z = nose + 1.8; z < end - 0.3; z += 1.5) block(0.025, 0.055, 0.12, side * (w / 2 + 0.01), -0.23, z, lamp, parent);
  }
  let windshield!: Mesh;
  const windows: Group[] = [];
  for (let deck = 0; deck < decks; deck++) {
    const eye = p.eye.y + deck * p.bus!.deckHeight, sill = eye - 0.5, ceiling = deck === 0 ? lowerRoof : top;
    const height = ceiling - sill - 0.14, centerY = sill + height / 2;
    for (const z of [nose + 0.045, end - 0.045]) {
      const pane = block(w - 0.16, height, 0.015, 0, centerY, z, glass, parent);
      for (const y of [sill, ceiling - 0.1]) block(w - 0.08, 0.1, 0.085, 0, y, z, trim, parent);
      if (!deck && z < 0) windshield = pane;
      for (const side of [-1, 1]) block(0.085, height + 0.12, 0.085, side * (w / 2 - 0.05), centerY, z, paint, parent);
      block(w, Math.max(0.1, sill - (deck ? floor + deck * p.bus!.deckHeight : -0.3)), 0.06,
        0, (sill + (deck ? floor + deck * p.bus!.deckHeight : -0.3)) / 2, z, paint, parent);
    }
    for (const side of [-1, 1]) {
      const from = !deck ? nose + 1.5 : nose + 0.12;
      block(0.015, height, end - 0.1 - from, side * (w / 2 - 0.075), centerY, (end - 0.1 + from) / 2, glass, parent);
      sidePanel(side, !deck && side === 1 ? nose + 1.45 : nose, end, floor + deck * p.bus!.deckHeight, sill);
      sidePanel(side, nose, end, ceiling - 0.13, ceiling);
      for (let z = from; z < end - 0.2; z += 1.15) block(0.08, height + 0.12, 0.065, side * (w / 2 - 0.05), centerY, z, trim, parent);
      block(0.025, 0.035, end - from, side * (w / 2 - 0.16), ceiling - 0.21, (end + from) / 2, metal, parent);
      if (decks === 1) block(0.33, 0.07, p.length - 2, side * (w / 2 - 0.22), ceiling - 0.23, 0.65, trim, parent);
    }
  }
  const door = fittings.hinge('doors', parent, w / 2 - 0.025, floor, nose + 0.35, 'y', -1.35);
  const doorHeight = lowerRoof - floor - 0.15;
  block(0.065, floor + 0.34, 1.08, 0, -(floor + 0.3) / 2, 0.525, paint, door);
  for (const [from, to] of [[nose, nose + 0.35], [nose + 1.4, nose + 1.51]])
    sidePanel(1, from, to, floor - 0.3, lowerRoof);
  for (const z of [nose + 0.33, nose + 1.42]) block(0.075, doorHeight + 0.08, 0.05, w / 2 - 0.02, floor + doorHeight / 2, z, trim, parent);
  block(0.09, 0.1, 1.45, -w / 2 + 0.05, lowerRoof - 0.09, nose + 0.78, trim, parent);
  for (const z of [nose + 0.08, nose + 1.47]) block(0.075, lowerRoof - p.eye.y + 0.5, 0.07,
    -w / 2 + 0.05, (lowerRoof + p.eye.y - 0.5) / 2, z, trim, parent);
  for (const z of [0, 1.05]) block(0.065, doorHeight, 0.065, 0, doorHeight / 2, z, trim, door);
  block(0.015, doorHeight - 0.14, 0.99, 0, doorHeight / 2, 0.525, glass, door);
  for (const y of [0.04, doorHeight, doorHeight * 0.42]) block(0.07, 0.08, 1.08, 0, y, 0.525, paint, door);
  block(0.07, 0.36, 0.035, -0.045, doorHeight * 0.5, 0.85, metal, door);
  for (let step = 0; step < 3; step++) block(0.65, 0.075, 0.3, w / 2 - 0.3, floor - 0.3 + step * 0.15, nose + 0.6 + step * 0.12, metal, parent);
  const driverWindow = new Group(); driverWindow.name = 'driver-window'; driverWindow.position.set(-w / 2 + 0.065, p.eye.y - 0.5, nose + 0.78); parent.add(driverWindow);
  block(0.015, lowerRoof - p.eye.y + 0.36, 1.32, 0, (lowerRoof - p.eye.y + 0.36) / 2, 0, glass, driverWindow); windows.push(driverWindow);
  for (const side of [-1, 1]) {
    block(0.35, 0.045, 0.08, side * (w / 2 + 0.1), p.eye.y + 0.08, nose + 0.22, trim, parent);
    block(0.16, 0.35, 0.14, side * (w / 2 + 0.2), p.eye.y - 0.06, nose + 0.22, metal, parent);
    block(0.42, 0.13, 0.035, side * w * 0.3, -0.02, nose - 0.01, lamp, parent);
  }
  block(w - 0.12, 0.16, 0.3, 0, p.eye.y - 0.4, nose + 0.26, trim, parent);
  if (decks > 1) {
    const upper = floor + p.bus!.deckHeight;
    const slab = block(w - 0.12, 0.1, p.length - 3, 0, upper, 1.5, trim, parent); slab.name = 'upper-deck-floor';
    block(w * 0.52, 0.1, 2.9, -w * 0.22, upper, nose + 1.45, trim, parent);
    block(w - 0.12, 0.1, 1.15, 0, upper, nose + 0.575, trim, parent);
    block(0.7, 0.08, 0.35, w * 0.3, upper, nose + 2.87, trim, parent);
    for (let i = 0; i < 11; i++) {
      const step = block(0.66, 0.055, 0.16, w * 0.3, floor + (i + 1) * p.bus!.deckHeight / 11, nose + 1.25 + i * 0.15, metal, parent);
      step.name = 'bus-stair';
    }
    for (let i = 0; i < 6; i++) block(0.035, 0.8, 0.035, w * 0.13, floor + 0.65 + i * p.bus!.deckHeight / 6, nose + 1.3 + i * 0.27, metal, parent);
    const rail = block(0.045, 0.045, Math.hypot(p.bus!.deckHeight, 1.6), w * 0.13, floor + p.bus!.deckHeight / 2 + 0.8, nose + 2.05, metal, parent);
    rail.rotation.x = -Math.atan2(p.bus!.deckHeight, 1.6);
  }
  return { windshield, windows, width: w - 0.16, height: lowerRoof - (p.eye.y - 0.5) - 0.14 };
}
