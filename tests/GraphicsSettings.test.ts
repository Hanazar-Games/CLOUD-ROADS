import { expect, it } from 'vitest';
import { graphicsPosition, graphicsValue, graphicsLabel, renderPixelRatio } from '../src/game/GraphicsSettings';

it('supports 200 percent rendering and fits the complete image within GPU limits', () => {
  expect(renderPixelRatio(1920, 1080, 1, 2, 16384)).toBe(2);
  expect(renderPixelRatio(1920, 1080, 2, 2, 16384)).toBe(3);
  const ratio = renderPixelRatio(7680, 4320, 2, 2, 8192);
  expect(7680 * ratio).toBeLessThanOrEqual(8192);
  expect(4320 * ratio).toBeLessThanOrEqual(8192);
  expect(ratio).toBeCloseTo(8192 / 7680);
});

it('maps stepped sliders to valid GPU and streaming settings and describes their actual values', () => {
  for (const [id, values] of [
    ['shadow-quality', [0, 1024, 2048, 4096]], ['antialiasing', [0, 1, 2, 4]],
    ['view-distance', [6, 8, 12, 16]], ['frame-limit', [30, 60, 90, 120, 144, 165, 240, 0]],
  ] as const) for (const [index, value] of values.entries()) {
    expect(graphicsValue(id, index)).toBe(value); expect(graphicsPosition(id, value)).toBe(index);
  }
  expect(graphicsValue('render-scale', 135)).toBe(1.35);
  expect(graphicsLabel('frame-limit', 7)).toBe('不限帧率');
  expect(graphicsLabel('shadow-quality', 3)).toBe('4096');
  expect(graphicsLabel('tree-density', 45)).toBe('45%');
});
