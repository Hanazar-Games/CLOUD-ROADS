import { expect, it } from 'vitest';
import { createSignAtlas, SIGN_TILE_WIDTH, SIGN_TILE_HEIGHT, SIGN_GUTTER, signLabels } from '../src/road/SignAtlas';

it('draws smooth high-resolution labels inside padded tiles and reuses immutable pixels', () => {
  const atlas = createSignAtlas(), again = createSignAtlas(), { data, width } = atlas.image;
  expect(width).toBe(2048); expect(atlas.anisotropy).toBe(8); expect(again.image.data).toBe(data);
  for (const [tile] of signLabels.entries()) {
    const tx = tile % 4 * SIGN_TILE_WIDTH, ty = Math.floor(tile / 4) * SIGN_TILE_HEIGHT;
    const read = (x: number, y: number) => data![((ty + y) * width + tx + x) * 4];
    const background = read(0, 0), shades = new Set<number>();
    for (let y = 0; y < SIGN_TILE_HEIGHT; y++) {
      expect(read(0, y)).toBe(background); expect(read(SIGN_GUTTER - 1, y)).toBe(background);
      for (let x = SIGN_GUTTER + 25; x < SIGN_TILE_WIDTH - SIGN_GUTTER - 25; x++) shades.add(read(x, y));
    }
    expect(shades.size).toBeGreaterThan(8);
  }
  atlas.dispose(); again.dispose();
});
