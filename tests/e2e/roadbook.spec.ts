import { expect, test } from '@playwright/test';
import { closeSettings, control, ignite } from './settings';

test('previews actual road geometry, changes range and reverses the elevation profile', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=ROADBOOK-ALPINE');
  await expect(page.locator('#drive-toggle')).toBeEnabled();
  await page.locator('#roadbook-open').click();
  await expect(page.locator('#roadbook-content')).toBeVisible();
  await expect(page.locator('#roadbook-context')).not.toBeEmpty();
  await expect(page.locator('#roadbook-map-route path').first()).toHaveAttribute('d', /^M[\d.-]+,/);
  await expect(page.locator('[data-roadbook-range="3000"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-roadbook-range="1000"]').click();
  await expect(page.locator('#roadbook-profile-end')).toHaveText('1.00 km');
  const grade = Number((await page.locator('#roadbook-grade').textContent())!.replace('%', ''));
  await page.locator('#roadbook-reverse').click();
  await expect(page.locator('#roadbook-status')).toContainText('反向查看');
  expect(Number((await page.locator('#roadbook-grade').textContent())!.replace('%', ''))).toBeCloseTo(-grade);
  await page.locator('#roadbook-reverse').click();
  await page.locator('[data-roadbook-range="5000"]').click();
  await expect(page.locator('[data-roadbook-range="5000"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('#roadbook-map-route .roadbook-line').count()).toBeLessThanOrEqual(160);
  expect(await page.locator('#roadbook-places li').count()).toBeLessThanOrEqual(6);
  expect(await page.locator('#roadbook-map-route').innerHTML()).not.toMatch(/NaN|Infinity/);
  await expect(page.locator('#roadbook-profile-summary')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: info.outputPath('roadbook-desktop.png') });
  await page.keyboard.press('Escape'); await expect(page.locator('#world')).toBeFocused();
  await page.keyboard.press('KeyM'); await expect(page.locator('#roadbook-dialog')).toBeVisible();
  await expect(page.locator('#roadbook-dialog [data-close]')).toBeFocused();
  expect(errors).toEqual([]);
});

test('freezes a moving vehicle and clears held throttle when the roadbook opens', async ({ page }) => {
  await page.goto('/?seed=ROADBOOK-DRIVE');
  await page.locator('#drive-toggle').click(); await ignite(page);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent()), { timeout: 20000 }).toBeGreaterThan(12);
  await page.keyboard.press('KeyM'); await page.keyboard.up('KeyW');
  await expect(page.locator('#roadbook-content')).toBeVisible();
  await page.waitForTimeout(300);
  const trip = await page.locator('#vehicle-trip').textContent(), speed = await page.locator('#vehicle-speed').textContent();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
  await expect(page.locator('#vehicle-trip')).toHaveText(trip!); await expect(page.locator('#vehicle-speed')).toHaveText(speed!);
  await page.keyboard.press('Escape'); await expect(page.locator('#world')).toBeFocused();
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent()), { timeout: 10000 }).toBeLessThanOrEqual(Number(speed));
  await page.keyboard.press('Slash'); await page.keyboard.press('KeyM'); await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toHaveAttribute('aria-pressed', 'true');
});

test('opens from the menu without stacked dialogs, rebinds and persists its shortcut', async ({ page }) => {
  await page.goto('/?seed=ROADBOOK-KEYS');
  await page.locator('#menu-open').click(); await page.locator('#menu-roadbook').click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.locator('#roadbook-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await (await control(page, page.locator('[data-binding="Roadbook"]'))).click();
  await page.keyboard.press('Shift+KeyZ');
  await expect(page.locator('[data-binding="Roadbook"]')).toHaveText('Shift+Z');
  await closeSettings(page); await page.keyboard.press('Shift+KeyZ');
  await expect(page.locator('#roadbook-dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await page.reload(); await expect(page.locator('#drive-toggle')).toBeEnabled();
  await page.locator('#world').focus(); await page.keyboard.press('Shift+KeyZ');
  await expect(page.locator('#roadbook-dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await page.locator('#menu-open').click();
  await expect(page.locator('#menu-roadbook')).toHaveText('旅途路书 · Shift+Z');
});

test('refreshes the world after regeneration and performs no hidden map updates', async ({ page }) => {
  await page.goto('/?seed=ROADBOOK-RESET');
  await expect(page.locator('#drive-toggle')).toBeEnabled(); await page.locator('#roadbook-open').click();
  await expect(page.locator('#roadbook-content')).toBeVisible(); await page.keyboard.press('Escape');
  const updates = await page.locator('#roadbook-map-route').evaluate(async node => {
    let changes = 0; const observer = new MutationObserver(records => { changes += records.length; });
    observer.observe(node, { subtree: true, childList: true, attributes: true });
    await new Promise(resolve => setTimeout(resolve, 1200)); observer.disconnect(); return changes;
  });
  expect(updates).toBe(0);
  for (const [terrain, name] of [['moon', '低重力远行'], ['forest', '森林山谷']] as const) {
    await (await control(page, page.locator('#terrain-kind'))).selectOption(terrain);
    await page.locator('#world-options button[type="submit"]').click();
    await expect(page.locator('#drive-toggle')).toBeEnabled(); await closeSettings(page);
    await page.locator('#roadbook-open').click();
    await expect(page.locator('#roadbook-context')).toContainText(name);
    await expect(page.locator('#roadbook-content')).toBeVisible();
    expect(await page.locator('#roadbook-map-route').innerHTML()).not.toMatch(/NaN|Infinity/);
    await page.keyboard.press('Escape');
  }
});

for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 500 }]) {
  test(`keeps the roadbook readable and closeable at ${viewport.width} × ${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport); await page.goto('/?seed=ROADBOOK-SMALL');
    await expect(page.locator('#drive-toggle')).toBeEnabled(); await page.locator('#roadbook-open').click();
    await expect(page.locator('#roadbook-content')).toBeVisible();
    const dialog = await page.locator('#roadbook-dialog').boundingBox();
    expect(dialog!.x).toBeGreaterThanOrEqual(0); expect(dialog!.y).toBeGreaterThanOrEqual(0);
    expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(viewport.width);
    expect(dialog!.y + dialog!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.locator('.roadbook-scroll').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await page.locator('#roadbook-profile-summary').scrollIntoViewIfNeeded();
    await expect(page.locator('#roadbook-dialog [data-close]')).toBeInViewport();
    await page.screenshot({ path: info.outputPath('roadbook-small.png') });
    await page.locator('#roadbook-dialog [data-close]').click(); await expect(page.locator('#world')).toBeFocused();
  });
}
