import { expect, test } from '@playwright/test';
import { closeSettings, control, openSettings } from './settings';

test('refreshes vehicle specifications after in-panel powertrain and regeneration changes', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=RELEASE-AUDIT'); await page.locator('#drive-toggle').click();
  await page.locator('#hud-vehicle-panel').click();
  const power = page.locator('#vehicle-panel-specs dd').first();
  await expect(power).toContainText('燃油');
  await page.locator('#panel-powertrain').click();
  await expect(power).toContainText('EV'); await expect(page.locator('#panel-powertrain')).toBeFocused();
  await page.locator('#panel-regen').click();
  await expect(power).toContainText('回收 3 档');
  await page.screenshot({ path: info.outputPath('vehicle-panel-ev.png') });
  await page.locator('#panel-regen').click();
  await expect(power).toContainText('回收 0 档');
  await page.locator('#panel-powertrain').click();
  await expect(power).toContainText('燃油'); await expect(page.locator('#panel-regen')).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(page.locator('#world')).toBeFocused();
  expect(errors).toEqual([]);
});

test('searches the visible JSON import control and preserves precise linked settings', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 650 }); await page.goto('/?seed=RELEASE-AUDIT');
  await openSettings(page); const search = page.locator('#settings-search');
  await search.fill('导入 JSON'); await search.press('Enter');
  await expect(page.locator('#preset-import-open')).toBeFocused();
  await expect(page.locator('#preset-import-open')).toBeInViewport();
  await (await control(page, page.locator('#traffic-minSpeed-number'))).fill('180');
  await page.locator('#traffic-minSpeed-number').press('Enter');
  await expect(page.locator('#traffic-minSpeed')).toHaveValue('180');
  await expect(page.locator('#traffic-maxSpeed-number')).toHaveValue('180');
  await page.locator('#traffic-maxSpeed-number').fill('40'); await page.locator('#traffic-maxSpeed-number').press('Tab');
  await expect(page.locator('#traffic-minSpeed-number')).toHaveValue('40');
  await (await control(page, page.locator('#max-grade-number'))).fill('90');
  await page.locator('#max-grade-number').press('Enter'); await expect(page.locator('#max-grade-number')).toHaveValue('40');
  await expect(page.locator('#max-grade')).toHaveValue('40'); await expect(page.locator('#explorer')).toBeVisible();
  await page.locator('#max-grade-number').fill(''); await page.locator('#max-grade-number').press('Escape');
  await expect(page.locator('#max-grade-number')).toHaveValue('40');
  await (await control(page, page.locator('#horn-volume'))).fill('250');
  await page.locator('#audio-group-horns').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('audio-settings-small.png') });
  await closeSettings(page); await expect(page.locator('#world')).toBeFocused();
});
