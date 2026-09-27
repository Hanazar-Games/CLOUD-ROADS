import { DataTexture, Group, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, SRGBColorSpace } from 'three';
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
  X:[17,17,10,4,10,17,17],
};
export class VehicleDisplay {
  readonly root = new Group();
  private readonly pixels = new Uint8Array(256 * 128 * 4);
  readonly texture = new DataTexture(this.pixels, 256, 128);
  private readonly material = new MeshBasicMaterial({ map: this.texture, toneMapped: false });
  private readonly geometry = new PlaneGeometry(0.28, 0.14);
  private last = '';
  private elapsed = 0;
  constructor() {
    this.root.name = 'vehicle-display'; this.root.add(new Mesh(this.geometry, this.material));
    this.texture.colorSpace = SRGBColorSpace; this.texture.magFilter = this.texture.minFilter = NearestFilter;
  }
  update(car: VehiclePhysics, systems: VehicleSystems, dt: number, crane?: CraneSystems, operations?: VehicleOperations): void {
    this.elapsed += dt;
    const lines = [
      `${systems.leftSignal ? '<' : ' '} ${Math.round(car.motionSpeed * 3.6)} KM/H ${systems.rightSignal ? '>' : ' '}`,
      `${car.parked ? 'P' : car.speed < -0.1 ? 'R' : car.speed > 0.1 ? `D${car.transmission.gear}` : 'N'} ${Math.round(car.engineRpm / 50) * 50} RPM`,
      `TRIP ${(car.trip / 1000).toFixed(2)} KM`,
      `CH ${systems.radioChannel} ${systems.radioPlaying ? 'ON' : 'OFF'} FAN ${systems.fan}`,
      `L ${systems.beam === 'off' ? '-' : systems.beam === 'high' ? 'HI' : 'ON'} W ${systems.wiperRate ? 'ON' : '-'} G ${systems.washerSpray ? 'ON' : '-'}`,
      `AIR ${systems.fan} ${systems.ambientLight ? 'LED' : '---'} ${systems.cabinLight ? 'READ' : '----'}`,
    ];
    if (car.ignition !== 'running') lines[5] = car.ignition === 'starting' ? 'ENGINE STARTING' : 'ENGINE OFF - F2';
    if (operations && !operations.driveReady) lines[5] = operations.target.doors || operations.doors > 0.001 ? 'DOOR OPEN - PARK' : operations.target.cargo || operations.cargo > 0.001 ? 'GATE OPEN - PARK' : 'STAND DOWN - PARK';
    if (crane) lines.splice(3, 3,
      `CRANE ${crane.stowed ? 'PARK' : crane.enabled ? 'ON' : 'STOW'}`,
      `ARM ${Math.round(crane.angle * 180 / Math.PI)} EXT ${crane.extension.toFixed(1)}`,
      `HOOK ${crane.rope.toFixed(1)} M`);
    const signature = lines.join('|');
    if (signature === this.last || this.elapsed < 0.1 && this.last) return;
    this.elapsed = 0; this.last = signature;
    for (let i = 0; i < this.pixels.length; i += 4) { this.pixels[i] = 5; this.pixels[i + 1] = 17; this.pixels[i + 2] = 24; this.pixels[i + 3] = 255; }
    lines.forEach((line, row) => [...line].forEach((letter, column) => (font[letter] ?? []).forEach((bits, y) => {
      for (let x = 0; x < 5; x++) if (bits & (1 << (4 - x))) for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const index = ((127 - (5 + row * 20 + y * 2 + sy)) * 256 + 7 + column * 12 + x * 2 + sx) * 4;
        if (column * 12 + x * 2 + sx > 245) continue;
        this.pixels[index] = row === 0 ? 115 : 88; this.pixels[index + 1] = 236; this.pixels[index + 2] = row === 0 ? 168 : 240;
      }
    })));
    this.root.userData.display = signature; this.texture.needsUpdate = true;
  }
  dispose(): void { this.texture.dispose(); this.geometry.dispose(); this.material.dispose(); }
}
