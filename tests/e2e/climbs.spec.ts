import { expect, test } from '@playwright/test';

test('validates climb ranges, applies the eighteen-bend preset and restores natural terrain', async ({ page }) => {
  await page.goto('/');
  const min = page.locator('#climb-min'), max = page.locator('#climb-max'), mode = page.locator('#elevation-mode');
  const apply = page.getByRole('button', { name: '应用并返回起点' });
  await expect(min).toBeDisabled();
  await page.locator('#terrain-kind').selectOption('karst');
  await page.locator('#eighteen-bends').click();
  await expect(min).toBeEnabled();
  await expect(page.locator('#route-style')).toHaveValue('5');
  await expect(page.locator('#max-grade')).toHaveValue('25');
  await min.fill('700'); await max.fill('300');
  await apply.click();
  expect(await max.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
  await mode.selectOption('natural'); await apply.click();
  await expect(page.locator('#settings-status')).toContainText('喀斯特峰林');
  await expect(min).toBeDisabled();
  await page.locator('#eighteen-bends').click();
  await min.fill('350'); await max.fill('750'); await apply.click();
  await expect(page.locator('#settings-status')).toContainText('单次爬升 350–750 米');
  await expect(page.locator('[data-metric="Climb range"]')).toHaveText('350–750 m');
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes', { timeout: 20000 });
  await expect(page.locator('[data-metric="Cable towers"]')).not.toHaveText('0');
  await page.locator('#seed').fill('CLIMB-OPTIONS');
  await page.getByRole('button', { name: '加载种子' }).click();
  await expect(min).toHaveValue('350'); await expect(max).toHaveValue('750');
  await expect(mode).toHaveValue('cycles');
  await page.locator('#max-grade').fill('0'); await apply.click();
  await expect(page.locator('[data-metric="Maximum grade"]')).toHaveText('0%');
  await expect(page.locator('[data-metric="Road grade"]')).toHaveText('0.00%');
  await expect(page.locator('#error')).toBeHidden();
});

test('renders all new terrains and finds their service areas', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/');
  await expect(page.locator('#terrain-kind option')).toHaveCount(7);
  for (const [terrain, name] of [['meadow', '草甸丘陵'], ['badlands', '红岩荒原'], ['karst', '喀斯特峰林']]) {
    await page.locator('#terrain-kind').selectOption(terrain);
    await page.getByRole('button', { name: '应用并返回起点' }).click();
    await expect(metric('Landscape')).toHaveText(name);
    await expect(metric('Road ready')).toHaveText('yes', { timeout: 20000 });
    await expect(metric('Active chunks')).toHaveText('289', { timeout: 20000 });
    await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 20000 });
    await page.locator('#service-view').click();
    await expect(metric('Service areas')).toHaveText('1', { timeout: 30000 });
    await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 20000 });
    await expect(page.locator('#service-view')).toHaveText('下一服务区');
    await expect(page.locator('#error')).toBeHidden();
  }
  expect(errors).toEqual([]);
});
