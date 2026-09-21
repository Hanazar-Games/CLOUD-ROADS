export const bridgeTier = (height: number): 0 | 1 | 2 => height > 100 ? 2 : height > 50 ? 1 : 0;
export const BRIDGE_SPACING = 48;
export const ARCH_HEIGHT = 150;
