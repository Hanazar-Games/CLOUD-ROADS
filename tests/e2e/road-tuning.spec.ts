import { expect, test } from '@playwright/test';
import { ignite, closeSettings, openSettings } from './settings';

test('applies highway radius and retains it through new worlds and road type changes', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT'); await openSettings(page);
  await page.locator('[data-settings-target="world"]').click();
  await page.locator('#settings-world [data-settings-expand]').click();
  await expect(page.locator('#highway-radius')).toBeDisabled();
  await page.locator('#road-type').selectOption('highway'); await page.locator('#highway-radius').fill('800');
  await page.locator('#route-style').selectOption('5'); await page.locator('#terrain-kind').selectOption('meadow');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  await expect(page.locator('[data-metric="Highway minimum radius"]')).toHaveText('800 m');
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes');
  await openSettings(page); await page.locator('#random-world').click();
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes');
  await openSettings(page); await expect(page.locator('#highway-radius')).toHaveValue('800');
  await page.locator('#road-type').selectOption('mountain'); await expect(page.locator('#highway-radius')).toBeDisabled();
  await page.locator('#road-type').selectOption('highway'); await expect(page.locator('#highway-radius')).toHaveValue('800');
  await closeSettings(page); await page.locator('#drive-toggle').click(); await ignite(page); await expect(page.locator('#drive-hud')).toBeVisible();
});

test('limits speed, configures steering assistance and restores per-vehicle defaults', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT'); await openSettings(page);
  await page.locator('[data-settings-target="driving"]').click();
  await page.locator('#settings-driving [data-settings-expand]').click();
  await expect(page.locator('#steering-assist')).toBeChecked();
  await page.locator('#vehicle-max-speed').fill('40'); await page.locator('#steering-assist-strength').fill('150');
  await page.locator('#steering-assist').uncheck(); await expect(page.locator('#steering-assist-strength')).toBeDisabled();
  await page.locator('#vehicle-kind').selectOption('sedan'); await expect(page.locator('#vehicle-max-speed')).toHaveValue('40');
  await expect(page.locator('#steering-assist')).not.toBeChecked(); await closeSettings(page);
  await page.locator('#drive-toggle').click(); await ignite(page); await page.keyboard.down('KeyW');
  await expect(page.locator('#vehicle-speed')).toHaveText('40', { timeout: 15000 });
  await page.waitForTimeout(500); await expect(page.locator('#vehicle-speed')).toHaveText('40'); await page.keyboard.up('KeyW');
  await openSettings(page); await page.locator('#steering-assist').check();
  await expect(page.locator('#steering-assist-strength')).toHaveValue('150');
  await page.locator('#vehicle-tuning-reset').click();
  await expect(page.locator('#vehicle-max-speed-value')).toContainText('车型默认');
  await expect(page.locator('#steering-assist-strength')).toHaveValue('100');
  await page.locator('#vehicle-kind').selectOption('crane');
  await expect(page.locator('#vehicle-max-speed')).toHaveValue('79');
  await expect(page.locator('#steering-assist')).toBeChecked();
});

test('keeps weather cards stable and survives repeated weather changes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('crash', () => errors.push('Page crashed'));
  await page.goto('/?seed=FLEET-FLAT'); await openSettings(page);
  await page.locator('[data-settings-target="weather"]').click(); await page.locator('#weather-clear').focus();
  const mutations = await page.locator('#weather-kind').evaluate(group => new Promise<number>(resolve => {
    let count = 0; const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(group, { subtree: true, childList: true, characterData: true });
    setTimeout(() => { observer.disconnect(); resolve(count); }, 1100);
  }));
  expect(mutations).toBe(0);
  await page.locator('#weather-overcast').check();
  await expect(page.locator('#weather-overcast')).toBeChecked();
  for (const season of ['summer', 'winter', 'spring']) {
    await page.locator('#season-kind').selectOption(season);
    for (const kind of ['clear', 'overcast', 'drizzle', 'rain', 'storm', 'fog']) {
      await page.locator(`#weather-${kind}`).check();
      await expect(page.locator(`#weather-${kind}`)).toBeChecked();
      await expect(page.locator('#error')).toBeHidden();
    }
  }
  await page.locator('#weather-clear').check(); await closeSettings(page);
  await page.locator('#drive-toggle').click(); await ignite(page); await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(2);
  await page.keyboard.up('KeyW'); expect(errors).toEqual([]);
});
