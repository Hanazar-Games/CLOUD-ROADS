import { Box3, Vector3 } from 'three';
import { busSeatWidth, cabinSeats } from './CabinState';
import { suspensionTuning, type VehicleProfile } from './VehicleConfig';

export interface CabinLayout {
  id: string; label: string; part: number; entry: 'cabin' | 'cargo'; bounds: Box3;
  obstacles: Box3[]; furniture: { bounds: Box3; kind: 'bed' | 'counter' | 'bench' }[];
  stairs?: { x: number; width: number; start: number; end: number; rise: number; steps: number };
}
export const interiorBox = (x: number, y: number, z: number, w: number, h: number, l: number): Box3 =>
  new Box3(new Vector3(x - w / 2, y, z - l / 2), new Vector3(x + w / 2, y + h, z + l / 2));

export function cabinLayouts(p: VehicleProfile): CabinLayout[] {
  const ride = p.radius + p.rest - 9.81 / suspensionTuning(3, p).spring, roof = p.height - ride;
  const room = (id: string, label: string, part: number, entry: CabinLayout['entry'], start: number, end: number, floor: number, ceiling: number): CabinLayout =>
    ({ id, label, part, entry, bounds: new Box3(new Vector3(-p.width / 2 + 0.08, floor, start), new Vector3(p.width / 2 - 0.08, ceiling, end)), obstacles: [], furniture: [] });
  if (p.bus) {
    const floor = p.eye.y - 1.15, nose = -p.length / 2;
    const layout = room('saloon', '客车通道', 0, 'cabin', nose + 0.65, p.length / 2 - 0.12, floor, roof - 0.1);
    layout.obstacles = cabinSeats(p).map(s => interiorBox(s.x, floor + (s.floor - 1) * p.bus!.deckHeight,
      -s.along + 0.1, s.role === 'driver' ? 0.61 : busSeatWidth(p) * 1.16, 1.32, 0.65));
    if (p.bus.rows.length > 1) {
      layout.stairs = { x: p.width * 0.3, width: 0.66, start: nose + 1.17, end: nose + 2.83, rise: p.bus.deckHeight, steps: 11 };
      for (let i = 0; i < 6; i++) layout.obstacles.push(interiorBox(p.width * 0.13, floor + 0.2 + i * p.bus.deckHeight / 6,
        nose + 1.3 + i * 0.27, 0.035, 0.8, 0.035));
    }
    return [layout];
  }
  if (p.body === 'camper') {
    const start = -p.length / 2 + 2.65, floor = 0.685;
    const layout = room('living', '房车生活舱', 0, 'cabin', -p.eye.along + 0.45, p.length / 2 - 0.12, floor, roof - 0.09);
    layout.furniture = [
      { kind: 'counter', bounds: interiorBox(-p.width / 2 + 0.39, floor, start + 0.8, 0.62, 0.85, 1.25) },
      { kind: 'bench', bounds: interiorBox(p.width / 2 - 0.4, floor, start + 0.8, 0.64, 0.53, 1.25) },
      { kind: 'bed', bounds: interiorBox(0, floor, p.length / 2 - 0.65, p.width - 0.2, 0.48, 1.02) },
    ];
    layout.obstacles = layout.furniture.map(f => f.bounds);
    return [layout];
  }
  const layouts: CabinLayout[] = [];
  if (p.shape === 'truck' && (!p.body || ['van', 'ambulance', 'refrigerated'].includes(p.body)))
    layouts.push(room('cargo', '货厢', 0, 'cargo', -p.chassisLength / 2 + (p.chassisLength > 6 ? 2.65 : 2.15) + 0.04, p.chassisLength / 2 - 0.05, 0.685, roof - 0.045));
  for (const [i, t] of (p.trailers ?? []).entries()) if (t.body === 'box')
    layouts.push(room(`cargo-${i + 1}`, `第 ${i + 1} 节货厢`, i + 1, 'cargo', -t.front + 0.04, t.length - t.front - 0.05, 0.37, roof - 0.045));
  return layouts.filter(l => l.bounds.max.y - l.bounds.min.y >= 1.05);
}
