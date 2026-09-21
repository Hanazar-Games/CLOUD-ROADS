import type { Noise } from './Noise';

export function mountainIncision(noise: Noise, x: number, z: number, flank: number, level: number): number {
  const channel = Math.abs(noise.sample(x / 430 + z / 2100, z / 1500 + 211));
  const cut = Math.max(0, 1 - channel / 0.22);
  return cut * cut * flank * (45 + level * 110);
}
