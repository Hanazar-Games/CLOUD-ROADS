import type { VehicleProfile } from './VehicleConfig';
import { Box3, Vector3 } from 'three';

export function cabinBounds(p: VehicleProfile, rideHeight: number): Box3 {
  const top = p.height - rideHeight;
  if (p.shape === 'roadster') return new Box3(new Vector3(-0.81, -0.25, -0.85), new Vector3(0.81, 1.055, 1.23));
  if (p.bus) return new Box3(new Vector3(-p.width / 2 + 0.075, p.eye.y - 1.15, -p.length / 2 + 0.045),
    new Vector3(p.width / 2 - 0.075, top - 0.1, p.length / 2 - 0.045));
  if (p.body === 'camper') return new Box3(new Vector3(-p.width / 2 + 0.06, -0.3, -p.length / 2 + 0.08),
    new Vector3(p.width / 2 - 0.06, top - 0.09, p.length / 2 - 0.05));
  const passenger = ['sedan', 'suv', 'supercar'].includes(p.shape), nose = -p.chassisLength / 2;
  const front = passenger ? p.body === 'limousine' ? -2.45 : p.body === 'pickup' ? -1.35 : -0.8 : nose + 0.08;
  const back = passenger ? p.body === 'limousine' ? 2.5 : p.body === 'pickup' ? 0.3 : p.shape === 'suv' || p.body === 'hatchback'
    ? p.chassisLength / 2 - 0.12 : p.shape === 'supercar' ? 0.95 : 1.3 : nose + (p.chassisLength > 6 ? 2.5 : 2);
  const roof = p.body === 'expedition' ? top - 0.4 : passenger || p.body === 'van' ? top : Math.min(top, p.eye.y + 0.4);
  return new Box3(new Vector3(-p.width / 2 + 0.06, -0.3, front), new Vector3(p.width / 2 - 0.06, roof - 0.09, back));
}

export interface CabinSeat { id: string; label: string; role: 'driver' | 'passenger' | 'operator'; x: number; y: number; along: number; row: number; column: number; floor: number }
export interface SeatAdjustment { x: number; along: number; height: number; recline: number }
export const busSeatWidth = (p: VehicleProfile): number => Math.min(0.4, (p.width - 0.8) / 4.3);

export function cabinSeats(p: VehicleProfile): CabinSeat[] {
  const seats: CabinSeat[] = [{ ...p.eye, id: 'driver', label: '驾驶员', role: 'driver', row: 0, column: 0, floor: 1 }];
  if (p.shape === 'motorcycle') return seats;
  if (p.shape !== 'bus') seats.push({ ...p.eye, x: -p.eye.x, id: 'front', label: '前排乘客', role: 'passenger', row: 0, column: 4, floor: 1 });
  if ((p.shape === 'sedan' || p.shape === 'suv') && p.body !== 'pickup') for (const [i, x] of [-p.width * 0.25, 0, p.width * 0.25].entries())
    seats.push({ id: `rear-${i}`, label: `后排 ${i + 1}`, role: 'passenger', x, y: p.eye.y, along: Math.min(p.eye.along - 0.8, p.body === 'limousine' ? -1.7 : -0.55), row: 1, column: i * 2, floor: 1 });
  if (p.bus) for (const [deck, rows] of p.bus.rows.entries()) {
    const front = p.bus.rows.length > 1 ? p.chassisLength / 2 - 3.6 : p.eye.along - 0.9;
    const inner = 0.26 + busSeatWidth(p) * 0.58, outer = p.width / 2 - 0.08 - busSeatWidth(p) * 0.58;
    for (let row = 1; row <= rows; row++)
      for (const [i, x] of [-outer, -inner, inner, outer].entries())
        seats.push({ id: `${deck ? 'upper-' : ''}row-${row}-${i}`, label: `${p.bus.rows.length > 1 ? `${deck + 1}F · ` : ''}${row} 排 ${i + 1} 座`,
          role: 'passenger', x, y: p.eye.y + deck * p.bus.deckHeight, along: front - (row - 1) * 0.8, row, column: i < 2 ? i : i + 1, floor: deck + 1 });
  }
  if (p.shape === 'crane') seats.push({ id: 'operator', label: '吊车操作席', role: 'operator', x: -0.88, y: 1.79, along: -1.55, row: 3, column: 0, floor: 1 });
  return seats;
}

export class CabinState {
  readonly seats: CabinSeat[];
  selected: CabinSeat;
  standing = false;
  private readonly adjustments = new Map<string, SeatAdjustment>();
  constructor(profile: VehicleProfile) { this.seats = cabinSeats(profile); this.selected = this.seats[0]; }
  get driver(): boolean { return !this.standing && this.selected.role === 'driver'; }
  get adjustment(): SeatAdjustment {
    let value = this.adjustments.get(this.selected.id);
    if (!value) { value = { x: 0, along: 0, height: 0, recline: 0 }; this.adjustments.set(this.selected.id, value); }
    return value;
  }
  select(id: string, speed: number): boolean {
    const seat = this.seats.find(s => s.id === id);
    if (!seat || !Number.isFinite(speed) || Math.abs(speed) > 0.1) return false;
    this.selected = seat; this.standing = false; return true;
  }
  adjust(x: number, along: number, height: number, recline: number): void {
    const a = this.adjustment, clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    a.x = clamp(a.x + x, -0.12, 0.12); a.along = clamp(a.along + along, -0.15, 0.15);
    a.height = clamp(a.height + height, -0.18, 0.08); a.recline = clamp(a.recline + recline, -0.12, 0.35);
  }
  resetAdjustment(): void { this.adjustments.delete(this.selected.id); }
}
