export function wiperLayout(width: number, height: number) {
  return { radius: Math.min(height * 0.93, width * 0.44), pivots: [-0.46 * width, 0.04 * width],
    y: -height * 0.44, start: 0.08, arc: 1.56, bladeStart: 0.42, bladeEnd: 1 };
}
