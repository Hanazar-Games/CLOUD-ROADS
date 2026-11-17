import { AIRCRAFT } from './aircraft-flight.js';
import { airportSpawn } from './AirportGround';
import type { World } from '../world/World';
import './airport-dock.css';

export class AirportDock {
  private readonly root = document.createElement('section');
  private readonly events = new AbortController();
  private readonly board: HTMLButtonElement;
  private readonly walk: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly select: HTMLSelectElement;

  constructor(private readonly world: () => World, locate: (point: ReturnType<typeof airportSpawn>) => void,
    board: (aircraft: string) => void) {
    this.root.id = 'airport-dock'; this.root.hidden = true;
    this.root.setAttribute('aria-label', '起点机场登机');
    this.root.innerHTML = `<small>CLOUD ROADS / DEPARTURES</small><strong>云海国际 · 起点机场</strong>
      <p>4000 m 跑道 · 航站楼与机坪已生成在当前世界</p>
      <label for="airport-aircraft">选择机位上的飞机</label><select id="airport-aircraft"></select>
      <span id="airport-model-status" role="status"></span><div><button id="airport-walk" type="button">机坪步行</button><button id="airport-board" type="button">登机驾驶</button></div>
      <p>登机后 N 松驻车，Q / E 滑行转向；可在机库选择跑道起飞。</p>`;
    const select = this.select = this.root.querySelector<HTMLSelectElement>('select')!;
    select.replaceChildren(...AIRCRAFT.map(aircraft => new Option(`${aircraft.name} · ${aircraft.configuration}`, aircraft.id)));
    this.board = this.root.querySelector<HTMLButtonElement>('#airport-board')!;
    this.walk = this.root.querySelector<HTMLButtonElement>('#airport-walk')!;
    this.status = this.root.querySelector<HTMLElement>('#airport-model-status')!;
    select.addEventListener('change', () => this.world().airports.selectAircraft(select.value), { signal: this.events.signal });
    this.board.addEventListener('click', () => board(select.value), { signal: this.events.signal });
    this.walk.addEventListener('click', () => locate(airportSpawn(this.world().airports.sites[0])), { signal: this.events.signal });
    document.getElementById('app')!.append(this.root);
  }

  update(x: number, y: number, z: number, available: boolean, driving: boolean): void {
    const airports = this.world().airports, spawn = airportSpawn(airports.sites[0]);
    const hidden = driving || Math.hypot(x - spawn.x, z - spawn.z) > 240 || Math.abs(y - spawn.y) > 150;
    if (this.root.hidden !== hidden) this.root.hidden = hidden;
    if (this.root.hidden) return;
    if (this.select.value !== airports.aircraftId) this.select.value = airports.aircraftId;
    const disabled = !available || airports.aircraftState !== 'ready';
    if (this.board.disabled !== disabled) this.board.disabled = disabled;
    if (this.walk.disabled === available) this.walk.disabled = !available;
    const status = airports.aircraftState === 'ready' ? '机位飞机就绪 · 可登机滑行' : airports.aircraftState === 'error' ? '飞机模型加载失败，请重新选择机型重试' : '正在准备机位飞机…';
    if (this.status.textContent !== status) this.status.textContent = status;
    if (this.root.dataset.state !== airports.aircraftState) this.root.dataset.state = airports.aircraftState;
  }

  dispose(): void { this.events.abort(); this.root.remove(); }
}
