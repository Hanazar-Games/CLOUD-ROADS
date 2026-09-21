export const graphicsPresets = {
  economy: { scale: 0.65, shadows: 0, samples: 0, radius: 6, clouds: false },
  balanced: { scale: 1, shadows: 2048, samples: 2, radius: 8, clouds: true },
  quality: { scale: 1, shadows: 2048, samples: 4, radius: 12, clouds: true },
} as const;
