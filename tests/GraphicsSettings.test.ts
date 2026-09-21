import { expect, it } from 'vitest';
import { renderPixelRatio } from '../src/game/GraphicsSettings';

it('supports 200 percent rendering and fits the complete image within GPU limits', () => {
  expect(renderPixelRatio(1920, 1080, 1, 2, 16384)).toBe(2);
  expect(renderPixelRatio(1920, 1080, 2, 2, 16384)).toBe(3);
  const ratio = renderPixelRatio(7680, 4320, 2, 2, 8192);
  expect(7680 * ratio).toBeLessThanOrEqual(8192);
  expect(4320 * ratio).toBeLessThanOrEqual(8192);
  expect(ratio).toBeCloseTo(8192 / 7680);
});
