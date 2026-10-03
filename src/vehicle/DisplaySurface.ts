import { DataTexture, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

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

export const screenWidth = 384, screenHeight = 224;

export class DisplaySurface {
  readonly root = new Group();
  private readonly pixels = new Uint8Array(screenWidth * screenHeight * 4);
  readonly texture = new DataTexture(this.pixels, screenWidth, screenHeight);
  private readonly material = new MeshBasicMaterial({ map: this.texture, toneMapped: false });
  private readonly geometry = new PlaneGeometry(0.32, 0.32 * screenHeight / screenWidth);
  constructor(name: string) {
    this.root.name = name; this.root.add(new Mesh(this.geometry, this.material));
    this.texture.colorSpace = SRGBColorSpace; this.texture.magFilter = this.texture.minFilter = LinearFilter;
  }
  protected rect(x: number, y: number, w: number, h: number, color: readonly number[]): void {
    for (let row = Math.max(0, Math.round(y)); row < Math.min(screenHeight, Math.round(y + h)); row++)
      for (let col = Math.max(0, Math.round(x)); col < Math.min(screenWidth, Math.round(x + w)); col++) {
        const index = ((screenHeight - 1 - row) * screenWidth + col) * 4;
        this.pixels[index] = color[0]; this.pixels[index + 1] = color[1]; this.pixels[index + 2] = color[2]; this.pixels[index + 3] = 255;
      }
  }
  protected text(value: string, x: number, y: number, scale: number, color: readonly number[]): void {
    [...value].forEach((letter, column) => (font[letter] ?? []).forEach((bits, row) => {
      for (let bit = 0; bit < 5; bit++) if (bits & (1 << (4 - bit))) this.rect(x + (column * 6 + bit) * scale, y + row * scale, scale, scale, color);
    }));
  }
  protected line(ax: number, ay: number, bx: number, by: number, color: readonly number[], weight = 1): void {
    const count = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)));
    for (let i = 0; i <= count; i++) {
      const t = count ? i / count : 0;
      this.rect(ax + (bx - ax) * t - weight / 2, ay + (by - ay) * t - weight / 2, weight, weight, color);
    }
  }
  protected ring(x: number, y: number, radius: number, color: readonly number[], weight = 1, from = 0, to = Math.PI * 2): void {
    const count = Math.ceil(Math.abs(to - from) * radius / 3);
    for (let i = 0; i < count; i++) {
      const a = from + (to - from) * i / count, b = from + (to - from) * (i + 1) / count;
      this.line(x + Math.cos(a) * radius, y + Math.sin(a) * radius, x + Math.cos(b) * radius, y + Math.sin(b) * radius, color, weight);
    }
  }
  dispose(): void { this.texture.dispose(); this.geometry.dispose(); this.material.dispose(); }
}
