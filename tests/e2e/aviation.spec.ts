import { expect, test } from '@playwright/test';

test('all aircraft and airports load inside Cloud Roads and return to the parked road vehicle', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=CLOUD-FLIGHT-FLEET');
  await page.locator('#drive-toggle').click();
  await expect(page.locator('body')).toHaveClass(/driving/);
  await page.locator('#aircraft-toggle').click();
  await expect(page.locator('#aviation')).toBeVisible();
  await expect(page.locator('#aviation #world')).toHaveCount(1);
  await expect(page.locator('#app')).toHaveAttribute('inert');
  const choices = page.locator('[data-aircraft]');
  await expect(choices).toHaveCount(12);
  for (let i = 0; i < 12; i++) {
    await choices.nth(i).click();
    await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    await expect(page.locator('[data-action="runway"]')).toBeEnabled();
  }
  for (const airport of ['coast', 'alpine', 'desert']) {
    await page.locator('[data-setting="airport"]').selectOption(airport);
    await expect(page.locator('[data-value="airport-description"]')).toContainText('Cloud Roads');
  }
  await page.locator('[data-setting="runway"]').selectOption('18');
  await page.locator('[data-action="runway"]').click();
  await expect(page.locator('[data-value="heading"]')).toHaveText('180');
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('#aviation')).toHaveCount(0);
  await expect(page.locator('#app > #world')).toHaveCount(1);
  await expect(page.locator('#app')).not.toHaveAttribute('inert');
  await expect(page.locator('body')).toHaveClass(/driving/);
  await expect(page.locator('[data-metric="Seed"]')).toHaveText('CLOUD-FLIGHT-FLEET');
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('airborne cockpit controls, precision input and pause remain isolated from road bindings', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=CLOUD-FLIGHT-CONTROLS');
  await page.locator('#aircraft-toggle').click(); await page.locator('[data-aircraft="su30"]').click();
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready');
  await page.locator('[data-action="airborne"]').click(); await page.keyboard.press('KeyV');
  await expect(page.locator('#aviation')).toHaveClass(/av-cockpit/);
  await page.keyboard.press('KeyI');
  const panel = page.locator('#av-systems-panel'); await expect(panel).toBeVisible();
  await panel.locator('[data-system-action="ap-level"]').click();
  await expect(panel.locator('[data-system-action="ap-level"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace'); await page.keyboard.down('Shift');
  await expect(page.locator('[data-action="precision"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('Shift'); await expect(page.locator('[data-action="precision"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-action="pause"]').click();
  await expect(page.locator('[data-action="resume"]')).toBeVisible();
  const altitude = await page.locator('[data-value="altitude"]').textContent();
  await page.waitForTimeout(350); await expect(page.locator('[data-value="altitude"]')).toHaveText(altitude!);
  await page.locator('[data-action="resume"]').click();
  await page.screenshot({ path: info.outputPath('cloud-roads-cockpit.png') });
  await page.locator('[data-action="exit"]').click();
  await page.locator('#aircraft-toggle').click();
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready');
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('#world')).toBeFocused();
  expect(errors).toEqual([]);
});

test('touch flight fits a phone and keeps the exit and throttle reachable', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto('/?seed=CLOUD-TOUCH-FLIGHT');
    await page.locator('#aircraft-toggle').tap(); await page.locator('[data-aircraft="t6"]').tap();
    await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready');
    await page.locator('[data-action="airborne"]').tap();
    await expect(page.locator('[data-action="exit"]')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.av-stick-pad')).toBeVisible();
    await page.locator('[data-throttle="1"]').tap();
    await expect(page.locator('[data-value="throttle"]')).toHaveText('100%');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.locator('[data-action="exit"]').tap();
    await expect(page.locator('#error')).toBeHidden();
  } finally { await context.close(); }
});

test('returns the shared canvas safely when WebGL is lost during flight', async ({ page }) => {
  await page.goto('/?seed=CLOUD-FLIGHT-CONTEXT');
  await page.locator('#aircraft-toggle').click(); await page.locator('[data-aircraft="su30"]').click();
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready');
  await page.locator('[data-action="airborne"]').click();
  const extension = await page.locator('#world').evaluateHandle(canvas => (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!);
  await extension.evaluate(ext => ext.loseContext());
  await expect(page.locator('#aviation')).toHaveCount(0); await expect(page.locator('#error')).toBeVisible();
  await page.waitForTimeout(200); await extension.evaluate(ext => ext.restoreContext());
  await expect(page.locator('#error')).toBeHidden(); await expect(page.locator('#app > #world')).toHaveCount(1);
  await page.locator('#aircraft-toggle').click();
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready');
  await page.locator('[data-action="exit"]').click();
});
