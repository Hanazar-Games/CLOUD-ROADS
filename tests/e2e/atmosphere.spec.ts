import { expect, test } from '@playwright/test';

test('changes the sky and lighting continuously without moving terrain or losing preferences', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=CLOUD-ROAD-001');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 20_000 });
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 20_000 });
  await page.locator('#pause').click();
  const coordinates = await metric('Coordinates').textContent();
  const clip = { x: 600, y: 80, width: 500, height: 250 };
  await page.locator('#daylight').fill('0');
  await expect(metric('Light phase')).toHaveText('午后');
  const afternoon = await page.screenshot({ clip });
  await page.locator('#daylight').fill('90');
  await expect(metric('Light phase')).toHaveText('日落');
  await expect(metric('Sun elevation')).toHaveText('1.8°');
  const sunset = await page.screenshot({ clip });
  expect(sunset).not.toEqual(afternoon);
  const horizon = await page.locator('#world').evaluate((canvas) => new Promise<number[][]>((resolve) => {
    requestAnimationFrame(() => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl2')!;
      // Sample clear sky just above and below the horizon near the setting sun.
      resolve([0.295, 0.305].map((height) => {
        const pixel = new Uint8Array(4);
        gl.readPixels(Math.floor(gl.drawingBufferWidth / 3), Math.floor(gl.drawingBufferHeight * (1 - height)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return Array.from(pixel).slice(0, 3);
      }));
    });
  }));
  for (let channel = 0; channel < 3; channel++) {
    expect(horizon[0][channel]).toBeGreaterThan(30);
    expect(Math.abs(horizon[0][channel] - horizon[1][channel])).toBeLessThan(5);
  }
  await expect(metric('Coordinates')).toHaveText(coordinates!);
  await page.locator('#daylight').fill('0');
  await expect(metric('Sun elevation')).toHaveText('45.0°');
  expect(await page.screenshot({ clip })).toEqual(afternoon);
  await page.locator('#daylight').fill('90');
  await page.locator('#shadows').click();
  await expect(metric('Terrain shadows')).toHaveText('off');
  await page.locator('#seed').fill('SUNSET-002');
  await page.getByRole('button', { name: '加载种子' }).click();
  await expect(metric('Seed')).toHaveText('SUNSET-002');
  await expect(metric('Light phase')).toHaveText('日落');
  await expect(metric('Terrain shadows')).toHaveText('off');
  await expect(page.locator('#daylight')).toHaveValue('90');
  await page.locator('#sun-view').click();
  await expect(page.locator('#world')).toBeFocused();
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('renders shadows and restores the sunset sky after a context loss and resize', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=CLOUD-ROAD-001');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 20_000 });
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 20_000 });
  await page.locator('#pause').click();
  const calls = Number(await metric('Draw calls').textContent());
  const textures = await metric('GPU textures').textContent();
  const clip = { x: 400, y: 90, width: 700, height: 550 };
  const shadowed = await page.screenshot({ clip });
  await page.locator('#shadows').click();
  await expect(metric('Terrain shadows')).toHaveText('off');
  expect(Number(await metric('Draw calls').textContent())).toBeLessThan(calls);
  expect(await page.screenshot({ clip })).not.toEqual(shadowed);
  await page.locator('#shadows').click();
  await expect(metric('Terrain shadows')).toHaveText('on');
  const before = await page.screenshot({ clip });
  await page.locator('#world').evaluate((canvas) => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 1000);
  });
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toBeHidden();
  await expect(metric('GPU textures')).toHaveText(textures!);
  expect(await page.screenshot({ clip })).toEqual(before);
  await page.setViewportSize({ width: 1024, height: 450 });
  await page.locator('#daylight').fill('100');
  await expect(metric('Sun elevation')).toHaveText('-3.0°');
  await page.locator('#sun-view').click();
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});
