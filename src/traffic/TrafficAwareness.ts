export function followingSpeed(gap: number, leaderSpeed: number, acceleration: number, braking: number, headway: number): number {
  const predicted = Math.max(0, leaderSpeed + Math.min(0, acceleration) * Math.min(1.2, headway));
  const reaction = braking * headway;
  return Math.max(0, Math.sqrt(reaction * reaction + predicted * predicted + 2 * braking * Math.max(0, gap)) - reaction);
}

export const laneChangeDuration = (length: number, grip: number): number => (length > 8 ? 5.5 : 4) / Math.sqrt(Math.max(0.2, Math.min(1, grip)));
export const laneBlend = (t: number): number => t * t * t * (10 + t * (-15 + 6 * t));
