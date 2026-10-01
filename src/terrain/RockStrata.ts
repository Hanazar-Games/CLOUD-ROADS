export function stratifiedHeight(height: number, spacing: number, strength: number): number {
  const layer = height / spacing, t = layer - Math.floor(layer);
  return height + (t * t * (3 - 2 * t) - t) * spacing * strength;
}
