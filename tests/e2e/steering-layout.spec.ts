import { expect, test } from '@playwright/test';
import { closeSettings, control, openSettings } from './settings';

test('keeps subgroup folds across navigation, searches only the target group and fits a narrow viewport', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=STEERING-LAYOUT'); await openSettings(page);
  await expect(page.locator('#steering-directness')).not.toBeVisible();
  await page.locator('#steering-settings > summary').click();
  await expect(page.locator('#steering-directness')).toBeVisible();
  await page.locator('[data-settings-target="graphics"]').click();
  await page.locator('[data-settings-target="driving"]').click();
  await expect(page.locator('#steering-directness')).toBeVisible();
  await expect(page.locator('#engine-inertia')).not.toBeVisible();
  await page.locator('#settings-driving [data-settings-collapse]').click();
  await page.locator('#settings-search').fill('摩托 最大车身倾角');
  await page.locator('#settings-search').press('Enter');
  await expect(page.locator('#motorcycle-settings')).toHaveAttribute('open', '');
  await expect(page.locator('#steering-settings')).not.toHaveAttribute('open', '');
  await page.locator('#settings-search').fill('即时转向权重'); await page.locator('#settings-search').press('Enter');
  await expect(page.locator('#steering-directness')).toBeFocused();
  await page.locator('#steering-directness-number').fill('35'); await page.locator('#steering-directness-number').press('Enter');
  await expect(page.locator('#steering-directness-value')).toHaveText('35%');
  await page.screenshot({ path: info.outputPath('steering-desktop.png') });
  await page.setViewportSize({ width: 390, height: 650 });
  await page.locator('[data-settings-target="driving"]').click();
  await expect(page.locator('#settings-close')).toBeInViewport();
  expect(await page.locator('#settings-content').evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath('steering-mobile.png') });
  await closeSettings(page); await expect(page.locator('#world')).toBeFocused(); expect(errors).toEqual([]);
});

test('persists steering weights and motorcycle tuning through vehicle changes, reset, JSON and startup restore', async ({ page }) => {
  await page.goto('/?seed=STEERING-SAVE');
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('motorcycle');
  await page.locator('#steering-directness').fill('100');
  for (const id of ['steering-response', 'steering-returnSpeed', 'steering-reversalSpeed']) await expect(page.locator(`#${id}`)).toBeDisabled();
  await page.locator('#steering-directness').fill('35'); await page.locator('#steering-returnSpeed').fill('180');
  await page.locator('#steering-reversalSpeed').fill('150'); await page.locator('#steering-leanLimit').fill('30');
  await page.locator('#steering-countersteer').fill('80');
  await page.locator('#vehicle-kind').selectOption('sedan');
  await expect(page.locator('#steering-leanLimit')).toBeDisabled();
  await expect(page.locator('#steering-directness')).toHaveValue('35');
  await page.locator('#vehicle-kind').selectOption('motorcycle'); await expect(page.locator('#steering-leanLimit')).toHaveValue('30');
  await (await control(page, page.locator('#preset-save'))).click();
  const download = page.waitForEvent('download'); await page.locator('#preset-export').click();
  const stream = await (await download).createReadStream(), chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const data = Buffer.concat(chunks).toString(), preset = JSON.parse(data);
  expect(preset.version).toBe(20); expect(preset.settings['steering-directness']).toBe(35); expect(preset.settings['steering-leanLimit']).toBe(30);
  await (await control(page, page.locator('#steering-reset'))).click();
  await expect(page.locator('#steering-directness')).toHaveValue('0'); await expect(page.locator('#steering-leanLimit')).toHaveValue('40');
  await control(page, page.locator('#preset-import-open'));
  await page.locator('#preset-import').setInputFiles({ name: 'steering.json', mimeType: 'application/json', buffer: Buffer.from(data) });
  await page.locator('#preset-apply').click(); await expect(page.locator('#preset-status')).toContainText('已应用');
  await expect(page.locator('#steering-returnSpeed')).toHaveValue('180'); await expect(page.locator('#steering-countersteer')).toHaveValue('80');
  await (await control(page, page.locator('#startup-save'))).click(); await page.reload();
  await expect(page.locator('#startup-status')).toContainText('已恢复');
  await expect(page.locator('#steering-directness')).toHaveValue('35'); await expect(page.locator('#steering-leanLimit')).toHaveValue('30');
});

test('reveals an invalid road parameter even when its subgroup is collapsed', async ({ page }) => {
  await page.goto('/?seed=SETTINGS-VALIDATION');
  await (await control(page, page.locator('#road-width'))).fill('');
  await page.locator('#world-options summary').filter({ hasText: '道路、车道与弯道' }).click();
  await page.locator('#world-options button[type="submit"]').click();
  await expect(page.locator('#road-width')).toBeVisible(); await expect(page.locator('#road-width')).toBeFocused();
  await expect(page.locator('#explorer')).toBeVisible();
});
