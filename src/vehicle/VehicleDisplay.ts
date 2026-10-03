import { DataTexture, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { VehiclePhysics } from './VehiclePhysics';
import type { VehicleSystems } from './VehicleSystems';
import type { CraneSystems } from './CraneSystems';
import type { VehicleOperations } from './VehicleOperations';

const font: Record<string, number[]> = {
  '0':[14,17,19,21,25,17,14], '1':[4,12,4,4,4,4,14], '2':[14,17,1,2,4,8,31], '3':[30,1,1,14,1,1,30], '4':[2,6,10,18,31,2,2],
  '5':[31,16,16,30,1,1,30], '6':[14,16,16,30,17,17,14], '7':[31,1,2,4,8,8,8], '8':[14,17,17,14,17,17,14], '9':[14,17,17,15,1,1,14],
  A:[14,17,17,31,17,17,17], C:[14,17,16,16,16,17,14], D:[30,17,17,17,17,17,30], E:[31,16,16,30,16,16,31], F:[31,16,16,30,16,16,16],
  G:[14,17,16,23,17,17,15], H:[17,17,17,31,17,17,17], I:[14,4,4,4,4,4,14], K:[17,18,20,24,20,18,17], L:[16,16,16,16,16,16,31],
  M:[17,27,21,21,17,17,17], N:[17,25,25,21,19,19,17], O:[14,17,17,17,17,17,14], P:[30,17,17,30,16,16,16], R:[30,17,17,30,20,18,17],
  S:[15,16,16,14,1,1,30], T:[31,4,4,4,4,4,4], U:[17,17,17,17,17,17,14], W:[17,17,17,21,21,27,17],
  '<':[1,2,4,8,4,2,1], '>':[16,8,4,2,4,8,16], '.':[0,0,0,0,0,6,6], '-':[0,0,0,31,0,0,0], '/':[1,2,2,4,8,8,16],
  V:[17,17,17,17,17,10,4],
  X:[17,17,10,4,10,17,17],
  B:[30,17,17,30,17,17,30], J:[7,2,2,2,18,18,12], Q:[14,17,17,17,21,18,13],
  Y:[17,17,10,4,4,4,4], Z:[31,1,2,4,8,16,31], ':':[0,4,4,0,4,4,0],
};
const width = 384, height = 224;
const ink = [179, 223, 230], accent = [126, 242, 208], muted = [110, 149, 167], amber = [255, 189, 105];
export class VehicleDisplay {
  readonly root = new Group();
  private readonly pixels = new Uint8Array(width * height * 4);
  readonly texture = new DataTexture(this.pixels, width, height);
  private readonly material = new MeshBasicMaterial({ map: this.texture, toneMapped: false });
  private readonly geometry = new PlaneGeometry(0.32, 0.32 * height / width);
  private last = '';
  private alert = '';
  private elapsed = 0;
  constructor() {
    this.root.name = 'vehicle-display'; this.root.add(new Mesh(this.geometry, this.material));
    this.texture.colorSpace = SRGBColorSpace; this.texture.magFilter = this.texture.minFilter = LinearFilter;
  }
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
    if (operations && !operations.driveReady) alert = operations.accessing ? 'BOARDING - PARK' : operations.target.doors || operations.doors > 0.001 ? 'DOOR OPEN - PARK' : operations.target.cargo || operations.cargo > 0.001 ? 'GATE OPEN - PARK' : 'STAND DOWN - PARK';
    if (crane) lines.splice(3, 3,
      `CRANE ${crane.stowed ? 'PARK' : crane.enabled ? 'ON' : 'STOW'}`,
      `ARM ${Math.round(crane.angle * 180 / Math.PI)} EXT ${crane.extension.toFixed(1)}`,
      `HOOK ${crane.rope.toFixed(1)} M`);
    lines.push(alert || (car.parked ? 'PARKED' : 'READY'));
    const signature = lines.join('|');
    if (signature === this.last || this.elapsed < 0.1 && this.last && alert === this.alert) return;
    this.elapsed = 0; this.last = signature; this.alert = alert;
    this.rect(0, 0, width, height, [5, 15, 23]);
    this.text('CLOUD / DRIVE', 16, 12, 1, muted);
    this.text('<', 242, 9, 2, systems.leftSignal ? amber : muted);
    this.text('>', 352, 9, 2, systems.rightSignal ? amber : muted);
    this.text(speed, 16, 34, 6, accent);
    this.text('KM/H', 142, 64, 1, muted);
    this.rect(245, 33, 123, 46, [18, 39, 48]);
    this.text(gear, 262, 43, 4, accent);
    this.text(lines[1], 16, 86, 1, ink);
    const level = Math.min(1, Math.max(0, car.powertrain === 'ev' ? car.motionSpeed / car.maxSpeed : car.engineRpm / car.transmission.redline));
    for (let i = 0; i < 36; i++) this.rect(16 + i * 10, 99, 7, 4, i / 36 < level ? i > 29 ? amber : accent : [29, 48, 60]);
    this.text(lines[2], 16, 114, 2, ink);
    this.text(lines[3], 16, 138, 2, ink);
    this.text(lines[4], 16, 162, 2, muted);
    this.text(lines[5], 16, 182, 1, muted);
    this.rect(8, 197, 368, 23, alert ? [57, 37, 23] : [17, 42, 43]);
    this.text(lines[6], 16, 202, 2, alert ? amber : accent);
    this.root.userData.display = signature; this.texture.needsUpdate = true;
  }
  private rect(x: number, y: number, w: number, h: number, color: number[]): void {
    for (let row = Math.max(0, y); row < Math.min(height, y + h); row++) for (let col = Math.max(0, x); col < Math.min(width, x + w); col++) {
      const index = ((height - 1 - row) * width + col) * 4;
      this.pixels[index] = color[0]; this.pixels[index + 1] = color[1]; this.pixels[index + 2] = color[2]; this.pixels[index + 3] = 255;
    }
  }
  private text(value: string, x: number, y: number, scale: number, color: number[]): void {
    [...value].forEach((letter, column) => (font[letter] ?? []).forEach((bits, row) => {
      for (let bit = 0; bit < 5; bit++) if (bits & (1 << (4 - bit))) this.rect(x + (column * 6 + bit) * scale, y + row * scale, scale, scale, color);
    }));
  }
  dispose(): void { this.texture.dispose(); this.geometry.dispose(); this.material.dispose(); }
}
