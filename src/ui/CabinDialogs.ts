import { element } from '../debug/DebugUI';
import { shortcuts } from '../input/Shortcuts';
import type { DrivingSystem } from '../vehicle/DrivingSystem';

export class CabinDialogs {
  private readonly seats = element<HTMLDialogElement>('seat-dialog');
  private readonly menu = element<HTMLDialogElement>('controls-menu');
  private readonly events = new AbortController();
  get open(): boolean { return this.seats.open || this.menu.open; }
  constructor(private readonly driving: DrivingSystem, private readonly clear: () => void, pause: () => void, settings: () => void) {
    const options = { signal: this.events.signal };
    element('seat-open').addEventListener('click', () => this.showSeats(), options);
    element('menu-open').addEventListener('click', () => this.showMenu(), options);
    element('menu-pause').addEventListener('click', () => { pause(); this.close(); }, options);
    element('menu-settings').addEventListener('click', () => { this.close(); settings(); }, options);
    element('menu-seats').addEventListener('click', () => this.showSeats(), options);
    element('shortcut-list').innerHTML = shortcuts.map(([group, key, action]) => `<tr><td>${group}</td><th scope="row"><kbd>${key}</kbd></th><td>${action}</td></tr>`).join('');
    for (const dialog of [this.seats, this.menu]) {
      dialog.querySelector('button[data-close]')!.addEventListener('click', () => this.close(), options);
      dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); }, options);
      dialog.addEventListener('beforetoggle', this.clear, options);
    }
  }
  showSeats(): void {
    if (!this.driving.active) { this.showMenu(); element('menu-status').textContent = '先进入车辆，再按 P 选择座位。'; return; }
    const cabin = this.driving.cabin, moving = Math.abs(this.driving.car.speed) > 0.1;
    const map = element('seat-map'); map.replaceChildren();
    for (const seat of cabin.seats) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.seat = seat.id;
      button.textContent = seat.label; button.style.gridColumn = String(seat.column + 1); button.style.gridRow = String(seat.row + 1);
      button.className = `seat ${seat.role}`; button.setAttribute('aria-pressed', String(cabin.selected.id === seat.id));
      button.disabled = moving;
      button.addEventListener('click', () => { if (this.driving.selectSeat(seat.id)) this.close(); });
      map.append(button);
    }
    element('seat-status').textContent = moving ? '请先停车再换座；打开座位图会冻结行驶，但不会改变车速。' : `${this.driving.car.profile.name} · 当前：${cabin.selected.label} · 只有驾驶员可以开车`;
    this.show(this.seats);
  }
  showMenu(): void { element('menu-status').textContent = '选择设置、座位或查看按键。关闭菜单后继续旅程。'; this.show(this.menu); }
  private show(dialog: HTMLDialogElement): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.close(); element<HTMLDialogElement>('explorer').close(); this.clear(); dialog.showModal();
  }
  close(): void {
    this.clear(); this.seats.close(); this.menu.close();
    if (!document.querySelector('dialog[open]') && !element('world').inert) element('world').focus();
  }
  dispose(): void { this.close(); this.events.abort(); }
}
