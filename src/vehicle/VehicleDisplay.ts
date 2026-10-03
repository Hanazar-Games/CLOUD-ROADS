import { DisplaySurface, screenWidth as width, screenHeight as height } from './DisplaySurface';
import type { VehiclePhysics } from './VehiclePhysics';
import type { VehicleSystems } from './VehicleSystems';
import type { CraneSystems } from './CraneSystems';
import type { VehicleOperations } from './VehicleOperations';

const ink = [179, 223, 230], accent = [126, 242, 208], muted = [110, 149, 167], amber = [255, 189, 105];
export type InstrumentStyle = 'digital' | 'dial';
export class VehicleDisplay extends DisplaySurface {
  style: InstrumentStyle = 'digital';
  private lastStyle?: InstrumentStyle;
  private last = '';
  private alert = '';
  private elapsed = 0;
  constructor() { super('vehicle-display'); }
  update(car: VehiclePhysics, systems: VehicleSystems, dt: number, crane?: CraneSystems, operations?: VehicleOperations): void {
    this.elapsed += dt;
    const gear = car.parked ? 'P' : car.reversing ? 'R' : car.speed > 0.1 ? car.powertrain === 'ev' ? 'D' : `D${car.transmission.gear}` : 'N';
    const speed = String(Math.round(car.motionSpeed * 3.6));
    const lines = [
      `${systems.leftSignal ? '<' : ' '} ${Math.round(car.motionSpeed * 3.6)} KM/H ${systems.rightSignal ? '>' : ' '}`,
      `${gear} ${Math.round(car.engineRpm / 50) * 50} RPM`,
      `TRIP ${(car.trip / 1000).toFixed(2)} KM`,
      `CH ${systems.radioChannel} ${systems.radioPlaying ? 'ON' : 'OFF'} FAN ${systems.fan}`,
      `L ${systems.beam === 'off' ? '-' : systems.beam === 'high' ? 'HI' : 'ON'} W ${systems.wiperRate ? 'ON' : '-'} ${systems.fogLights ? 'FOG' : systems.washerSpray ? 'WASH' : ''}`,
      `AIR ${systems.fan} ${systems.ambientLight ? 'LED' : '---'} ${systems.cabinLight ? 'READ' : '----'}`,
    ];
    if (car.powertrain === 'ev') lines[1] = `EV ${gear} REGEN ${car.regeneration}${car.regenerating ? ' ON' : ''}`;
    if (car.equipment.fridgeOn || car.equipment.locked) lines[5] = `${car.equipment.locked ? 'LOCK' : 'OPEN'} ICE ${car.equipment.fridgeTemperature.toFixed(1)}C`;
    if (car.profile.body === 'sprinkler') lines[5] = `WATER PUMP ${operations?.target.aux && car.ignition === 'running' ? 'ON' : 'OFF'}`;
    let alert = '';
    if (car.trailerBrake) alert = 'TRAILER BRAKE ON';
    if (crane && !crane.stowed) alert = 'CRANE DEPLOYED - PARK';
    if (car.ignition !== 'running') alert = `${car.powertrain === 'ev' ? 'EV' : 'ENGINE'} ${car.ignition === 'starting' ? 'STARTING' : 'OFF'}`;
    if (car.equipment.drinking) alert = 'DRINKING - PARK';
    if (operations && !operations.driveReady) alert = operations.accessing ? 'BOARDING - PARK' : operations.target.doors || operations.doors > 0.001 ? 'DOOR OPEN - PARK' : operations.target.cargo || operations.cargo > 0.001 ? 'GATE OPEN - PARK' : 'STAND DOWN - PARK';
    if (crane) lines.splice(3, 3,
      `CRANE ${crane.stowed ? 'PARK' : crane.enabled ? 'ON' : 'STOW'}`,
      `ARM ${Math.round(crane.angle * 180 / Math.PI)} EXT ${crane.extension.toFixed(1)}`,
      `HOOK ${crane.rope.toFixed(1)} M`);
    lines.push(alert || (car.parked ? 'PARKED' : 'READY'));
    const signature = `${lines.join('|')}|${car.maxSpeed}|${car.transmission.redline}`;
    if (this.style === this.lastStyle && (signature === this.last || this.elapsed < 0.1 && this.last && alert === this.alert)) return;
    this.elapsed = 0; this.last = signature; this.alert = alert; this.lastStyle = this.style;
    this.root.userData.style = this.style;
    this.rect(0, 0, width, height, [5, 15, 23]);
    this.text('CLOUD / DRIVE', 16, 12, 1, muted);
    this.text('<', 242, 9, 2, systems.leftSignal ? amber : muted);
    this.text('>', 352, 9, 2, systems.rightSignal ? amber : muted);
    if (this.style === 'dial' && !crane) {
      this.dial(94, 76, 53, car.motionSpeed * 3.6, Math.ceil(car.maxSpeed * 3.6 / 20) * 20, 'KM/H', accent);
      this.dial(288, 76, 53, car.powertrain === 'ev' ? car.regeneration : car.engineRpm,
        car.powertrain === 'ev' ? 3 : car.transmission.redline, car.powertrain === 'ev' ? 'REGEN' : 'RPM', amber);
      this.text(speed, 78 - speed.length * 3, 83, 2, ink);
      this.text(gear, 177, 55, 3, accent);
    } else {
      this.text(speed, 16, 34, 6, accent);
      this.text('KM/H', 142, 64, 1, muted);
      this.rect(245, 33, 123, 46, [18, 39, 48]);
      this.text(gear, 262, 43, 4, accent);
      this.text(lines[1], 16, 86, 1, ink);
      const level = Math.min(1, Math.max(0, car.powertrain === 'ev' ? car.motionSpeed / car.maxSpeed : car.engineRpm / car.transmission.redline));
      for (let i = 0; i < 36; i++) this.rect(16 + i * 10, 99, 7, 4, i / 36 < level ? i > 29 ? amber : accent : [29, 48, 60]);
    }
    this.text(lines[2], 16, 118, 2, ink);
    this.text(lines[3], 16, 138, 2, ink);
    this.text(lines[4], 16, 162, 2, muted);
    this.text(lines[5], 16, 182, 1, muted);
    this.rect(8, 197, 368, 23, alert ? [57, 37, 23] : [17, 42, 43]);
    this.text(lines[6], 16, 202, 2, alert ? amber : accent);
    this.root.userData.display = signature; this.texture.needsUpdate = true;
  }
  private dial(x: number, y: number, radius: number, value: number, max: number, label: string, color: number[]): void {
    const from = Math.PI * 0.8, sweep = Math.PI * 1.4;
    this.ring(x, y, radius, [54, 69, 78], 3, from, from + sweep);
    this.ring(x, y, radius - 5, color, 1, from, from + sweep);
    for (let i = 0; i <= 20; i++) {
      const angle = from + sweep * i / 20, inner = radius - (i % 5 ? 7 : 12);
      this.line(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, ink, i % 5 ? 1 : 2);
    }
    this.text('0', x - 48, y + 30, 1, muted);
    const top = label === 'RPM' ? (max / 1000).toFixed(0) + 'K' : String(max);
    this.text(top, x + 28, y + 30, 1, muted);
    this.text(label, x - label.length * 3, y - 20, 1, muted);
    const angle = from + sweep * Math.min(1, Math.max(0, value / Math.max(1, max)));
    this.line(x, y, x + Math.cos(angle) * (radius - 14), y + Math.sin(angle) * (radius - 14), [255, 107, 79], 3);
    this.ring(x, y, 4, ink, 3);
  }
}
