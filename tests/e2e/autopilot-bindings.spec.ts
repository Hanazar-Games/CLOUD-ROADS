import { expect, test } from '@playwright/test';
import { closeSettings, control, ignite } from './settings';

test('cruises, pauses in dialogs and yields to manual braking in all control modes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=PILOT-42');
  await (await control(page, page.locator('#route-style'))).selectOption('0');
  await page.locator('#world-options button[type="submit"]').click();
  await expect(page.locator('#drive-toggle')).toBeEnabled(); await page.locator('#drive-toggle').click(); await ignite(page);
  await page.keyboard.press('Semicolon'); await expect(page.locator('#hud-autopilot')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent()), { timeout: 20000 }).toBeGreaterThan(15);
  await (await control(page, page.locator('#autopilot-min'))).fill('100');
  await page.locator('#autopilot-max').fill('40'); await page.locator('#autopilot-options button[type="submit"]').click();
  await expect(page.locator('#autopilot-settings-status')).toContainText('不能低于');
  const speed = await page.locator('#vehicle-speed').textContent(); await page.waitForTimeout(250);
  await expect(page.locator('#vehicle-speed')).toHaveText(speed!);
  await page.locator('#autopilot-min').fill('15'); await page.locator('#autopilot-max').fill('40');
  await page.locator('#autopilot-mode').selectOption('speed'); await page.locator('#autopilot-options button[type="submit"]').click();
  await closeSettings(page); await expect(page.locator('#hud-autopilot')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Semicolon'); await expect(page.locator('#hud-autopilot')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('KeyS'); await expect(page.locator('#hud-autopilot')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Quote'); await expect(page.locator('#hud-autopilot')).toContainText('仅控制方向');
  await page.keyboard.press('Semicolon'); await expect(page.locator('#hud-autopilot')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('KeyW'); await expect(page.locator('#hud-autopilot')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('KeyA'); await expect(page.locator('#hud-autopilot')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#hud-autopilot').click(); await expect(page.locator('#hud-autopilot')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#hud-autopilot').click(); await expect(page.locator('#hud-autopilot')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await (await control(page, page.locator('#autopilot-max'))).scrollIntoViewIfNeeded(); await expect(page.locator('#autopilot-max')).toHaveValue('40');
  await expect(page.locator('#autopilot-toggle')).toHaveAttribute('aria-pressed', 'false'); expect(errors).toEqual([]);
});

test('rebinds operations, handles conflicts and shifted keys, persists and resets', async ({ page }) => {
  await page.goto('/?seed=PILOT-KEYS'); await page.locator('#drive-toggle').click(); await ignite(page);
  await (await control(page, page.locator('[data-binding="Autopilot"]'))).click(); await page.keyboard.press('F9');
  await expect(page.locator('[data-binding="Autopilot"]')).toHaveText('F9');
  await page.locator('[data-binding="KeyL"]').click(); await page.keyboard.press('F9');
  await expect(page.locator('#bindings-status')).toContainText('占用'); await page.keyboard.press('Escape');
  await page.locator('[data-binding="Refill"]').click(); await page.keyboard.press('Shift+KeyR');
  await expect(page.locator('[data-binding="Refill"]')).toHaveText('Shift+R');
  await page.locator('[data-binding="Ignition"]').click(); await page.keyboard.press('Shift+KeyU');
  await closeSettings(page); await page.keyboard.press('Shift+KeyU');
  await expect(page.locator('[data-metric="Ignition"]')).toHaveText('off');
  await page.keyboard.press('Backquote'); await expect(page.locator('[data-metric="Ignition"]')).toHaveText('off');
  await page.keyboard.press('KeyM'); await expect(page.locator('#shortcut-list')).toContainText('F9');
  await page.keyboard.press('Escape'); await page.reload();
  await (await control(page, page.locator('[data-binding="Autopilot"]'))).scrollIntoViewIfNeeded();
  await expect(page.locator('[data-binding="Autopilot"]')).toHaveText('F9');
  await page.locator('#bindings-reset').click(); await expect(page.locator('[data-binding="Autopilot"]')).toHaveText(';');
  await expect(page.locator('[data-binding="Ignition"]')).toHaveText('·');
});

test('keeps key capture inside the modal and fits the binding panel on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/?seed=PILOT-MOBILE');
  await (await control(page, page.locator('[data-binding="KeyW"]'))).click(); await page.keyboard.press('KeyL');
  await expect(page.locator('#bindings-status')).toContainText('占用'); await page.keyboard.press('Escape');
  await expect(page.locator('#explorer')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('[data-binding="KeyW"]')).toHaveText('W');
  await page.locator('[data-binding="KeyW"]').click();
  await page.locator('[data-settings-target="autopilot"]').click();
  await page.locator('#autopilot-min').fill('25');
  await expect(page.locator('#autopilot-min')).toHaveValue('25');
  await expect(page.locator('[data-binding="KeyW"]')).toHaveText('W');
});
