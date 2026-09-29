import { expect, test } from '@playwright/test';
import { closeSettings, control, openSettings } from './settings';

test('selects weather cards with keys, search and saved presets', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=WEATHER-CARDS');
  const clear = await control(page, page.locator('#weather-clear'));
  await expect(page.getByRole('group', { name: '天气', exact: true }).getByRole('radio')).toHaveCount(6);
  await clear.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#weather-overcast')).toBeChecked();
  await expect(page.locator('[data-metric="Weather"]')).toHaveText('多云');
  await page.keyboard.press('ArrowLeft'); await expect(clear).toBeChecked();
  await page.keyboard.press('ArrowLeft'); await expect(page.locator('#weather-fog')).toBeChecked();
  await page.screenshot({ path: info.outputPath('weather-cards-desktop.png') });
  await page.locator('#settings-search').fill('天气 浓雾'); await page.keyboard.press('Enter');
  await expect(page.locator('#weather-fog')).toBeFocused();
  await (await control(page, page.locator('#preset-name'))).fill('天气卡片');
  await page.locator('#preset-save').click(); await expect(page.locator('#preset-status')).toContainText('已保存');
  await (await control(page, page.locator('#weather-rain'))).check();
  await (await control(page, page.locator('#preset-apply'))).click();
  await expect(page.locator('#weather-fog')).toBeChecked();
  await expect(page.locator('[data-metric="Weather"]')).toHaveText('浓雾');
  await closeSettings(page); await expect(page.locator('#world')).toBeFocused();
  expect(errors).toEqual([]);
});

test('fits weather choices on small screens and honors reduced motion and planetary disabling', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 650 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?seed=WEATHER-CARDS'); await control(page, page.locator('#weather-fog'));
  await expect(page.locator('#explorer')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.weather-choices label').first()).toHaveCSS('transition-duration', '0s');
  expect(await page.locator('#settings-content').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.locator('#weather-fog').check();
  await page.screenshot({ path: info.outputPath('weather-cards-mobile.png') });
  await (await control(page, page.locator('#terrain-kind'))).selectOption('moon');
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '应用并返回起点' }))).click();
  for (const radio of await page.locator('#weather-kind input').all()) await expect(radio).toBeDisabled();
  await expect(page.locator('#weather-fog')).toBeChecked();
  await (await control(page, page.locator('#terrain-kind'))).selectOption('forest');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  await expect(page.locator('#weather-fog')).toBeEnabled(); await expect(page.locator('#weather-fog')).toBeChecked();
  await closeSettings(page); await openSettings(page); await page.keyboard.press('Escape');
  await expect(page.locator('#explorer')).not.toBeVisible(); await expect(page.locator('#world')).toBeFocused();
});
