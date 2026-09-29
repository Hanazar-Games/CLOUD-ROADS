import type { VehicleOperations } from './VehicleOperations';

export class VehicleAccess {
  closing = false;
  constructor(readonly operations: VehicleOperations, readonly entering: boolean, readonly door: 'doors' | 'cargo' = 'doors') {
    operations.accessing = true; this.command(true);
  }
  private command(open: boolean): void {
    const target = open && this.operations.label(this.door) ? 1 : 0;
    if (this.operations.target[this.door] !== target) this.operations.events++;
    this.operations.target[this.door] = target;
  }
  step(): 'transfer' | 'complete' | undefined {
    if (!this.closing) return !this.operations.label(this.door) || this.operations[this.door] >= 0.999 ? 'transfer' : undefined;
    if (this.operations[this.door] > 0.001) return;
    this.operations.accessing = false; return 'complete';
  }
  close(): void { this.closing = true; this.command(false); }
  cancel(): void { this.operations.accessing = false; this.command(false); }
}
