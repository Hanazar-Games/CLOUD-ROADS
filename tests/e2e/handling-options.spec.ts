import { expect, test } from '@playwright/test';
import { control, closeSettings, ignite } from './settings';

test('disables actual handbrake drift on slippery roads and keeps handling choices when switching cars', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=HANDLING-OPTIONS');
  await (await control(page, page.locator('#road-type'))).selectOption('avenue');
  await page.locator('#road-width').fill('12'); await page.locator('#road-lanes').selectOption('4');
  await page.locator('#route-style').selectOption('0'); await page.locator('#max-grade').fill('0');
  await page.locator('#world-options button[type="submit"]').click();
  await (await control(page, page.locator('#traffic-density'))).fill('0');
  await (await control(page, page.locator('#drift-enabled'))).uncheck();
  await (await control(page, page.locator('#custom-turning-radius'))).check();
  await page.locator('#turning-radius').fill('25'); await page.locator('#steering-response').fill('150');
  await page.locator('#steering-assist').uncheck();
  for (const kind of ['semi20', 'motorcycle', 'sedan']) {
    await page.locator('#vehicle-kind').selectOption(kind);
    await expect(page.locator('#drift-enabled')).not.toBeChecked();
    await expect(page.locator('#turning-radius')).toHaveValue('25');
    await expect(page.locator('#turning-radius-value')).toHaveText('25.0 m');
  }
  await closeSettings(page); await expect(page.locator('#drive-toggle')).toBeEnabled();
  await page.locator('#drive-toggle').click(); await ignite(page);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent()), { timeout: 15000 }).toBeGreaterThan(40);
  await page.keyboard.up('KeyW');
  await (await control(page, page.locator('#road-grip'))).fill('25'); await closeSettings(page);
  await page.keyboard.down('KeyA'); await page.keyboard.down('Space'); await page.waitForTimeout(1200);
  await expect(page.locator('[data-metric="Lateral speed"]')).toHaveText('0.00');
  await expect(page.locator('[data-metric="Tire slip"]')).toHaveText('0.00');
  await page.keyboard.up('KeyA'); await page.keyboard.up('Space');
  expect(errors).toEqual([]);
});

test('saves, exports and restores vehicle and NPC behavior settings with separate reset buttons', async ({ page }) => {
  await page.goto('/?seed=HANDLING-PRESET');
  await (await control(page, page.locator('#drift-enabled'))).uncheck();
  await (await control(page, page.locator('#custom-turning-radius'))).check();
  await page.locator('#turning-radius').fill('35');
  await (await control(page, page.locator('#traffic-headway'))).fill('3');
  await page.locator('#traffic-laneChanges').fill('0'); await page.locator('#traffic-hornCooldown').fill('20');
  await (await control(page, page.locator('#preset-save'))).click();
  await expect(page.locator('#preset-status')).toContainText('已保存');
  const download = page.waitForEvent('download'); await page.locator('#preset-export').click();
  const stream = await (await download).createReadStream();
  const chunks = []; for await (const chunk of stream!) chunks.push(chunk);
  const settings = JSON.parse(Buffer.concat(chunks).toString()).settings;
  expect(settings['drift-enabled']).toBe(false); expect(settings['turning-radius']).toBe(35);
  expect(settings['traffic-headway']).toBe(3); expect(settings['traffic-laneChanges']).toBe(0);
  await (await control(page, page.locator('#traffic-behavior-reset'))).click();
  await expect(page.locator('#traffic-headway')).toHaveValue('1.8');
  await (await control(page, page.locator('#vehicle-tuning-reset'))).click();
  await expect(page.locator('#custom-turning-radius')).not.toBeChecked();
  await (await control(page, page.locator('#preset-apply'))).click();
  await expect(page.locator('#preset-status')).toContainText('已应用');
  await expect(page.locator('#turning-radius')).toHaveValue('35');
  await expect(page.locator('#drift-enabled')).not.toBeChecked();
  await expect(page.locator('#traffic-headway')).toHaveValue('3');
  await expect(page.locator('#traffic-hornCooldown')).toHaveValue('20');
});
