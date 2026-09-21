export const bridgeTier = (height: number): 0 | 1 | 2 => height > 100 ? 2 : height > 50 ? 1 : 0;
export const bridgeSpacing = (height: number): number => 48 * 2 ** bridgeTier(height);
