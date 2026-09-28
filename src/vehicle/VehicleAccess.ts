import type { VehicleOperations } from './VehicleOperations';

export class VehicleAccess {
  closing = false;
  constructor(readonly operations: VehicleOperations, readonly entering: boolean) {
    operations.accessing = true; this.command(true);
  }
  private command(open: boolean): void {
    const target = open && this.operations.label('doors') ? 1 : 0;
    if (this.operations.target.doors !== target) this.operations.events++;
    this.operations.target.doors = target;
  }
  step(): 'transfer' | 'complete' | undefined {
    if (!this.closing) return !this.operations.label('doors') || this.operations.doors >= 0.999 ? 'transfer' : undefined;
    if (this.operations.doors > 0.001) return;
    this.operations.accessing = false; return 'complete';
  }
  close(): void { this.closing = true; this.command(false); }
  cancel(): void { this.operations.accessing = false; this.command(false); }
}
