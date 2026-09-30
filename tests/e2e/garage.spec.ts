import { expect, test, type Page } from '@playwright/test';
import { control, closeSettings, ignite, sceneShot } from './settings';

const metric = (page: Page, name: string) => page.locator(`[data-metric="${name}"]`);

test('streams floor details, adjusts lighting and walks continuously from the entrance down the straight ramp', async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?seed=GARAGE-RAMP-55');
  await expect(metric(page, 'Road ready')).toHaveText('yes', { timeout: 30000 });
  await expect.poll(async () => Number(await metric(page, 'Garage access').textContent())).toBeGreaterThan(512);
  await (await control(page, page.locator('#garage-floor'))).selectOption('3');
  await page.locator('#garage-view').click();
  await expect(metric(page, 'Garage loaded floors')).toHaveText('3');
  await (await control(page, page.locator('#garage-loading'))).selectOption('all');
  await expect(metric(page, 'Garage loaded floors')).toHaveText('6');
  await page.locator('#garage-light').fill('150');
  await expect(metric(page, 'Garage light')).toHaveText('150%');
  await page.locator('#garage-loading').selectOption('floor');
  await expect(metric(page, 'Garage loaded floors')).toHaveText('3');
  await page.locator('#garage-floor').selectOption('0'); await page.locator('#garage-view').click();
  await expect(metric(page, 'Pending / queued')).toHaveText('0 / 0', { timeout: 30000 });
  const roof = Number((await metric(page, 'Garage position').textContent())!.split(',')[1]);
  const feet = async () => Number((await metric(page, 'Walking position').textContent())!.split(',')[1]);
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyE');
  await expect.poll(feet, { timeout: 30000 }).toBeLessThan(roof - 2);
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyE');
  await sceneShot(page, { path: info.outputPath('straight-ramp.png') });
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyE');
  await expect.poll(feet, { timeout: 30000 }).toBeLessThan(roof - 5.95);
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyE');
  await expect(metric(page, 'Garage floor')).toHaveText('1');
  expect(await feet()).toBeGreaterThan(roof - 6.05);
  await sceneShot(page, { path: info.outputPath('B1-landing.png') });
  expect(errors).toEqual([]);
});

test('locates every underground floor and boards a selected random-color vehicle without changing floors', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?seed=GARAGE-49');
  await expect(metric(page, 'Road ready')).toHaveText('yes', { timeout: 30000 });
  await (await control(page, page.locator('#garage-density'))).fill('100');
  await expect(metric(page, 'Garage vehicles')).toHaveText('165');
  const roof = Number((await metric(page, 'Garage position').textContent())!.split(',')[1]);
  for (const floor of [1, 2, 3, 4, 5]) {
    await (await control(page, page.locator('#garage-floor'))).selectOption(String(floor));
    await page.locator('#garage-view').click();
    await expect(metric(page, 'Travel mode')).toHaveText('walking');
    await expect(metric(page, 'Garage floor')).toHaveText(String(floor));
    await expect.poll(async () => Number((await metric(page, 'Walking position').textContent())!.split(',')[1])).toBeCloseTo(roof - floor * 6, 1);
    await expect(page.locator('#season-status')).toContainText('地下车库');
    if (floor === 1 || floor === 5) {
      await page.keyboard.press('Space');
      await expect(page.locator('#walking-status')).toHaveText('站立');
      await page.screenshot({ path: info.outputPath(`B${floor}.png`) });
    }
  }
  await (await control(page, page.locator('#garage-kind'))).selectOption('semi20');
  await expect(metric(page, 'Garage vehicles')).toHaveText('35');
  await page.locator('#garage-car-view').click();
  await expect(page.locator('#boarding-help')).toBeVisible();
  await page.keyboard.press('KeyF');
  await expect(metric(page, 'Travel mode')).toHaveText('driving');
  await expect(metric(page, 'Vehicle model')).toContainText('20 米');
  await expect(metric(page, 'Garage vehicles')).toHaveText('34');
  await ignite(page);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent()), { timeout: 10000 }).toBeGreaterThan(3);
  await page.keyboard.up('KeyW'); await page.keyboard.down('Space');
  await expect(page.locator('#vehicle-speed')).toHaveText('0'); await page.keyboard.up('Space');
  await page.keyboard.press('KeyF'); await expect(metric(page, 'Travel mode')).toHaveText('walking');
  await expect(metric(page, 'Garage floor')).toHaveText('5');
  expect(errors).toEqual([]);
});

test('keeps traffic and garage controls in presets and honors the zero-density setting', async ({ page }, info) => {
  await page.goto('/?seed=GARAGE-PRESET');
  await (await control(page, page.locator('#traffic-limit'))).fill('120');
  await page.locator('#traffic-density').fill('50');
  await expect(metric(page, 'NPC target')).toHaveText('60');
  await (await control(page, page.locator('#garage-density'))).fill('75');
  await page.locator('#garage-kind').selectOption('supercar');
  await page.locator('#garage-paint').selectOption('factory');
  await page.locator('#garage-loading').selectOption('all');
  await page.locator('#garage-light').fill('150');
  await (await control(page, page.locator('#preset-save'))).click();
  await expect(page.locator('#preset-status')).toContainText('已保存');
  await (await control(page, page.locator('#traffic-limit'))).fill('12');
  await (await control(page, page.locator('#garage-density'))).fill('0');
  await expect(metric(page, 'Garage vehicles')).toHaveText('0');
  await (await control(page, page.locator('#preset-apply'))).click();
  await expect(metric(page, 'NPC limit')).toHaveText('120');
  await expect(page.locator('#garage-density')).toHaveValue('75');
  await expect(page.locator('#garage-kind')).toHaveValue('supercar');
  await expect(page.locator('#garage-paint')).toHaveValue('factory');
  await expect(page.locator('#garage-loading')).toHaveValue('all');
  await expect(page.locator('#garage-light')).toHaveValue('150');
  await (await control(page, page.locator('#garage-floor'))).selectOption('0');
  await page.locator('#garage-view').click();
  await expect(metric(page, 'Garage floor')).toHaveText('0');
  await sceneShot(page, { path: info.outputPath('entrance.png') });
  await (await control(page, page.locator('#traffic-density'))).fill('0');
  await closeSettings(page); await expect(metric(page, 'NPC target')).toHaveText('0');
});
