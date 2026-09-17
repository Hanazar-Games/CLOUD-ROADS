import { expect, test } from '@playwright/test';

test('flies safely from below clouds through fog to the cloud sea and back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  const altitude = async () => Number((await metric('Coordinates').textContent())!.split(',')[1]);
  await page.goto('/');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 20_000 });
  await page.locator('#cloud-view').click();
  await expect(metric('Cloud region')).toHaveText('云下');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 20_000 });
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 20_000 });
  expect(await altitude() - parseFloat((await metric('Ground altitude').textContent())!)).toBeGreaterThanOrEqual(79);
  await page.keyboard.down('Space');
  await expect.poll(altitude).toBeGreaterThan(2000);
  await page.keyboard.up('Space');
  await expect(metric('Cloud region')).toHaveText('云中');
  expect(parseFloat((await metric('Cloud density').textContent())!)).toBeGreaterThan(80);
  expect(Number((await metric('Fog near / far').textContent())!.split('/')[1].replace('m', ''))).toBeLessThan(400);
  const fogColors = await page.locator('#world').evaluate((canvas) => new Promise<number[][]>((resolve) => {
    requestAnimationFrame(() => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl2')!;
      resolve([0.3, 0.5, 0.7].map((height) => {
        const pixel = new Uint8Array(4);
        gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight * height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return Array.from(pixel).slice(0, 3);
      }));
    });
  }));
  for (let channel = 0; channel < 3; channel++) {
    const values = fogColors.map((color) => color[channel]);
    expect(Math.min(...values)).toBeGreaterThan(30);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(8);
  }
  await page.locator('#cloud-toggle').click();
  await expect(metric('Cloud region')).toHaveText('关闭');
  await expect(metric('Fog near / far')).toHaveText('1000 / 1950 m');
  await page.locator('#cloud-toggle').click();
  await page.keyboard.down('Space');
  await expect.poll(altitude).toBeGreaterThan(2500);
  await page.keyboard.up('Space');
  await expect(metric('Cloud region')).toHaveText('云上');
  await expect(metric('Cloud density')).toHaveText('0%');
  await page.keyboard.down('ShiftLeft');
  await expect.poll(altitude, { timeout: 12_000 }).toBeLessThan(1750);
  await page.keyboard.up('ShiftLeft');
  await expect(metric('Cloud region')).toHaveText('云下');
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('keeps cloud preferences across seed changes and freezes the image while paused', async ({ page }) => {
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 20_000 });
  await page.locator('#cloud-view').click();
  await expect(metric('Cloud region')).toHaveText('云下');
  await page.locator('#speed').fill('300');
  await page.locator('#world').focus();
  await page.keyboard.down('Space');
  await expect.poll(async () => Number((await metric('Coordinates').textContent())!.split(',')[1]), { intervals: [50] }).toBeGreaterThan(2600);
  await page.keyboard.up('Space');
  await expect(metric('Cloud region')).toHaveText('云上');
  await page.mouse.move(1000, 300);
  await page.mouse.down();
  await page.mouse.move(1000, 540);
  await page.mouse.up();
  await page.locator('#pause').click();
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 20_000 });
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 20_000 });
  const clip = { x: 500, y: 200, width: 400, height: 400 };
  const before = await page.screenshot({ clip });
  await page.waitForTimeout(500);
  expect(await page.screenshot({ clip })).toEqual(before);
  await page.locator('#world').evaluate((canvas) => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 1000);
  });
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toBeHidden();
  await expect(metric('GPU textures')).toHaveText('6');
  expect(await page.screenshot({ clip })).toEqual(before);
  await page.locator('#cloud-toggle').click();
  await expect(metric('Cloud region')).toHaveText('关闭');
  expect(await page.screenshot({ clip })).not.toEqual(before);
  await page.locator('#seed').fill('CLOUD-TEST-2');
  await page.getByRole('button', { name: '加载种子' }).click();
  await expect(metric('Seed')).toHaveText('CLOUD-TEST-2');
  await expect(metric('Cloud region')).toHaveText('关闭');
  await expect(page.locator('#cloud-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#seed').fill('CLOUD-ROAD-001');
  await page.getByRole('button', { name: '加载种子' }).click();
  await expect(metric('Seed')).toHaveText('CLOUD-ROAD-001');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 20_000 });
  await page.locator('#cloud-view').click();
  await expect(metric('Cloud region')).toHaveText('云下');
  await expect(page.locator('#cloud-toggle')).toHaveAttribute('aria-pressed', 'true');
});
