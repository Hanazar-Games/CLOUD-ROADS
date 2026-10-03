import { element } from '../debug/DebugUI';
import { sourceText } from '../i18n/DomLocalizer';
import { signalTuning, type SignalVehicle } from '../traffic/TrafficSignals';
import { TrafficRules } from '../traffic/TrafficRules';
import type { World } from '../world/World';

export const trafficControlFields = ['signal-mainGreen', 'signal-crossGreen', 'signal-yellow', 'signal-clearance',
  'rules-enabled', 'rules-red', 'rules-speed', 'rules-limit', 'rules-tolerance', 'rules-duration', 'rules-cooldown', 'signal-countdown'];
export class TrafficControlPanel {
  readonly rules = new TrafficRules();
  private readonly events = new AbortController();
  private world?: World;
  private previousCar?: SignalVehicle;
  private hudTime = 0;
  private driving = false;
  constructor(private readonly getWorld: () => World) {
    for (const id of trafficControlFields) for (const event of ['input', 'change']) element(id).addEventListener(event, () => this.apply(), { signal: this.events.signal });
    this.syncWorld();
  }
  syncWorld(): void {
    if (this.world === this.getWorld()) return;
    this.world = this.getWorld(); this.rules.reset(); this.previousCar = undefined; this.apply();
  }
  private apply(): void {
    const value = (id: string) => Number(element<HTMLInputElement>(id).value), checked = (id: string) => element<HTMLInputElement>(id).checked;
    this.getWorld().signals.configure(Object.fromEntries(Object.keys(signalTuning).map(k => [k, value(`signal-${k}`)])));
    this.rules.enabled = checked('rules-enabled'); this.rules.redWarnings = checked('rules-red'); this.rules.speedWarnings = checked('rules-speed');
    this.rules.speedLimit = value('rules-limit'); this.rules.tolerance = value('rules-tolerance');
    this.rules.duration = value('rules-duration'); this.rules.cooldown = value('rules-cooldown');
    for (const id of trafficControlFields) {
      const output = document.getElementById(`${id}-value`); if (output) output.textContent = `${value(id)} ${id === 'rules-limit' || id === 'rules-tolerance' ? 'km/h' : 's'}`;
    }
    const t = this.getWorld().signals.timing;
    element('signal-settings-status').textContent = `主路红灯 ${t.crossGreen + t.yellow + t.clearance * 2} s · 支路红灯 ${t.mainGreen + t.yellow + t.clearance * 2} s`;
    const warning = this.rules.warning;
    if (!this.rules.enabled || warning && (warning.kind === 'red' ? !this.rules.redWarnings : !this.rules.speedWarnings)) {
      this.rules.warning = undefined; element('traffic-warning').hidden = true;
    }
    this.hudTime = 1;
  }
  update(dt: number, car: SignalVehicle, active: boolean): void {
    if (car !== this.previousCar) { this.rules.reset(); this.previousCar = car; this.hudTime = 1; }
    this.rules.update(dt, car, this.getWorld().signals, active);
    this.hudTime += dt;
    if (this.hudTime < 0.15 && active === this.driving) return;
    this.hudTime = 0; this.driving = active;
    const hint = element('traffic-warning'), warning = this.rules.warning;
    hint.hidden = !active || !warning || !this.rules.enabled;
    if (warning) {
      hint.dataset.kind = warning.kind;
      const text = warning.kind === 'red' ? '交通提醒：已越过红灯停止线，请注意路口车辆。'
        : `交通提醒：持续超速，当前限速 ${this.rules.speedLimit} km/h。请平稳减速。`;
      if (sourceText(hint) !== text) hint.textContent = text;
    }
    const signals = this.getWorld().signals, approach = signals.approach(car), hud = element('signal-guidance');
    hud.hidden = !active || !approach || approach.distance < 0 || approach.distance > 500;
    if (!hud.hidden && approach) {
      const phase = signals.phase(approach.junction, approach.axis);
      hud.dataset.signal = phase.color;
      const text = `${{ red: '红灯停车', yellow: '黄灯谨慎停车', green: '绿灯通行' }[phase.color]} · ${Math.ceil(approach.distance)} m`
        + (element<HTMLInputElement>('signal-countdown').checked ? ` · ${Math.ceil(phase.remaining)} s` : '');
      if (sourceText(hud) !== text) hud.textContent = text;
    }
  }
  dispose(): void { this.events.abort(); }
}
