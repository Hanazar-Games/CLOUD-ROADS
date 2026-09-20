import { expect, test } from '@playwright/test';

test('renders continuous concrete bridges and elevated services through distant streaming and context recovery', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  const ready = async () => {
    await expect(metric('Road ready')).toHaveText('yes', { timeout: 45000 });
    await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 45000 });
  };
  await page.goto('/');
  await page.locator('#terrain-kind').selectOption('desert');
  await page.locator('#road-type').selectOption('highway');
  await page.locator('#route-style').selectOption('cliff');
  await page.locator('#view-distance').selectOption('16');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  await expect(metric('Route style')).toHaveText('高架盘山公路'); await ready();
  await expect(metric('Active chunks')).toHaveText('1089');
  expect(parseFloat((await metric('Tallest bridge').textContent())!)).toBeGreaterThan(100);
  await page.locator('#bridge-view').click();
  await page.locator('#walk-toggle').click();
  await expect(metric('Travel mode')).toHaveText('walking');
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyE');
  await expect.poll(async () => parseFloat((await metric('Walking speed').textContent())!)).toBeGreaterThan(25);
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyE');
  await page.locator('#controls-toggle').click();
  await page.locator('#service-view').click();
  await expect.poll(async () => Number((await metric('Coordinates').textContent())!.split(',')[2]), { timeout: 45000 }).toBeLessThan(-5000);
  await ready();
  await expect.poll(async () => Number(await metric('Elevated services').textContent())).toBeGreaterThan(0);
  await expect.poll(async () => Number(await metric('Origin rebases').textContent())).toBeGreaterThan(0);
  await page.screenshot();
  const textures = await metric('GPU textures').textContent();
  await page.locator('#world').evaluate(canvas => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 800);
  });
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toBeHidden({ timeout: 20000 }); await ready();
  await expect(metric('GPU textures')).toHaveText(textures!);
  await page.locator('#walk-toggle').click();
  await expect(metric('Walking grounded')).toHaveText('yes');
  await page.locator('#drive-toggle').click();
  await expect(metric('Travel mode')).toHaveText('driving');
  expect(errors).toEqual([]);
});
