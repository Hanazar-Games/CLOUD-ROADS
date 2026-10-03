import { expect, test } from '@playwright/test';
import { closeSettings, control, openSettings } from './settings';

test('keeps shortcut groups folded through rebinding, cancellation, reset and search', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=FLEET-STREAMING'); await openSettings(page);
  await page.locator('[data-settings-target=bindings]').click();
  const groups = page.locator('#binding-list details'); await expect(groups).toHaveCount(7);
  await expect(page.locator('#binding-list details[open]')).toHaveCount(1);
  const equipment = page.locator('[data-binding-group="设备"]');
  await equipment.locator('summary').click();
  const fog = equipment.locator('[data-binding=FogLights]');
  await fog.click(); await page.keyboard.press('Shift+Digit9'); await expect(fog).toHaveText('Shift+9');
  await expect(page.locator('#binding-list details[open]')).toHaveCount(2);
  await fog.click(); await equipment.locator('summary').click();
  await expect(equipment).not.toHaveAttribute('open', '');
  await expect(page.locator('#bindings-status')).toContainText('已取消');
  await page.locator('#bindings-reset').click(); await expect(fog).toHaveText('Shift+F');
  await expect(equipment).not.toHaveAttribute('open', '');
  await page.locator('#settings-bindings [data-settings-collapse]').click();
  await page.locator('#settings-search').fill('快捷键 前后雾灯');
  await page.locator('#settings-search-results button').first().click();
  await expect(equipment).toHaveAttribute('open', ''); await expect(fog).toBeFocused();
  await page.setViewportSize({ width: 440, height: 850 });
  await expect(page.locator('#explorer')).toBeInViewport();
  expect(await page.locator('#explorer').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('shortcut-groups.png') });
  expect(errors).toEqual([]);
});

test('loads ten new vehicles and round-trips independent road and streaming controls', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=FLEET-STREAMING');
  const select = await control(page, page.locator('#vehicle-kind'));
  await expect(select.locator('option')).toHaveCount(49);
  for (const kind of ['taxi', 'surfWagon', 'patrol', 'parcelVan', 'adventureCamper', 'panoramicBus', 'livestockTruck', 'loggingTruck', 'maintenanceTruck', 'touringMotorcycle']) {
    await select.selectOption(kind); await expect(select).toHaveValue(kind);
    await expect(page.locator('#vehicle-summary')).not.toBeEmpty();
  }
  const values: Record<string, string> = { 'road-texture': '0', 'road-relief': '2', 'road-filtering': '4', 'model-load-budget': '1',
    'model-preload-distance': '600', 'terrain-upload-budget': '1', 'terrain-upload-limit': '1', 'terrain-preload': '3' };
  await control(page, page.locator('#road-texture'));
  for (const [id, value] of Object.entries(values)) await page.locator(`#${id}`).fill(value);
  await expect(page.locator('#road-filtering-value')).toHaveText('16×');
  await expect(page.locator('#model-load-budget-value')).toHaveText('1 ms / 帧');
  await expect(page.locator('#terrain-preload-value')).toHaveText('提前 768 m');
  await page.screenshot({ path: info.outputPath('performance-controls.png') });
  await (await control(page, page.locator('#preset-name'))).fill('路面与流式加载'); await page.locator('#preset-save').click();
  await expect(page.locator('#preset-status')).toContainText('已保存');
  await (await control(page, page.locator('#graphics-preset'))).selectOption('minimal');
  await expect(page.locator('#road-relief')).toHaveValue('0');
  await (await control(page, page.locator('#preset-apply'))).click();
  await expect(page.locator('#preset-status')).toContainText('已应用');
  for (const [id, value] of Object.entries(values)) await expect(page.locator(`#${id}`)).toHaveValue(value);
  await page.reload(); await control(page, page.locator('#preset-apply')); await page.locator('#preset-apply').click();
  await expect(page.locator('#vehicle-kind')).toHaveValue('touringMotorcycle');
  for (const [id, value] of Object.entries(values)) await expect(page.locator(`#${id}`)).toHaveValue(value);
  expect(errors).toEqual([]);
});

test('renders the new fleet in chase view with working patrol and maintenance beacons', async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?seed=FLEET-SHOWCASE');
  await (await control(page, page.locator('#terrain-kind'))).selectOption('meadow');
  await page.locator('#route-style').selectOption('0'); await page.locator('#max-grade').fill('0');
  await page.locator('#world-options button[type=submit]').click();
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes', { timeout: 30000 });
  await (await control(page, page.locator('#driving-view'))).selectOption('chase');
  await closeSettings(page); await page.locator('#drive-toggle').click();
  for (const kind of ['taxi', 'surfWagon', 'patrol', 'parcelVan', 'adventureCamper', 'panoramicBus', 'livestockTruck', 'loggingTruck', 'maintenanceTruck', 'touringMotorcycle']) {
    await (await control(page, page.locator('#vehicle-kind'))).selectOption(kind);
    await closeSettings(page);
    await expect(page.locator('[data-metric="Vehicle model"]')).toHaveText(await page.locator('#vehicle-kind option:checked').textContent() ?? '');
    await expect(page.locator('#drive-hud')).toBeVisible();
    if (kind === 'patrol' || kind === 'maintenanceTruck') {
      await page.keyboard.press('KeyI');
      await expect(page.locator('#vehicle-aux')).toHaveAttribute('aria-pressed', 'true');
    }
    await page.screenshot({ path: info.outputPath(`${kind}.png`) });
  }
  expect(errors).toEqual([]);
});
