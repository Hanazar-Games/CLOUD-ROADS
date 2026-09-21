import { expect, test } from '@playwright/test';

test('retains tuning, paint and detailed vegetation across vehicle, world and graphics recovery', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 960, height: 600 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=FLEET-FLAT');
  await page.locator('#terrain-kind').selectOption('meadow');
  await page.locator('#road-type').selectOption('highway');
  await page.locator('#route-style').selectOption('0');
  await page.locator('#max-grade').fill('0');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30_000 });
  await page.getByText('动力与外观', { exact: true }).click();
  await page.locator('#vehicle-power').fill('125');
  await page.locator('#vehicle-brake').fill('75');
  await page.locator('#vehicle-steering').fill('120');
  await page.locator('#vehicle-paint').selectOption('29485e');
  for (const kind of ['flatbed12', 'crane', 'heavySemi']) {
    await page.locator('#vehicle-kind').selectOption(kind);
    await expect(page.locator('#vehicle-power-value')).toHaveText('125%');
    await expect(page.locator('#vehicle-paint')).toHaveValue('29485e');
    await expect(page.locator('#vehicle-summary')).toContainText('马力');
    for (const view of ['cockpit', 'hood', 'chase']) {
      await page.locator('#driving-view').selectOption(view);
      await page.locator('#drive-toggle').click();
      await expect(page.locator('#drive-hud')).toBeVisible();
      await expect(metric('Vehicle model')).toHaveText(await page.locator('#vehicle-kind option:checked').textContent() ?? '');
      await page.locator('#drive-toggle').click();
      await page.locator('#controls-toggle').click();
    }
  }
  await expect(page.locator('#vehicle-summary')).toContainText('938 kW / 1275 马力');
  await page.locator('#map-detail').selectOption('2');
  await page.locator('#render-scale').selectOption('2');
  await expect(page.locator('#graphics-preset')).toHaveValue('custom');
  await expect(page.locator('#graphics-status')).toContainText('1920 × 1200 · 200%');
  for (const cap of ['90', '120', '144', '165', '240', '0']) {
    await page.locator('#frame-limit').selectOption(cap);
    await expect(metric('Frame limit')).toHaveText(cap);
  }
  await page.locator('#seed').fill('FLEET-DETAIL');
  await page.getByRole('button', { name: '加载种子' }).click();
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 30_000 });
  await expect(metric('Map detail')).toHaveText('2');
  await expect(page.locator('#vehicle-summary')).toContainText('938 kW / 1275 马力');
  await expect(page.locator('#vehicle-brake-value')).toHaveText('75%');
  await expect(page.locator('#vehicle-steering-value')).toHaveText('120%');
  await page.locator('#world').evaluate(canvas => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 1000);
  });
  await expect(page.locator('#error')).toBeVisible();
  await page.setViewportSize({ width: 900, height: 600 });
  await expect(page.locator('#error')).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('#graphics-status')).toContainText('1800 × 1200 · 200%');
  await expect(page.locator('#vehicle-paint')).toHaveValue('29485e');
  await expect(metric('Map detail')).toHaveText('2');
  await page.locator('#vehicle-tuning-reset').click();
  await expect(page.locator('#vehicle-summary')).toContainText('750 kW / 1020 马力');
  await expect(page.locator('#vehicle-brake-value')).toHaveText('100%');
  await expect(page.locator('#vehicle-steering-value')).toHaveText('100%');
  await page.locator('#graphics-preset').selectOption('economy');
  await expect(metric('Map detail')).toHaveText('0');
  await expect(page.locator('#frame-limit')).toHaveValue('0');
  expect(errors).toEqual([]);
});
