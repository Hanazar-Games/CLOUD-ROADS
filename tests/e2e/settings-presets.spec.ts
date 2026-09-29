import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ignite, closeSettings, openSettings } from './settings';

const category = async (page: Page, name: string) => { await openSettings(page); await page.locator(`[data-settings-target="${name}"]`).click(); };
const metric = (page: Page, name: string) => page.locator(`[data-metric="${name}"]`);

test('rejects reversed active ranges while allowing a return to natural terrain after invalid drafts', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT'); await category(page, 'world');
  await page.locator('#elevation-mode').selectOption('fixed');
  await page.locator('#altitude-min').fill('1200'); await page.locator('#altitude-max').fill('200');
  await page.locator('#world-options button[type="submit"]').click(); await expect(page.locator('#explorer')).toBeVisible();
  await page.locator('#elevation-mode').selectOption('cycles'); await page.locator('#climb-min').fill('75');
  await page.locator('#elevation-mode').selectOption('natural');
  await page.locator('#mountain-height').selectOption('range'); await page.locator('#mountain-min').fill('5000');
  await page.locator('#mountain-height').selectOption('natural');
  await page.locator('#world-options button[type="submit"]').click(); await expect(page.locator('#explorer')).toBeHidden();
  await expect(metric(page, 'Climb range')).toHaveText('natural'); await expect(metric(page, 'Road ready')).toHaveText('yes');
});

test('applies absolute altitude, mountain and vegetation controls and retains them after a new seed', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?seed=FLEET-FLAT'); await category(page, 'world');
  await page.locator('#mountain-height').selectOption('range');
  await page.locator('#mountain-min').fill('100'); await page.locator('#mountain-max').fill('500');
  await page.locator('#mountain-density').fill('150'); await page.locator('#vegetation-density').fill('0');
  await page.locator('#elevation-mode').selectOption('fixed');
  await page.locator('#altitude-min').fill('600'); await page.locator('#altitude-max').fill('900');
  await page.locator('#elevation-direction').selectOption('down');
  await page.locator('#world-options button[type="submit"]').click();
  await expect(metric(page, 'Road ready')).toHaveText('yes');
  await expect(metric(page, 'Climb range')).toHaveText('fixed 600–900 m');
  await expect(metric(page, 'Mountain range')).toHaveText('100–500 m');
  await expect(metric(page, 'Mountain density')).toHaveText('150%');
  await expect(metric(page, 'Vegetation density')).toHaveText('0%');
  await expect(metric(page, 'Tree canopies')).toHaveText('0');
  await page.locator('#drive-toggle').click(); await ignite(page); await expect(page.locator('#drive-hud')).toBeVisible();
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(3); await page.keyboard.up('KeyW');
  await category(page, 'world'); await page.locator('#random-world').click();
  await expect(metric(page, 'Road ready')).toHaveText('yes');
  await category(page, 'world'); await expect(page.locator('#altitude-min')).toHaveValue('600');
  await expect(page.locator('#mountain-density')).toHaveValue('150');
  await page.locator('#elevation-mode').selectOption('random'); await page.locator('#world-options button[type="submit"]').click();
  await expect(metric(page, 'Climb range')).toHaveText('random 600–900 m');
  expect(errors).toEqual([]);
});

