import { expect, test, type Page } from '@playwright/test';
import { closeSettings, control, ignite, openSettings } from './settings';

const metric = (page: Page, name: string) => page.locator(`[data-metric="${name}"]`);
const doorClosed = (page: Page) => expect(metric(page, 'Vehicle operations')).toHaveText('0.00 / 0.00 / 0.00');

test('locks each car without trapping occupants or allowing the boarding button to bypass the lock', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=EQUIPMENT-LOCK');
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('sedan');
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30_000 });
  await (await control(page, page.locator('#drive-toggle'))).click();
  await page.keyboard.press('j');
  await expect.poll(async () => Number(await metric(page, 'Cabin exposure').textContent())).toBeGreaterThan(0.2);
  await page.keyboard.press('Shift+j'); await expect(metric(page, 'Vehicle locked')).toHaveText('no');
  await expect(page.locator('#lock-status')).toContainText('请先关好');
  await page.keyboard.press('j'); await doorClosed(page);
  await page.keyboard.press('Shift+j'); await expect(metric(page, 'Vehicle locked')).toHaveText('yes');
  await page.keyboard.press('j'); await doorClosed(page);
  await page.keyboard.press('f'); await expect(metric(page, 'Travel mode')).toHaveText('walking'); await doorClosed(page);
  await expect(metric(page, 'Vehicle locked')).toHaveText('no');
  await page.keyboard.press('Shift+j'); await expect(metric(page, 'Vehicle locked')).toHaveText('yes');
  await expect(page.locator('#boarding-help')).toContainText('解锁');
  await page.keyboard.press('f'); await page.waitForTimeout(350); await expect(metric(page, 'Travel mode')).toHaveText('walking');
  await page.locator('#drive-toggle').click(); await page.waitForTimeout(350); await expect(metric(page, 'Travel mode')).toHaveText('walking');
  await (await control(page, page.locator('#vehicle-lock'))).click(); await closeSettings(page);
  await page.keyboard.press('f'); await expect(metric(page, 'Travel mode')).toHaveText('driving'); await doorClosed(page);
  await page.keyboard.press('p'); await page.locator('[data-seat="front"]').click();
  await page.keyboard.press('Shift+j'); await expect(metric(page, 'Vehicle locked')).toHaveText('no');
  expect(errors).toEqual([]);
});

test('powers and pauses the refrigerator, saves preferences without locks and lights white reverse lamps', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?seed=EQUIPMENT-REVERSE');
  await (await control(page, page.locator('#terrain-kind'))).selectOption('meadow');
  await (await control(page, page.locator('#route-style'))).selectOption('0');
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '应用并返回起点' }))).click();
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30_000 });
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('sedan');
  await (await control(page, page.locator('#driving-view'))).selectOption('chase');
  await (await control(page, page.locator('#time-preset'))).selectOption('150');
  await (await control(page, page.locator('#fridge-temperature'))).fill('2');
  await (await control(page, page.locator('#drive-toggle'))).click();
  await page.keyboard.press('Shift+u'); await expect(page.locator('#fridge-status')).toContainText('等待点火');
  await ignite(page); await expect(metric(page, 'Fridge cooling')).toHaveText('on');
  await expect.poll(async () => Number(await metric(page, 'Fridge temperature').textContent())).toBeLessThan(17.8);
  await openSettings(page); await page.waitForTimeout(250);
  const temperature = await metric(page, 'Fridge temperature').textContent(); await page.waitForTimeout(400);
  await expect(metric(page, 'Fridge temperature')).toHaveText(temperature!);
  await (await control(page, page.locator('#preset-name'))).fill('Cold night'); await page.locator('#preset-save').click();
  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem('cloud-roads.presets.v16')!)[0].settings);
  expect(preferences['fridge-temperature']).toBe(2); expect(preferences['vehicle-fridge']).toBe(true);
  expect(preferences).not.toHaveProperty('vehicle-lock');
  await closeSettings(page); await page.keyboard.down('s');
  await expect(metric(page, 'Reverse lights')).toHaveText('on'); await page.keyboard.up('s');
  await expect(page.locator('#vehicle-gear')).toHaveText('R');
  await page.screenshot({ path: info.outputPath('white-reverse-lights.png') });
  await page.keyboard.down('w'); await expect(metric(page, 'Reverse lights')).toHaveText('off'); await page.keyboard.up('w');
  await page.keyboard.down('Space'); await expect(page.locator('#vehicle-speed')).toHaveText('0'); await page.keyboard.up('Space');
  await page.keyboard.press('Backquote'); await expect(metric(page, 'Fridge cooling')).toHaveText('off');
  await (await control(page, page.locator('#vehicle-fridge'))).click();
  await (await control(page, page.locator('#fridge-temperature'))).fill('12');
  await (await control(page, page.locator('#preset-apply'))).click();
  await expect(page.locator('#fridge-temperature')).toHaveValue('2');
  await expect(page.locator('#vehicle-fridge')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('renders closed cabins and drifting fog across vehicle families without shader errors', async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?seed=SEALED-CABINS');
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30_000 });
  await (await control(page, page.locator('#vehicle-roof'))).click();
  await (await control(page, page.locator('#weather-denseFog'))).check();
  await (await control(page, page.locator('#driving-view'))).selectOption('chase');
  await (await control(page, page.locator('#fog-visibility'))).fill('100');
  await (await control(page, page.locator('#drive-toggle'))).click();
  await expect(metric(page, 'Roof opening')).toHaveText('0.00', { timeout: 10_000 });
  await page.screenshot({ path: info.outputPath('sealed-roadster-fog.png') });
  for (const kind of ['coach', 'doubleDecker', 'truck8', 'roadTrain', 'motorcycle']) {
    await (await control(page, page.locator('#vehicle-kind'))).selectOption(kind); await closeSettings(page);
    await expect(page.locator('#vehicle-kind')).toHaveValue(kind);
    await page.waitForTimeout(300); await page.screenshot({ path: info.outputPath(`${kind}-details.png`) });
  }
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('sedan');
  await (await control(page, page.locator('#driving-view'))).selectOption('cockpit');
  for (const visibility of ['2', '50', '1000']) {
    await (await control(page, page.locator('#fog-visibility'))).fill(visibility); await closeSettings(page);
    await expect(metric(page, 'Fog near / far')).toHaveText(`1 / ${visibility} m`);
    await expect(metric(page, 'Cabin sealed')).toHaveText('yes');
    await page.screenshot({ path: info.outputPath(`layered-fog-${visibility}.png`) });
  }
  await (await control(page, page.locator('#vehicle-windows'))).fill('100'); await closeSettings(page);
  await expect(metric(page, 'Cabin sealed')).toHaveText('no');
  await (await control(page, page.locator('#vehicle-windows'))).fill('0');
  await (await control(page, page.locator('#weather-rain'))).check(); await closeSettings(page);
  await expect(metric(page, 'Cabin sealed')).toHaveText('yes');
  await page.waitForTimeout(700); await page.screenshot({ path: info.outputPath('sealed-cabin-rain.png') });
  expect(errors).toEqual([]);
});
