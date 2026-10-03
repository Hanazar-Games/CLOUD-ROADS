export const graphicsPresets = {
  minimal: { scale: 0.35, shadows: 0, samples: 1, radius: 3, clouds: false, detail: 0, cloudSteps: 12, lod: 0.5, trees: 0, plantShadows: 0, budget: 1, vehicles: 0, foliage: 0, ground: 0, flowers: 0, rocks: 0, details: 0 },
  economy: { scale: 0.65, shadows: 0, samples: 0, radius: 6, clouds: false, detail: 0, cloudSteps: 12, lod: 0.5, trees: 0.25, plantShadows: 0, budget: 2, vehicles: 120, foliage: 60, ground: 35, flowers: 25, rocks: 60, details: 50 },
  balanced: { scale: 1, shadows: 2048, samples: 2, radius: 8, clouds: true, detail: 1, cloudSteps: 20, lod: 1, trees: 1, plantShadows: 1, budget: 4, vehicles: 240, foliage: 100, ground: 100, flowers: 100, rocks: 100, details: 100 },
  quality: { scale: 1, shadows: 2048, samples: 4, radius: 12, clouds: true, detail: 2, cloudSteps: 28, lod: 1.5, trees: 1, plantShadows: 2, budget: 8, vehicles: 480, foliage: 100, ground: 100, flowers: 100, rocks: 100, details: 150 },
} as const;

const steps: Record<string, readonly number[]> = {
  'road-filtering': [1, 2, 4, 8, 16],
  'shadow-quality': [0, 1024, 2048, 4096], 'antialiasing': [0, 1, 2, 4],
  'view-distance': [3, 4, 6, 8, 12, 16], 'frame-limit': [30, 60, 90, 120, 144, 165, 240, 0],
};
export const graphicsControls = ['render-scale', 'shadow-quality', 'antialiasing', 'view-distance', 'map-detail', 'cloud-quality',
  'vegetation-lod', 'distant-trees', 'vegetation-shadows', 'vegetation-budget', 'vehicle-detail-distance',
  'tree-density', 'ground-density', 'flower-density', 'rock-density', 'detail-distance', 'parked-detail-limit', 'garage-cache',
  'road-texture', 'road-relief', 'road-filtering', 'model-load-budget', 'model-preload-distance', 'terrain-upload-budget', 'terrain-upload-limit', 'terrain-preload'] as const;
const ratios = ['render-scale', 'vegetation-lod', 'distant-trees'];
export function graphicsValue(id: string, position: number): number { return steps[id]?.[position] ?? (ratios.includes(id) ? position / 100 : position); }
export function graphicsPosition(id: string, value: number): number { return steps[id] ? steps[id].indexOf(value) : ratios.includes(id) ? Math.round(value * 100) : value; }
export function graphicsLabel(id: string, position: number): string {
  const value = graphicsValue(id, position);
  if (id === 'frame-limit') return value ? `${value} FPS` : '不限帧率';
  if (id === 'view-distance') return `约 ${(value * 256 / 1000).toFixed(1)} km`;
  if (id === 'shadow-quality') return value ? String(value) : '关闭';
  if (id === 'antialiasing') return ['关闭', '轻量 FXAA', '2× + FXAA', '4× + FXAA'][position];
  if (id === 'map-detail') return ['轻量', '标准', '丰富'][position];
  if (id === 'road-texture') return ['256 · 轻量', '2048 · 高清'][position];
  if (id === 'road-relief') return ['关闭', '近处凹凸', '延伸凹凸'][position];
  if (id === 'road-filtering') return `${value}×`;
  if (id === 'model-load-budget' || id === 'terrain-upload-budget') return `${value} ms / 帧`;
  if (id === 'model-preload-distance') return value ? `提前 ${value} m` : '仅当前距离';
  if (id === 'terrain-preload') return value ? `提前 ${value * 256} m` : '关闭';
  if (id === 'terrain-upload-limit') return `${value} 块 / 帧`;
  if (id === 'vegetation-shadows') return ['关闭', '精细近景', '近景与中景'][position];
  if (id === 'vegetation-budget') return `${value} 块 / 帧`;
  if (id === 'vehicle-detail-distance') return `${value} m`;
  if (id === 'parked-detail-limit') return `${value} 辆`;
  if (id === 'garage-cache') return `${value} 层`;
  if (id === 'cloud-quality') return `${value} · ${value < 18 ? '轻量' : value < 24 ? '均衡' : '精细'}`;
  return `${Math.round(value * (ratios.includes(id) ? 100 : 1))}%`;
}

export function renderPixelRatio(width: number, height: number, dpr: number, scale: number, limit: number): number {
  return Math.min(Math.min(dpr, 1.5) * scale, limit / Math.max(1, width, height));
}
