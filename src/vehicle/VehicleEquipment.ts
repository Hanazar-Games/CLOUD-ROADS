export class VehicleEquipment {
  locked = false;
  fridgeOn = false;
  fridgeTarget = 4;
  fridgeTemperature = 18;
  fridgeCooling = false;
  waterBottles = 6;
  waterTemperature = 4;
  waterDrunk = 0;
  drinkTemperature = 4;
  drinkTime = -1;
  get drinking(): boolean { return this.drinkTime >= 0; }

  takeWater(speed: number, seated: boolean): boolean {
    if (!seated || !Number.isFinite(speed) || Math.abs(speed) > 0.1 || this.drinking || this.waterBottles <= 0) return false;
    this.waterBottles--; this.drinkTime = 0; this.drinkTemperature = this.waterTemperature; return true;
  }
  cancelDrink(): void {
    if (this.drinking && this.drinkTime < 2.7) this.waterBottles++;
    this.drinkTime = -1;
  }
  refillWater(speed: number): boolean {
    if (!Number.isFinite(speed) || Math.abs(speed) > 0.1 || this.drinking) return false;
    this.waterBottles = 6; this.waterTemperature = 4; return true;
  }

  toggleLock(doors = 0, cargo = 0, accessing = false): boolean {
    if (accessing || ![doors, cargo].every(Number.isFinite) || !this.locked && Math.max(doors, cargo) > 0.001) return false;
    this.locked = !this.locked; return true;
  }

  setFridgeTarget(value: number): void { if (Number.isFinite(value)) this.fridgeTarget = Math.max(0, Math.min(12, Math.round(value))); }

  update(dt: number, powered: boolean): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    if (this.drinking) {
      const next = this.drinkTime + dt;
      if (this.drinkTime < 2.7 && next >= 2.7) this.waterDrunk += 500;
      this.drinkTime = next >= 4 ? -1 : next;
    }
    this.fridgeCooling = this.fridgeOn && powered && this.fridgeTemperature > this.fridgeTarget + (this.fridgeCooling ? 0.05 : 0.5);
    const target = this.fridgeCooling ? this.fridgeTarget : 22;
    this.fridgeTemperature += (target - this.fridgeTemperature) * (1 - Math.exp(-dt / (this.fridgeCooling ? 45 : 600)));
    this.waterTemperature += (this.fridgeTemperature - this.waterTemperature) * (1 - Math.exp(-dt / 90));
  }
}
