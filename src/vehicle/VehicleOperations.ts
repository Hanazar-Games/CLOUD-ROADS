import type { VehicleProfile } from './VehicleConfig';

export type VehicleOperation = 'doors' | 'cargo' | 'aux';
export const operationKeys: Record<VehicleOperation, string> = { doors: 'KeyJ', cargo: 'KeyY', aux: 'KeyI' };

export class VehicleOperations {
  doors = 0; cargo = 0; aux = 0;
  readonly target = { doors: 0, cargo: 0, aux: 0 };
  events = 0;
  accessing = false;
  constructor(readonly profile: VehicleProfile) {}
  label(action: VehicleOperation): string {
    const p = this.profile;
    if (action === 'cargo' && (p.body === 'tanker' || p.body === 'mixer')) return '';
    if (action === 'aux' && p.body === 'mixer') return '卸料溜槽';
    if (action === 'aux' && p.body === 'schoolbus') return '侧面停车提示牌';
    if (action === 'cargo' && p.body === 'dumptruck') return '自卸货斗';
    if (action === 'cargo' && p.body === 'pickup') return '皮卡尾板';
    if (action === 'cargo' && p.body === 'firetruck') return '';
    if (action === 'aux' && (p.body === 'ambulance' || p.body === 'firetruck')) return '救援警示灯';
    if (action === 'doors') return p.bus ? '乘客门' : p.shape === 'motorcycle' ? '' : '驾驶室车门';
    if (action === 'cargo') return p.bus ? '行李舱' : p.shape === 'flatbed' || p.trailer?.body === 'flatbed' ? '装载坡板' : p.shape === 'truck' || p.trailer ? '货厢尾门' : '';
    return p.shape === 'supercar' ? '主动尾翼' : p.shape === 'crane' ? '工程警示灯' : p.shape === 'motorcycle' ? '驻车支架' : '';
  }
  get driveReady(): boolean {
    return !this.accessing && this.doors < 0.001 && this.cargo < 0.001 && !this.target.doors && !this.target.cargo
      && (this.profile.shape !== 'motorcycle' || this.aux < 0.001 && !this.target.aux);
  }
  get moving(): boolean { return (['doors', 'cargo', 'aux'] as const).some(key => Math.abs(this[key] - this.target[key]) > 0.001); }
  toggle(action: VehicleOperation, speed: number, driver: boolean): boolean {
    if (this.accessing || !driver || !Number.isFinite(speed) || !this.label(action)
      || (action !== 'aux' || this.profile.shape === 'motorcycle') && Math.abs(speed) > 0.1) return false;
    this.target[action] = 1 - this.target[action]; this.events++; return true;
  }
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const key of ['doors', 'cargo', 'aux'] as const) this[key] += Math.max(-Math.min(dt, 0.1) * 0.65, Math.min(Math.min(dt, 0.1) * 0.65, this.target[key] - this[key]));
  }
}
