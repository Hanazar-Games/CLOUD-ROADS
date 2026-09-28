import type { ServiceArchitecture } from './ServiceArchitecture';

type Part = (x: number, along: number, y: number, width: number, height: number, length: number, color: number) => void;

export function serviceDetails(architecture: ServiceArchitecture, solid: Part, glass: Part, light: Part): void {
  const frame = architecture === 'lodge' ? 0x594c3c : architecture === 'courtyard' ? 0x9e7451 : 0x40585e;
  const stone = architecture === 'courtyard' ? 0xd8c4a0 : 0xbcc7c3;
  const accents = architecture === 'lodge' ? [0x526e61, 0x8e6449, 0x6d7978] : architecture === 'courtyard'
    ? [0xa56947, 0x758369, 0xb08b53] : [0x397b80, 0x566d96, 0x9f7150];
  for (const a of [18, 28, 38]) {
    glass(26.08, a, 2.85, 0.09, 1.65, 4.2, 0xffffff);
    for (const edge of [-2.2, 0, 2.2]) solid(26.14, a + edge, 2.85, 0.16, 1.85, 0.11, frame);
    for (const y of [1.98, 3.72]) solid(26.15, a, y, 0.18, 0.1, 4.45, frame);
    solid(26.24, a, 1.88, 0.4, 0.16, 4.6, stone);
  }
  for (let i = 0; i < 6; i++) {
    const a = 15 + i * 6, accent = accents[i % accents.length];
    solid(32.45, a, 4.12, 0.16, 0.48, 5.8, accent);
    solid(32.36, a, 4.38, 0.12, 0.07, 5.85, stone);
    solid(39.13, a, 4.43, 0.12, 0.42, 5.4, accent);
    for (const edge of [-2.9, 2.9]) {
      solid(35.9, a + edge, 3.83, 6.5, 0.18, 0.14, frame);
      solid(33, a + edge * 0.7, 4.33, 0.12, 0.3, 0.12, stone);
    }
    for (const y of [1.32, 2.18]) solid(39.03, a + 1.9, y, 0.16, 0.07, 1.12, stone);
    glass(39.18, a + 1.9, 1.74, 0.07, 0.74, 1.02, 0xffe1ad);
    light(38.94, a, 3.65, 0.12, 0.045, 2.6, 0xffefcd);
  }
  for (const a of [11.76, 48.24]) for (const x of [43, 49, 55, 61]) {
    glass(x, a, 5.55, 4.5, 1.3, 0.09, 0xffffff);
    solid(x, a, 4.83, 4.7, 0.1, 0.14, frame);
    solid(x, a, 6.27, 4.7, 0.1, 0.14, frame);
    for (const edge of [-2.3, 0, 2.3]) solid(x + edge, a, 5.55, 0.09, 1.5, 0.16, frame);
  }
  for (const x of [36.1, 67.9]) solid(x, 30, 7.48, 0.2, 0.42, 41, stone);
  for (const a of [9.6, 50.4]) solid(52, a, 7.48, 32, 0.42, 0.2, stone);
  for (const x of [48, 58]) {
    for (const edge of [-2.6, 2.6]) solid(x + edge, 31, 7.7, 0.12, 0.8, 8.2, frame);
    for (const a of [26.85, 35.15]) {
      solid(x, a, 7.68, 5.2, 0.78, 0.12, 0x788984);
      for (let dx = -2; dx <= 2; dx += 0.5) solid(x + dx, a, 7.69, 0.1, 0.58, 0.15, frame);
    }
  }
  for (const a of [64.8, 71, 77, 83.2]) {
    solid(44.68, a, 1.65, 0.18, 3.3, 0.2, stone);
    for (let y = 0.45; y < 2.7; y += 0.42) solid(44.63, a, y, 0.22, 0.055, 0.27, frame);
  }
  for (const a of [64.3, 83.7]) {
    solid(42.8, a, 2.93, 5.1, 0.13, 0.12, frame);
    solid(44.67, a, 1.45, 0.19, 2.9, 0.19, frame);
  }
  for (const a of [68, 74, 80]) {
    solid(44.54, a, 3.14, 0.3, 0.13, 2.85, frame);
    light(44.36, a, 3.09, 0.07, 0.035, 1.1, 0xfff0d6);
    for (const edge of [-0.4, 0.4]) solid(46 + edge, a, 4.94, 0.12, 0.08, 1.25, stone);
  }
  for (const a of [-47, -38, -29]) {
    solid(14, a, 5.23, 22.3, 0.2, 0.16, 0x7d928b);
    for (const x of [3, 25]) {
      solid(x, a, 5.05, 0.7, 0.2, 0.8, stone);
      solid(x, a, 5.24, 1.4, 0.16, 1.2, frame);
    }
  }
  for (const a of [-43, -33]) for (const x of [13, 15]) {
    solid(x, a - 0.373, 1.13, 0.56, 0.33, 0.035, 0x243c40);
    for (let i = 0; i < 3; i++) {
      solid(x - 0.16 + i * 0.16, a - 0.397, 1.18, 0.09, 0.035, 0.018, 0xc2d7b7);
      solid(x - 0.16 + i * 0.16, a - 0.397, 1.05, 0.07, 0.05, 0.018, stone);
    }
    solid(x, a, 0.32, 0.8, 0.14, 0.75, frame);
    for (const edge of [-0.35, 0.35]) solid(x + edge, a, 0.78, 0.035, 0.68, 0.68, stone);
  }
  for (const a of [58, 89]) for (const x of [40, 41.2]) {
    solid(x, a, 1.13, 0.86, 0.09, 0.86, frame);
    solid(x, a - 0.42, 0.87, 0.45, 0.19, 0.05, 0x243c40);
    solid(x, a - 0.45, 0.59, 0.25, 0.12, 0.025, x === 40 ? 0x93c7b2 : 0xa5bfda);
    for (const dx of [-0.22, 0.22]) solid(x + dx, a - 0.42, 0.3, 0.035, 0.35, 0.03, stone);
  }
}
