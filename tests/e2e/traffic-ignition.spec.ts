import { expect, test, type Page } from '@playwright/test';
import { control, closeSettings, openSettings } from './settings';

const metric = (page: Page, name: string) => page.locator(`[data-metric="${name}"]`);

test('starts and stops the engine, opens real doors for boarding and prevents moving exits', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?seed=IGNITION-40');
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30000 });
  await page.locator('#drive-toggle').click();
  await expect(metric(page, 'Ignition')).toHaveText('off');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  await expect(page.locator('#vehicle-speed')).toHaveText('0');
  await expect(page.locator('#engine-rpm')).toHaveText('0');
  await page.keyboard.press('F2'); await expect(metric(page, 'Ignition')).toHaveText('starting');
  await page.keyboard.press('F8'); await page.waitForTimeout(1000);
  await expect(metric(page, 'Ignition')).toHaveText('starting');
  await page.keyboard.press('F8'); await expect(metric(page, 'Ignition')).toHaveText('running');
  await page.keyboard.down('KeyW'); await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(12);
  await page.keyboard.up('KeyW'); await page.keyboard.press('KeyF');
  await expect(metric(page, 'Travel mode')).toHaveText('driving');
  await page.keyboard.press('F2'); await expect(metric(page, 'Ignition')).toHaveText('off');
  expect(Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(1);
  await page.keyboard.down('Space'); await expect(page.locator('#vehicle-speed')).toHaveText('0'); await page.keyboard.up('Space');
  await page.keyboard.press('KeyF'); await expect(metric(page, 'Travel mode')).toHaveText('walking');
  await expect(page.locator('#boarding-help')).toBeVisible();
  await page.keyboard.press('KeyF'); await expect(metric(page, 'Travel mode')).toHaveText('driving');
  await expect(metric(page, 'Vehicle operations')).toHaveText('0.00 / 0.00 / 0.00');
  await expect(metric(page, 'Ignition')).toHaveText('off');
  await page.keyboard.press('KeyP'); await page.locator('[data-seat="front"]').click();
  await page.keyboard.press('F2'); await expect(metric(page, 'Ignition')).toHaveText('off');
  expect(errors).toEqual([]);
});

test('controls bounded live traffic, freezes it in settings and stores only density in presets', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?seed=TRAFFIC-40');
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30000 });
  await page.locator('#drive-toggle').click();
  await (await control(page, page.locator('#traffic-density'))).fill('100'); await closeSettings(page);
  await expect.poll(async () => Number(await metric(page, 'NPC vehicles').textContent()), { timeout: 30000 }).toBeGreaterThan(5);
  expect(Number(await metric(page, 'NPC vehicles').textContent())).toBeLessThanOrEqual(24);
  const motion = await metric(page, 'NPC motion').textContent(); await expect(metric(page, 'NPC motion')).not.toHaveText(motion!);
  await openSettings(page); await page.waitForTimeout(300);
  const paused = await metric(page, 'NPC motion').textContent(); await page.waitForTimeout(500); await expect(metric(page, 'NPC motion')).toHaveText(paused!);
  await (await control(page, page.locator('#traffic-density'))).fill('0'); await expect(metric(page, 'NPC vehicles')).toHaveText('0');
  await (await control(page, page.locator('#preset-name'))).fill('Quiet traffic'); await page.locator('#preset-save').click();
  await (await control(page, page.locator('#traffic-density'))).fill('75');
  await (await control(page, page.locator('#preset-apply'))).click();
  await expect(page.locator('#traffic-density')).toHaveValue('0'); await expect(metric(page, 'NPC vehicles')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('cancels a pending boarding animation when leaving walking mode', async ({ page }) => {
  await page.goto('/?seed=BOARD-CANCEL');
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30000 });
  await page.locator('#drive-toggle').click(); await page.keyboard.press('KeyF');
  await expect(metric(page, 'Travel mode')).toHaveText('walking');
  await page.keyboard.press('KeyF'); await page.locator('#walk-toggle').click();
  await expect(metric(page, 'Travel mode')).toHaveText('flight');
  await page.waitForTimeout(2000); await expect(metric(page, 'Travel mode')).toHaveText('flight');
});
