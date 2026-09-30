import { element } from '../debug/DebugUI';
import { bindingActions, type KeyBindings } from '../input/KeyBindings';
import type { DrivingSystem } from '../vehicle/DrivingSystem';
import { lightNames, wiperNames } from '../vehicle/VehicleSystems';

export class CabinDialogs {
  private readonly seats = element<HTMLDialogElement>('seat-dialog');
  private readonly menu = element<HTMLDialogElement>('controls-menu');
  private readonly vehicle = element<HTMLDialogElement>('vehicle-panel');
  private readonly events = new AbortController();
  get open(): boolean { return this.seats.open || this.menu.open || this.vehicle.open; }
  constructor(private readonly driving: DrivingSystem, private readonly clear: () => void, pause: () => void, settings: (category?: string) => void, private readonly bindings: KeyBindings) {
    const options = { signal: this.events.signal };
    element('seat-open').addEventListener('click', () => this.showSeats(), options);
    element('menu-open').addEventListener('click', () => this.showMenu(), options);
    element('menu-pause').addEventListener('click', () => { pause(); this.close(); }, options);
    element('menu-settings').addEventListener('click', () => { this.close(); settings(); }, options);
    element('menu-seats').addEventListener('click', () => this.showSeats(), options);
    for (const id of ['hud-vehicle-panel', 'vehicle-panel-settings']) element(id).addEventListener('click', () => this.showVehicle(), options);
    element('panel-seats').addEventListener('click', () => this.showSeats(), options);
    element('panel-shortcuts').addEventListener('click', () => this.showMenu(), options);
    for (const category of ['driving', 'equipment']) element(`panel-${category}`).addEventListener('click', () => { this.close(); settings(category); }, options);
    for (const dialog of [this.seats, this.menu, this.vehicle]) {
      dialog.querySelector('button[data-close]')!.addEventListener('click', () => this.close(), options);
      dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); }, options);
      dialog.addEventListener('beforetoggle', this.clear, options);
    }
    this.vehicle.addEventListener('click', event => {
      if (this.vehicle.open && event.target instanceof Element && event.target.closest('button')) this.syncVehicle();
    }, options);
  }
  showSeats(floor = this.driving.cabin.standing ? this.driving.cabinWalk.floor : this.driving.cabin.selected.floor): void {
    if (!this.driving.active) { this.showMenu(); element('menu-status').textContent = this.bindings.format('先进入车辆，再按 P 选择座位。'); return; }
    const cabin = this.driving.cabin, cargo = this.driving.cabinWalk.layout?.entry === 'cargo';
    const moving = this.driving.car.motionSpeed > 0.1 || this.driving.operations.accessing || cargo;
    const walk = element<HTMLButtonElement>('seat-walk');
    walk.disabled = moving || (cabin.standing ? !this.driving.cabinWalk.nearestSeat(cabin) : !this.driving.cabinWalk.layouts.some(l => l.entry === 'cabin'));
    walk.textContent = `${cabin.standing ? '就近坐下' : '车内离座'} · ${this.bindings.label('CabinWalk')}`;
    const decks = [...new Set(cabin.seats.map(s => s.floor))], nav = element('seat-decks'); nav.replaceChildren(); nav.hidden = decks.length < 2;
    for (const deck of decks) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.deck = String(deck);
      button.textContent = `${deck}F · ${deck === 1 ? '下层' : '上层'} ${cabin.seats.filter(s => s.floor === deck).length} 席`;
      button.setAttribute('aria-pressed', String(deck === floor)); button.setAttribute('aria-controls', 'seat-map');
      button.addEventListener('click', () => this.showSeats(deck)); nav.append(button);
    }
    const map = element('seat-map'); map.replaceChildren();
    for (const seat of cabin.seats.filter(s => s.floor === floor)) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.seat = seat.id;
      button.textContent = seat.label; button.style.gridColumn = String(seat.column + 1); button.style.gridRow = String(seat.row + 1);
      button.className = `seat ${seat.role}`; button.setAttribute('aria-pressed', String(!cabin.standing && cabin.selected.id === seat.id));
      button.disabled = moving;
      button.addEventListener('click', () => { if (this.driving.selectSeat(seat.id)) this.close(); });
      map.append(button);
    }
    element('seat-status').textContent = cargo ? '货厢与驾驶室独立，请先走到尾门下车，再进入驾驶室。' : moving ? '请先停车并等待上下车完成；打开座位图会冻结行驶，但不会改变车速。' : `${this.driving.car.profile.name} · 当前：${cabin.standing ? '车内步行' : cabin.selected.label} · ${cabin.seats.length} 席 · 只有驾驶员可以开车`;
    this.show(this.seats);
  }
  showMenu(): void {
    element('shortcut-list').replaceChildren(...bindingActions.map(([id, , group, action]) => {
      const row = document.createElement('tr');
      for (const text of [group, this.bindings.label(id), action]) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); }
      return row;
    }));
    element('menu-status').textContent = '当前快捷键 · 设置 → 快捷键中修改。Esc 关闭弹窗；拖动鼠标观察，双击锁定鼠标。'; this.show(this.menu);
  }
  showVehicle(): void {
    this.syncVehicle(); this.show(this.vehicle);
  }
  private syncVehicle(): void {
    this.driving.describeEquipment();
    const { car, cabin, systems: s, active } = this.driving, p = car.profile, glass = p.shape !== 'motorcycle';
    element('vehicle-panel-title').textContent = p.name;
    element('vehicle-panel-state').textContent = active ? `${cabin.standing ? `${this.driving.cabinWalk.layout?.label} · 车内步行` : cabin.selected.label} · ${cabin.driver ? '驾驶权限' : '设备操作 · 不能驾驶'} · ${Math.round(Math.abs(car.speed) * 3.6)} km/h · ${car.transmission.gear} 挡 / ${Math.round(car.engineRpm)} RPM · 行程 ${(car.trip / 1000).toFixed(2)} km` : '车型预览 · 开始驾驶后可选择座位';
    const specs = [['动力类型', car.powertrain === 'ev' ? `EV · 单速 · 回收 ${car.regeneration} 档` : '燃油 · 多挡传动'], ['车身尺寸', `${p.length} × ${p.width} × ${p.height} m`], ['整备质量', `${(p.mass / 1000).toLocaleString('zh-CN')} t`],
      ['当前输出', `${Math.round(p.power * car.powerScale / 1000)} kW`], ['速度上限', `${Math.round(car.maxSpeed * 3.6)} km/h`],
      ['底盘轴距', `${car.wheelbase.toFixed(2)} m`], ['可选座位', `${cabin.seats.length} 席`],
      ['悬挂调校', `${car.suspension} / 5 · 阻尼 ${Math.round(car.damping * 100)}%`], ['转向辅助', car.steeringAssist ? `${Math.round(car.steeringAssistStrength * 100)}%` : '关闭']];
    element('vehicle-panel-specs').replaceChildren(...specs.flatMap(([label, value]) => {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; return [dt, dd];
    }));
    element('vehicle-panel-equipment').textContent = `车灯 ${lightNames[s.lights]}${glass ? ` · 雨刮 ${wiperNames[s.wipers]} · 车窗 ${Math.round(s.windowTarget * 100)}% · 风机 ${s.fan} / 6 · 玻璃水 ${s.washerFluid.toFixed(1)} L` : ' · 开放骑行，无车窗与雨刮'}`;
    element('vehicle-panel-help').textContent = element('vehicle-summary').textContent;
    element<HTMLButtonElement>('panel-seats').disabled = !active;
    element<HTMLButtonElement>('panel-exit').disabled = !active || car.motionSpeed > 0.1 || !this.driving.nearInteriorExit;
    element<HTMLButtonElement>('panel-walk').disabled = !active || car.motionSpeed > 0.1 || this.driving.operations.accessing
      || (cabin.standing ? !this.driving.cabinWalk.nearestSeat(cabin) : !this.driving.cabinWalk.layouts.some(l => l.entry === 'cabin'));
    element('panel-walk').textContent = `${cabin.standing ? '就近坐下' : '车内离座'} · ${this.bindings.label('CabinWalk')}`;
  }
  private show(dialog: HTMLDialogElement): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.close(); element<HTMLDialogElement>('explorer').close(); this.clear(); dialog.showModal();
  }
  close(): void {
    this.clear(); this.seats.close(); this.menu.close(); this.vehicle.close();
    if (!document.querySelector('dialog[open]') && !element('world').inert) element('world').focus();
  }
  dispose(): void { this.close(); this.events.abort(); }
}
