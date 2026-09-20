import { expect, test } from '@playwright/test';

test('customizes all winding levels and grades, renders roadside flowers and drives a level straight highway', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  const ready = async () => {
    await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
    await expect(metric('Active chunks')).toHaveText('289', { timeout: 30000 });
    await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 30000 });
  };
  await page.goto('/'); await ready();
  const route = page.locator('#route-style'), grade = page.locator('#max-grade');
  await expect(route.locator('option')).toHaveCount(6);
  await expect(grade).toHaveAttribute('min', '0');
  await expect(grade).toHaveAttribute('max', '40');
  await page.locator('#terrain-kind').selectOption('forest');
  await grade.fill('40');
  await expect(page.locator('#max-grade-value')).toHaveText('40%');
  for (const level of [1, 2, 3, 4, 5]) {
    await route.selectOption(String(level));
    await page.getByRole('button', { name: '应用并返回起点' }).click();
    await expect(metric('Route style')).toContainText(`${level} 档`);
    await expect(metric('Maximum grade')).toHaveText('40%');
    await ready();
    expect(Math.abs(parseFloat((await metric('Road grade').textContent())!))).toBeLessThanOrEqual(40);
    if (level > 1) expect(Number(await metric('Hairpins').textContent())).toBeGreaterThan(0);
  }
  expect(Number(await metric('Roadside grass').textContent())).toBeGreaterThan(0);
  expect(Number(await metric('Wildflowers').textContent())).toBeGreaterThan(0);
  await page.locator('#road-type').selectOption('highway');
  await grade.fill('0'); await route.selectOption('0');
  await page.getByRole('button', { name: '应用并返回起点' }).click(); await ready();
  await expect(metric('Route style')).toHaveText('全直道 · 零弯道');
  await expect(metric('Maximum grade')).toHaveText('0%');
  await expect(metric('Hairpins')).toHaveText('0');
  await page.locator('#drive-toggle').click();
  await page.locator('#world').focus(); await page.keyboard.down('KeyW');
  await expect.poll(async () => parseFloat((await metric('Vehicle speed').textContent())!)).toBeGreaterThan(45);
  await page.keyboard.up('KeyW'); await page.keyboard.press('KeyP');
  expect(parseFloat((await metric('Road curvature').textContent())!)).toBe(0);
  expect(Math.abs(parseFloat((await metric('Road grade').textContent())!))).toBe(0);
  await page.locator('#controls-toggle').click();
  await page.locator('#seed').fill('STRAIGHT-MEADOW');
  await page.getByRole('button', { name: '加载种子' }).click(); await ready();
  await expect(route).toHaveValue('0'); await expect(grade).toHaveValue('0');
  await expect(page.locator('#settings-status')).toContainText('最大坡度 0%');
  await page.locator('#world').evaluate(canvas => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 800);
  });
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toBeHidden(); await ready();
  await expect(route).toHaveValue('0'); await expect(grade).toHaveValue('0');
  expect(errors).toEqual([]);
});
