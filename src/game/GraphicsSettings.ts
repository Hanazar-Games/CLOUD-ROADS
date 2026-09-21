export const graphicsPresets = {
  economy: { scale: 0.65, shadows: 0, samples: 0, radius: 6, clouds: false, detail: 0, cloudSteps: 12 },
  balanced: { scale: 1, shadows: 2048, samples: 2, radius: 8, clouds: true, detail: 1, cloudSteps: 20 },
  quality: { scale: 1, shadows: 2048, samples: 4, radius: 12, clouds: true, detail: 2, cloudSteps: 28 },
} as const;

export function renderPixelRatio(width: number, height: number, dpr: number, scale: number, limit: number): number {
  return Math.min(Math.min(dpr, 1.5) * scale, limit / Math.max(1, width, height));
}