test('saves and reloads local presets, exports and imports JSON without applying before confirmation', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT'); await category(page, 'driving');
  await page.locator('#vehicle-kind').selectOption('suv'); await page.locator('#hud-style').selectOption('dial');
  await page.locator('#engine-response').fill('125');
  await page.locator('#vehicle-max-speed').fill('75'); await page.locator('#steering-assist').uncheck();
  await page.locator('#road-grip').fill('45'); await page.locator('#handbrake-strength').fill('75'); await page.locator('#countersteer-assist').fill('35');
  await category(page, 'weather'); await page.locator('#weather-rain').check();
  await category(page, 'audio'); await page.locator('#music-ducking').fill('65'); await page.locator('#collision-volume').fill('40');
  await category(page, 'world'); await page.locator('#mountain-density').fill('125');
  await category(page, 'graphics'); await page.locator('#vegetation-lod').selectOption('0.5');
  await page.locator('#distant-trees').selectOption('0.25'); await page.locator('#vehicle-detail-distance').selectOption('120');
  await category(page, 'traffic'); await page.locator('#traffic-scenario').selectOption('stopgo');
  await category(page, 'presets'); await page.locator('#preset-name').fill('雨中山路'); await page.locator('#preset-save').click();
  await expect(page.locator('#preset-status')).toContainText('已保存');
  const downloadPromise = page.waitForEvent('download'); await page.locator('#preset-export').click();
  const download = await downloadPromise, buffer = await readFile((await download.path())!);
  const saved = JSON.parse(buffer.toString());
  expect(saved.world.mountainDensity).toBe(1.25); expect(saved.settings['vehicle-max-speed']).toBe(75);
  expect(saved.factorySpeed).toBe(false); expect(saved.position).toBeUndefined();
  expect(saved.version).toBe(11); expect(saved.settings['road-grip']).toBe(45);
  expect(saved.settings['engine-response']).toBe(125); expect(saved.settings['music-ducking']).toBe(65); expect(saved.settings['collision-volume']).toBe(40);
  expect(saved.settings['vegetation-lod']).toBe('0.5'); expect(saved.settings['distant-trees']).toBe('0.25');
  expect(saved.settings['vehicle-detail-distance']).toBe('120'); expect(saved.settings['traffic-scenario']).toBe('stopgo');
  expect(saved.settings['handbrake-strength']).toBe(75); expect(saved.settings['countersteer-assist']).toBe(35);
  await page.reload(); await category(page, 'presets');
  await expect(page.locator('#preset-list option')).toHaveText(['雨中山路']);
  await expect(metric(page, 'Mountain density')).toHaveText('100%');
  await page.locator('#preset-apply').click();
  await expect(metric(page, 'Mountain density')).toHaveText('125%');
  await category(page, 'driving'); await expect(page.locator('#vehicle-kind')).toHaveValue('suv');
  await expect(page.locator('#vehicle-max-speed')).toHaveValue('75'); await expect(page.locator('#steering-assist')).not.toBeChecked();
  await expect(page.locator('#road-grip')).toHaveValue('45'); await expect(page.locator('#handbrake-strength')).toHaveValue('75');
  await expect(page.locator('#countersteer-assist')).toHaveValue('35');
  await expect(page.locator('#drive-hud')).toHaveAttribute('data-style', 'dial');
  await page.locator('#vehicle-max-speed').fill('40');
  await category(page, 'presets'); await page.locator('#preset-import').setInputFiles({ name: 'trip.json', mimeType: 'application/json', buffer });
  await expect(page.locator('#preset-status')).toContainText('已校验');
  await expect(metric(page, 'Vehicle speed limit')).toHaveText('40.0 km/h');
  await page.locator('#preset-apply').click(); await expect(metric(page, 'Vehicle speed limit')).toHaveText('75.0 km/h');
  const repeatDownload = page.waitForEvent('download'); await page.locator('#preset-export').click();
  const restored = JSON.parse(await readFile((await (await repeatDownload).path())!, 'utf8'));
  expect(restored).toEqual(saved);
  await page.locator('#preset-list').selectOption('0'); await page.locator('#preset-delete').click();
  await page.reload(); await category(page, 'presets'); await expect(page.locator('#preset-list option')).toHaveText(['尚无预设']);
});

test('rejects invalid imports and remains usable when browser storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
  });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?seed=FLEET-FLAT'); await category(page, 'presets');
  await expect(page.locator('#preset-status')).toContainText('Storage unavailable');
  await page.locator('#preset-save').click(); await expect(page.locator('#preset-status')).toContainText('操作未完成');
  const fileChooser = page.waitForEvent('filechooser'); await page.locator('#preset-import-open').click();
  await (await fileChooser).setFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await expect(page.locator('#preset-status')).toContainText('有效的 JSON');
  await expect(page.locator('#preset-apply')).toBeDisabled();
  const downloadPromise = page.waitForEvent('download'); await page.locator('#preset-export').click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.json$/);
  await closeSettings(page); await page.locator('#drive-toggle').click(); await ignite(page);
  await expect(page.locator('#drive-hud')).toBeVisible(); expect(errors).toEqual([]);
});

