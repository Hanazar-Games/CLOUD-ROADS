import { element } from '../debug/DebugUI';
import type { World } from '../world/World';
import { vehicleProfiles, type VehicleKind } from '../vehicle/VehicleConfig';
import { DrivingSurface } from '../vehicle/DrivingSurface';
import { garageSlots } from './Garage';

export class GaragePanel {
  private readonly events = new AbortController();
  private signature = '';
  constructor(private readonly world: () => World, private readonly locate: (point: { x: number; y: number; z: number; heading: number }) => void) {
    const kinds = element<HTMLSelectElement>('garage-kind');
    kinds.replaceChildren(new Option('随机混合 · 按车位大小匹配', 'random'), ...Object.entries(vehicleProfiles).map(([key, p]) => new Option(p.name, key)));
    const options = { signal: this.events.signal };
    for (const id of ['garage-density', 'garage-kind', 'garage-paint']) element(id).addEventListener(id === 'garage-density' ? 'input' : 'change', () => this.apply(), options);
    element('garage-floor').addEventListener('change', () => this.update(), options);
    element('garage-view').addEventListener('click', () => {
      if (!this.world().roadReady || this.world().searching) return;
      this.locate(this.world().garage.spawn(Number(element<HTMLSelectElement>('garage-floor').value)));
    }, options);
    element('garage-car-view').addEventListener('click', () => {
      const world = this.world(), entry = world.parkedVehicles.fleet.entries.find(e => e.id === element<HTMLSelectElement>('garage-car').value);
      if (!entry || !world.roadReady || world.searching) return;
      const point = new DrivingSurface(world).exit(world.parkedVehicles.fleet.vehicle(entry));
      if (point) this.locate(point);
      else element('garage-status').textContent = '这辆车的车门暂时被挡住，请换一个车位或先进入楼层步行查看。';
    }, options);
    this.apply();
  }
  apply(): void {
    const density = Number(element<HTMLInputElement>('garage-density').value);
    this.world().garage.configure(density, element<HTMLSelectElement>('garage-kind').value as VehicleKind | 'random', element<HTMLSelectElement>('garage-paint').value === 'random');
    element('garage-density-value').textContent = `${density}%`;
    this.signature = '';
  }
  update(): void {
    const world = this.world(), floor = Number(element<HTMLSelectElement>('garage-floor').value), fleet = world.parkedVehicles.fleet;
    const signature = `${world.seed}:${fleet.version}:${floor}`, ready = world.roadReady && !world.searching;
    element<HTMLButtonElement>('garage-view').disabled = !ready;
    if (signature !== this.signature) {
      this.signature = signature;
      const cars = fleet.entries.filter(e => e.id.startsWith('garage:') && Math.abs(e.y - world.garage.position.y + floor * 6) < 0.2);
      const select = element<HTMLSelectElement>('garage-car'), value = select.value;
      select.replaceChildren(...cars.map(e => new Option(`${String(e.slot % garageSlots.length + 1).padStart(2, '0')} · ${vehicleProfiles[e.kind].name} · #${e.paint.toString(16).padStart(6, '0')}`, e.id)));
      if (cars.some(e => e.id === value)) select.value = value;
      if (!cars.length) select.add(new Option(floor ? '本层暂无停放车辆' : '地面入口 · 请选 B1–B5 查看车辆', ''));
      const p = world.garage.position;
      element('garage-status').textContent = `${floor ? `B${floor}` : '地面'} · 本层 ${cars.length} 辆 · 全库 ${fleet.entries.filter(e => e.id.startsWith('garage:')).length} 辆 · 坐标 ${Math.round(p.x)} / ${Math.round(p.z)}`;
    }
    element<HTMLButtonElement>('garage-car-view').disabled = !ready || !element<HTMLSelectElement>('garage-car').value;
  }
  dispose(): void { this.events.abort(); }
}
