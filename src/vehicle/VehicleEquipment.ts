export class VehicleEquipment {
  locked = false;
  fridgeOn = false;
  fridgeTarget = 4;
  fridgeTemperature = 18;
  fridgeCooling = false;

  toggleLock(doors = 0, cargo = 0, accessing = false): boolean {
    if (accessing || ![doors, cargo].every(Number.isFinite) || !this.locked && Math.max(doors, cargo) > 0.001) return false;
    this.locked = !this.locked; return true;
  }

  setFridgeTarget(value: number): void { if (Number.isFinite(value)) this.fridgeTarget = Math.max(0, Math.min(12, Math.round(value))); }

  update(dt: number, powered: boolean): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    this.fridgeCooling = this.fridgeOn && powered && this.fridgeTemperature > this.fridgeTarget + (this.fridgeCooling ? 0.05 : 0.5);
    const target = this.fridgeCooling ? this.fridgeTarget : 22;
    this.fridgeTemperature += (target - this.fridgeTemperature) * (1 - Math.exp(-dt / (this.fridgeCooling ? 45 : 600)));
  }
}