test('applies factory speed and parked equipment preferences after leaving a moving vehicle', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT'); await category(page, 'equipment');
  await page.locator('#vehicle-roof').click();
  await category(page, 'presets'); await page.locator('#preset-name').fill('关闭车顶'); await page.locator('#preset-save').click();
  await expect(page.locator('#preset-status')).toContainText('已保存');
  await category(page, 'equipment'); await page.locator('#vehicle-roof').click();
  await category(page, 'driving'); await page.locator('#vehicle-max-speed').fill('40'); await closeSettings(page);
  await page.locator('#drive-toggle').click(); await ignite(page); await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(6);
  await category(page, 'presets'); await page.keyboard.up('KeyW'); await page.locator('#preset-apply').click();
  await expect(page.locator('#preset-status')).toContainText('已应用');
  await expect(metric(page, 'Vehicle speed limit')).toHaveText('172.8 km/h');
  await category(page, 'equipment'); await expect(page.locator('#vehicle-roof')).toHaveAttribute('aria-pressed', 'true');
  await category(page, 'driving'); await expect(page.locator('#vehicle-max-speed-value')).toContainText('车型默认');
  await page.locator('#vehicle-kind').selectOption('crane'); await expect(page.locator('#vehicle-max-speed')).toHaveValue('79');
});

test('provides all vehicle panels, HUD styles and a reachable menu in a narrow window', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT'); await category(page, 'driving');
  const vehicles = await page.locator('#vehicle-kind option').evaluateAll(options => options.map(o => ({ value: (o as HTMLOptionElement).value, name: o.textContent! })));
  for (const vehicle of vehicles) {
    await category(page, 'driving'); await page.locator('#vehicle-kind').selectOption(vehicle.value);
    await page.locator('#vehicle-panel-settings').click();
    await expect(page.locator('#vehicle-panel-title')).toHaveText(vehicle.name);
    await expect(page.locator('#vehicle-panel-specs dd')).toHaveCount(9);
    await expect(page.locator('#panel-seats')).toBeDisabled();
    if (vehicle.value === 'motorcycle') await expect(page.locator('#vehicle-panel-equipment')).toContainText('无车窗与雨刮');
    await page.locator('#panel-driving').click(); await expect(page.locator('#vehicle-kind')).toBeInViewport();
  }
  await page.locator('#vehicle-kind').selectOption('roadster');
  await closeSettings(page); await page.locator('#drive-toggle').click(); await ignite(page);
  await page.setViewportSize({ width: 390, height: 450 });
  for (const style of ['digital', 'dial', 'minimal']) {
    await category(page, 'driving'); await page.locator('#hud-style').selectOption(style); await closeSettings(page);
    await expect(page.locator('#drive-hud')).toHaveAttribute('data-style', style);
    await expect(page.locator('#vehicle-speed')).toBeInViewport(); await expect(page.locator('#hud-vehicle-panel')).toBeInViewport();
    const hud = await page.locator('#drive-hud').boundingBox(), header = await page.locator('.masthead').boundingBox();
    expect(hud!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    await page.locator('#hud-vehicle-panel').click(); await expect(page.locator('#vehicle-panel')).toBeVisible();
    const position = await metric(page, 'Vehicle position').textContent(); await page.keyboard.press('KeyW'); await page.waitForTimeout(150);
    await expect(metric(page, 'Vehicle position')).toHaveText(position!);
    await expect(page.locator('#vehicle-panel button[data-close]')).toBeInViewport();
    await page.keyboard.press('Escape'); await expect(page.locator('#world')).toBeFocused();
  }
});
