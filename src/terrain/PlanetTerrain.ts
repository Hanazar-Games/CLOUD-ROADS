import type { Noise } from './Noise';

const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

function craters(noise: Noise, x: number, z: number, spacing: number, salt: number): number {
  const cx = Math.floor(x / spacing), cz = Math.floor(z / spacing);
  let height = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const gx = cx + dx, gz = cz + dz;
    const n = noise.sample(gx * 3.71 + salt, gz * 4.93 - salt);
    const px = (gx + 0.5 + n * 0.24) * spacing;
    const pz = (gz + 0.5 + noise.sample(gx * 7.13 - salt, gz * 2.37 + salt) * 0.24) * spacing;
    const radius = spacing * (0.24 + (n + 1) * 0.07), r = Math.hypot(x - px, z - pz) / radius;
    if (r >= 1.3) continue;
    const bowl = -0.22 * (1 - smooth(r / 0.96));
    const rim = 0.07 * (1 - smooth(Math.abs(r - 0.94) / 0.36));
    height += radius * (bowl + rim);
  }
  return height;
}

export function planetHeight(noise: Noise, x: number, z: number, mars: boolean): number {
  const region = noise.fractal(x / 7400 + 19, z / 7400 - 31, 2);
  const detail = noise.fractal(x / 150, z / 150, 2) * (mars ? 9 : 6);
  const impact = craters(noise, x, z, 2200, 81) + craters(noise, x, z, 620, 173);
  if (!mars) {
    const highland = smooth((region + 0.15) / 0.55);
    return 700 + region * 240 + highland * noise.ridged(x / 1900, z / 2300, 3) * 950 + impact + detail;
  }
  const mesa = smooth((noise.sample(x / 2600, z / 2200) + 0.18) / 0.55);
  const canyon = 1 - smooth(Math.abs(noise.sample(x / 3600 + 47, z / 1700 - 13)) / 0.22);
  const dunes = Math.sin(x / 130 + z / 290 + noise.sample(x / 600, z / 600) * 3) * 12;
  return 720 + region * 360 + mesa * 650 - canyon * (240 + mesa * 170) + impact * 0.45 + dunes * (1 - mesa) + detail;
}
