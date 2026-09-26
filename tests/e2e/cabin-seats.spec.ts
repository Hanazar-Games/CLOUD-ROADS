import { expect, test } from '@playwright/test';
import { closeSettings, control } from './settings';

test('holds windows at arbitrary heights and uses six fan speeds, ten radio channels and independent cabin lights', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=FLEET-FLAT'); await page.locator('#drive-toggle').click();
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.keyboard.down('Period'); await expect.poll(async () => Number(await metric('Window opening').textContent())).toBeGreaterThan(0.2);
  await page.keyboard.up('Period'); await page.waitForTimeout(300); const window = await metric('Window opening').textContent();
  expect(Number(window)).toBeLessThan(0.9); await page.waitForTimeout(500); await expect(metric('Window opening')).toHaveText(window!);
  for (let level = 1; level <= 6; level++) { await page.keyboard.press('KeyN'); await expect(metric('Cabin fan')).toHaveText(String(level)); }
  await page.keyboard.press('KeyN'); await expect(metric('Cabin fan')).toHaveText('0');
  for (let channel = 1; channel <= 10; channel++) { await page.keyboard.press(`Digit${channel % 10}`); await expect(metric('Radio channel')).toHaveText(String(channel)); }
  await page.keyboard.press('KeyK'); await page.keyboard.press('KeyU'); await expect(metric('Cabin lighting')).toHaveText('ambient / reading');
  await page.keyboard.press('KeyQ'); await expect(page.locator('#turn-left')).toHaveClass(/lit/);
  await page.keyboard.press('KeyM'); await expect(page.getByRole('dialog', { name: '旅程操作' })).toBeVisible();
  await expect(page.locator('#shortcut-list')).toContainText('Home / End'); await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('maps bus seats to real passenger cameras, prevents passenger driving and retains per-seat adjustments', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT');
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('coach'); await closeSettings(page);
  await page.locator('#drive-toggle').click(); await page.keyboard.press('KeyP');
  await expect(page.getByRole('dialog', { name: '选择座位' })).toBeVisible();
  expect(await page.locator('#seat-map button').count()).toBeGreaterThan(30);
  await page.locator('[data-seat="row-3-3"]').click();
  await expect(page.locator('[data-metric="Cabin seat"]')).toHaveText('row-3-3');
  const position = await page.locator('[data-metric="Vehicle position"]').textContent();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  await expect(page.locator('#vehicle-speed')).toHaveText('0');
  await expect(page.locator('[data-metric="Vehicle position"]')).toHaveText(position!);
  await page.keyboard.down('PageUp'); await page.waitForTimeout(400); await page.keyboard.up('PageUp');
  await expect.poll(async () => JSON.parse((await page.locator('[data-metric="Seat adjustment"]').textContent())!).height).toBeGreaterThan(0);
  await page.keyboard.press('KeyP'); await page.locator('[data-seat="driver"]').click();
  await expect(page.locator('[data-metric="Seat adjustment"]')).toContainText('"height":0');
  await page.keyboard.down('KeyW'); await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(2);
  await page.keyboard.up('KeyW'); await page.keyboard.press('KeyP');
  await expect(page.locator('[data-seat="row-1-0"]')).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('operates a parked crane from its rear seat and requires stowing before driving', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT');
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('crane'); await closeSettings(page);
  await page.locator('#drive-toggle').click(); await page.keyboard.press('KeyP'); await page.locator('[data-seat="operator"]').click();
  await page.keyboard.press('KeyO'); await expect(page.locator('[data-metric="Crane state"]')).toHaveText('active');
  await page.waitForTimeout(3000); await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await page.keyboard.down('KeyE');
  await page.waitForTimeout(1500); await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyE');
  await expect(page.locator('[data-metric="Crane boom"]')).not.toHaveText('0.00 / 0.00 / 0.00');
  await page.keyboard.press('KeyM');
  await expect(page.locator('#controls-menu')).toBeVisible();
  await page.waitForTimeout(300);
  const boom = await page.locator('[data-metric="Crane boom"]').textContent();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(350); await page.keyboard.up('KeyW');
  await expect(page.locator('[data-metric="Crane boom"]')).toHaveText(boom!);
  await page.keyboard.press('Escape'); await expect(page.locator('#world')).toBeFocused();
  await expect(page.locator('#vehicle-speed')).toHaveText('0');
  await page.keyboard.press('KeyP'); await page.locator('[data-seat="driver"]').click();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW'); await expect(page.locator('#vehicle-speed')).toHaveText('0');
  await page.keyboard.press('KeyP'); await page.locator('[data-seat="operator"]').click(); await page.keyboard.press('KeyO');
  await expect(page.locator('[data-metric="Crane state"]')).toHaveText('stowed', { timeout: 15000 });
  await page.keyboard.press('KeyP'); await page.locator('[data-seat="driver"]').click();
  await page.keyboard.down('KeyW'); await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(2); await page.keyboard.up('KeyW');
});

test('keeps every coach seat and menu controls reachable in a short narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 450 }); await page.goto('/?seed=FLEET-FLAT');
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('coach'); await closeSettings(page);
  await page.locator('#drive-toggle').click(); await page.keyboard.press('KeyP');
  const dialog = page.locator('#seat-dialog');
  const bounds = await dialog.boundingBox(); expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(450);
  await page.locator('#seat-map button').last().click();
  await expect(page.locator('[data-metric="Cabin seat"]')).toHaveText('row-13-3');
  await page.keyboard.press('KeyM');
  await page.locator('#shortcut-list tr').last().scrollIntoViewIfNeeded();
  await page.locator('#controls-menu button[data-close]').click();
  await expect(page.locator('#world')).toBeFocused();
});
