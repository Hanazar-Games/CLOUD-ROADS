import { expect, test } from '@playwright/test';
import { control, toggleSettings } from './settings';

test('wipes accumulated windshield water and freezes it while paused', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=FLEET-FLAT');
  await (await control(page, page.locator('#terrain-kind'))).selectOption('meadow');
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '应用并返回起点' }))).click();
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('truck5');
  await (await control(page, page.locator('#driving-view'))).selectOption('cockpit');
  await (await control(page, page.locator('#weather-kind'))).selectOption('storm');
  await (await control(page, page.locator('#vehicle-wipers'))).selectOption('off');
  await expect(page.locator('#drive-toggle')).toBeEnabled(); await (await control(page, page.locator('#drive-toggle'))).click();
  await expect.poll(async () => parseFloat((await metric('Wiped water').textContent())!), { timeout: 15000 }).toBeGreaterThan(90);
  await page.keyboard.press('KeyP'); await page.waitForTimeout(250);
  const water = await metric('Glass water').textContent(); await page.waitForTimeout(500);
  await expect(metric('Glass water')).toHaveText(water!);
  await page.keyboard.press('KeyF'); await expect(metric('Travel mode')).toHaveText('driving');
  await page.keyboard.press('KeyP');
  await toggleSettings(page); await (await control(page, page.locator('#vehicle-wipers'))).selectOption('high');
  await toggleSettings(page); await (await control(page, page.locator('#world'))).focus();
  await expect.poll(async () => parseFloat((await metric('Wiped water').textContent())!), { timeout: 5000 }).toBeLessThan(20);
  expect(parseFloat((await metric('Glass water').textContent())!)).toBeGreaterThan(15);
  await toggleSettings(page); await (await control(page, page.locator('#vehicle-kind'))).selectOption('motorcycle');
  await expect(metric('Glass water')).toHaveText('0%'); await expect(page.locator('#vehicle-wipers')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('leaves a parked vehicle on a high bridge with F and boards it without resetting the trip', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=VALLEY-22'); await (await control(page, page.locator('#terrain-kind'))).selectOption('forest');
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '应用并返回起点' }))).click();
  await expect(page.locator('#bridge-view')).toBeEnabled(); await (await control(page, page.locator('#bridge-view'))).click();
  await (await control(page, page.locator('#drive-toggle'))).click(); await expect(metric('Travel mode')).toHaveText('driving');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1600); await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyF'); await expect(metric('Travel mode')).toHaveText('walking');
  await expect(metric('Parked vehicle')).toHaveText('yes'); await expect(metric('Walking grounded')).toHaveText('yes');
  const vehicle = (await metric('Vehicle position').textContent())!.split(',').map(Number);
  const person = (await metric('Walking position').textContent())!.split(',').map(Number);
  expect(Math.hypot(vehicle[0] - person[0], vehicle[2] - person[2])).toBeLessThan(4);
  expect(Math.abs(vehicle[1] - person[1])).toBeLessThan(1.5);
  await expect(page.locator('#boarding-help')).toBeVisible();
  const trip = await page.locator('#vehicle-trip').textContent(), parked = await metric('Vehicle position').textContent();
  await page.keyboard.press('KeyF'); await expect(metric('Travel mode')).toHaveText('driving');
  await expect(page.locator('#vehicle-trip')).toHaveText(trip!);
  await expect(metric('Vehicle position')).toHaveText(parked!);
  await expect(metric('Vehicle speed')).toHaveText('0.0 km/h');
  await (await control(page, page.locator('#release-open'))).click(); await page.keyboard.press('KeyF');
  await expect(metric('Travel mode')).toHaveText('driving'); await page.keyboard.press('Escape'); await (await control(page, page.locator('#world'))).focus();
  await page.keyboard.press('KeyF'); await expect(metric('Travel mode')).toHaveText('walking');
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyE'); await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyE'); await page.keyboard.press('KeyF');
  await expect(metric('Travel mode')).toHaveText('walking'); await expect(metric('Vehicle position')).toHaveText(parked!);
  await toggleSettings(page); await (await control(page, page.locator('#random-world'))).click();
  await expect(metric('Parked vehicle')).toHaveText('no'); await expect(metric('Travel mode')).toHaveText('flight');
  expect(errors).toEqual([]);
});

test('keeps lightweight antialiasing and cloud detail through resizing and context restoration', async ({ page }) => {
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=CLOUD-ROAD-001'); await expect(metric('Road ready')).toHaveText('yes');
  await (await control(page, page.locator('#antialiasing'))).selectOption('1'); await (await control(page, page.locator('#cloud-quality'))).selectOption('12');
  await expect(metric('Scene samples')).toHaveText('0'); await expect(metric('FXAA')).toHaveText('on');
  await expect(metric('Cloud steps')).toHaveText('12'); await page.setViewportSize({ width: 1100, height: 720 });
  await page.locator('#world').evaluate(canvas => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 500);
  });
  await expect(page.locator('#error')).toBeVisible(); await expect(page.locator('#error')).toBeHidden();
  await expect(metric('FXAA')).toHaveText('on'); await expect(metric('Cloud steps')).toHaveText('12');
  await (await control(page, page.locator('#antialiasing'))).selectOption('0'); await expect(metric('FXAA')).toHaveText('off');
  await (await control(page, page.locator('#graphics-preset'))).selectOption('quality');
  await expect(metric('Scene samples')).toHaveText('4'); await expect(metric('Cloud steps')).toHaveText('28');
});
