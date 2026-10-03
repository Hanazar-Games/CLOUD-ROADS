import { expect, test, type Page } from '@playwright/test';
import { closeSettings, control, ignite, openSettings } from './settings';

const metric = (page: Page, name: string) => page.locator(`[data-metric="${name}"]`);

test('slides with Space, freezes in settings and releases the handbrake without a stuck input', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=DRIFT-48');
  await (await control(page, page.locator('#road-type'))).selectOption('avenue');
  await page.locator('#road-width').fill('12'); await page.locator('#road-lanes').selectOption('4');
  await page.locator('#route-style').selectOption('0'); await page.locator('#max-grade').fill('0');
  await page.locator('#world-options button[type="submit"]').click();
  await (await control(page, page.locator('#traffic-density'))).fill('0');
  await (await control(page, page.locator('#road-grip'))).fill('70');
  await closeSettings(page); await expect(page.locator('#drive-toggle')).toBeEnabled();
  await page.locator('#drive-toggle').click(); await ignite(page); await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent()), { timeout: 15000 }).toBeGreaterThan(50);
  await page.keyboard.up('KeyW'); await page.keyboard.down('KeyA'); await page.keyboard.down('Space');
  await expect.poll(async () => Math.abs(Number(await metric(page, 'Drift angle').textContent())), { intervals: [50], timeout: 5000 }).toBeGreaterThan(5);
  await expect.poll(async () => Number(await metric(page, 'Tire slip').textContent())).toBeGreaterThan(0.2);
  await page.screenshot({ path: test.info().outputPath('drift.png') });
  await openSettings(page); await page.keyboard.up('Space'); await page.keyboard.up('KeyA');
  await page.waitForTimeout(200); const pressure = await metric(page, 'Handbrake pressure').textContent(), position = await metric(page, 'Vehicle position').textContent();
  await page.waitForTimeout(300);
  await expect(metric(page, 'Handbrake pressure')).toHaveText(pressure!); await expect(metric(page, 'Vehicle position')).toHaveText(position!);
  await closeSettings(page); await page.keyboard.down('KeyD');
  await expect(metric(page, 'Handbrake pressure')).toHaveText('0.00'); await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyR'); await expect(metric(page, 'Lateral speed')).toHaveText('0.00');
  await expect(metric(page, 'Tire slip')).toHaveText('0.00'); await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('retains drift tuning across vehicles, resets it independently and supports a rebound handbrake', async ({ page }) => {
  await page.goto('/?seed=DRIFT-SETTINGS');
  await (await control(page, page.locator('#road-grip'))).fill('40');
  await page.locator('#handbrake-strength').fill('65'); await page.locator('#countersteer-assist').fill('0');
  await page.locator('#drift-min-speed').fill('45'); await page.locator('#drift-delay').fill('500');
  await page.locator('#stability-assist').fill('85');
  await page.locator('#drift-help').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('drift-settings.png') });
  for (const kind of ['sedan', 'semi20', 'coach15', 'motorcycle']) {
    await page.locator('#vehicle-kind').selectOption(kind);
    await expect(page.locator('#road-grip-value')).toHaveText('40%'); await expect(page.locator('#handbrake-strength-value')).toHaveText('65%');
    await expect(page.locator('#countersteer-assist-value')).toHaveText('0%');
    await expect(page.locator('#drift-min-speed-value')).toHaveText('45 km/h');
    await expect(page.locator('#drift-delay-value')).toHaveText('500 ms'); await expect(page.locator('#stability-assist')).toHaveValue('85');
  }
  await page.locator('#vehicle-tuning-reset').click(); await expect(page.locator('#road-grip')).toHaveValue('40');
  await page.locator('#drift-reset').click(); await expect(page.locator('#road-grip')).toHaveValue('100');
  await expect(page.locator('#handbrake-strength')).toHaveValue('100'); await expect(page.locator('#countersteer-assist')).toHaveValue('60');
  await expect(page.locator('#drift-min-speed')).toHaveValue('30'); await expect(page.locator('#drift-delay')).toHaveValue('250');
  await expect(page.locator('#stability-assist')).toHaveValue('65');
  await page.locator('#drift-enabled').uncheck(); await expect(page.locator('#drift-delay')).toBeDisabled();
  await page.locator('#drift-enabled').check();
  await page.locator('#vehicle-kind').selectOption('sedan');
  await (await control(page, page.locator('[data-binding="Space"]'))).click(); await page.keyboard.press('F9');
  await closeSettings(page); await page.locator('#drive-toggle').click(); await ignite(page);
  await page.keyboard.down('F9'); await expect(metric(page, 'Handbrake pressure')).toHaveText('1.00');
  await page.keyboard.up('F9'); await expect(metric(page, 'Handbrake pressure')).toHaveText('0.00');
  await page.keyboard.down('Space'); await page.waitForTimeout(200); await expect(metric(page, 'Handbrake pressure')).toHaveText('0.00');
  await page.keyboard.up('Space');
});
