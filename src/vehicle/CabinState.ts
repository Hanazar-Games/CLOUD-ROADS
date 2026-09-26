import type { VehicleProfile } from './VehicleConfig';

export interface CabinSeat { id: string; label: string; role: 'driver' | 'passenger' | 'operator'; x: number; y: number; along: number; row: number; column: number }
export interface SeatAdjustment { x: number; along: number; height: number; recline: number }

export function cabinSeats(p: VehicleProfile): CabinSeat[] {
  const seats: CabinSeat[] = [{ ...p.eye, id: 'driver', label: '驾驶员', role: 'driver', row: 0, column: 0 }];
  if (p.shape === 'motorcycle') return seats;
  seats.push({ ...p.eye, x: -p.eye.x, id: 'front', label: '前排乘客', role: 'passenger', row: 0, column: 4 });
  if (p.shape === 'sedan' || p.shape === 'suv') for (const [i, x] of [-p.width * 0.25, 0, p.width * 0.25].entries())
    seats.push({ id: `rear-${i}`, label: `后排 ${i + 1}`, role: 'passenger', x, y: p.eye.y, along: -0.55, row: 1, column: i * 2 });
  if (p.shape === 'bus') {
    let row = 1;
    for (let z = -p.chassisLength / 2 + 2; z < p.chassisLength / 2 - 0.7; z += 0.95, row++)
      for (const [i, x] of [-p.width * 0.36, -p.width * 0.15, p.width * 0.15, p.width * 0.36].entries())
        seats.push({ id: `row-${row}-${i}`, label: `${row} 排 ${i + 1} 座`, role: 'passenger', x, y: p.eye.y, along: -z, row, column: i < 2 ? i : i + 1 });
  }
  if (p.shape === 'crane') seats.push({ id: 'operator', label: '吊车操作席', role: 'operator', x: -0.88, y: 1.79, along: -1.55, row: 3, column: 0 });
  return seats;
}

export class CabinState {
  readonly seats: CabinSeat[];
  selected: CabinSeat;
  private readonly adjustments = new Map<string, SeatAdjustment>();
  constructor(profile: VehicleProfile) { this.seats = cabinSeats(profile); this.selected = this.seats[0]; }
  get driver(): boolean { return this.selected.role === 'driver'; }
  get adjustment(): SeatAdjustment {
    let value = this.adjustments.get(this.selected.id);
    if (!value) { value = { x: 0, along: 0, height: 0, recline: 0 }; this.adjustments.set(this.selected.id, value); }
    return value;
  }
  select(id: string, speed: number): boolean {
    const seat = this.seats.find(s => s.id === id);
    if (!seat || !Number.isFinite(speed) || Math.abs(speed) > 0.1) return false;
    this.selected = seat; return true;
  }
  adjust(x: number, along: number, height: number, recline: number): void {
    const a = this.adjustment, clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    a.x = clamp(a.x + x, -0.12, 0.12); a.along = clamp(a.along + along, -0.15, 0.15);
    a.height = clamp(a.height + height, -0.18, 0.08); a.recline = clamp(a.recline + recline, -0.12, 0.35);
  }
  resetAdjustment(): void { this.adjustments.delete(this.selected.id); }
}
