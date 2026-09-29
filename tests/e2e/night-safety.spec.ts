import { expect, test } from '@playwright/test';
import { closeSettings, control, ignite } from './settings';

test('drives the sprinkler at night, controls fog lamps and restores exact dense-fog presets', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?seed=NIGHT-SAFETY');
  await (await control(page, page.locator('#terrain-kind'))).selectOption('meadow');
  await (await control(page, page.locator('#route-style'))).selectOption('0');
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '应用并返回起点' }))).click();
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30_000 });
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('sprinkler');
  await (await control(page, page.locator('#driving-view'))).selectOption('chase');
  await (await control(page, page.locator('#time-preset'))).selectOption('150');
  await (await control(page, page.locator('#drive-toggle'))).click(); await ignite(page);
  await page.keyboard.press('i'); await page.keyboard.press('Shift+f'); await page.keyboard.press('h');
  await expect(page.locator('[data-metric="Sprinkler pump"]')).toHaveText('on');
  await expect(page.locator('[data-metric="Fog lights"]')).toHaveText('on');
  await expect(page.locator('#vehicle-lights-status')).toContainText('雾灯');
  await page.screenshot({ path: info.outputPath('sprinkler-night.png') });
  await (await control(page, page.locator('#driving-view'))).selectOption('cockpit');
  await (await control(page, page.locator('#weather-denseFog'))).check();
  for (const value of ['2', '50', '1000']) {
    await (await control(page, page.locator('#fog-visibility'))).fill(value);
    await expect(page.locator('[data-metric="Fog near / far"]')).toHaveText(`1 / ${value} m`);
    await closeSettings(page);
    await page.screenshot({ path: info.outputPath(`dense-fog-${value}m.png`) });
  }
  await (await control(page, page.locator('#fog-visibility'))).fill('50');
  await (await control(page, page.locator('#preset-name'))).fill('夜间洒水大雾');
  await page.locator('#preset-save').click(); await expect(page.locator('#preset-status')).toContainText('已保存');
  await (await control(page, page.locator('#fog-visibility'))).fill('1000');
  await (await control(page, page.locator('#vehicle-fog-lights'))).uncheck();
  await (await control(page, page.locator('#preset-apply'))).click();
  await expect(page.locator('#fog-visibility')).toHaveValue('50');
  await expect(page.locator('#vehicle-fog-lights')).toBeChecked();
  await closeSettings(page);
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30_000 });
  await (await control(page, page.locator('#drive-toggle'))).click(); await ignite(page);
  await expect(page.locator('[data-metric="Fog lights"]')).toHaveText('on');
  expect(errors).toEqual([]);
});
