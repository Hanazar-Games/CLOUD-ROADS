import { expect, test, type Page } from '@playwright/test';

async function openFlightSettings(page: Page) {
  await page.locator('#aircraft-toggle').click();
  await expect(page.locator('#airport-board')).toBeEnabled();
  await page.locator('#airport-board').click();
  await expect(page.locator('#aviation')).toHaveClass(/av-cockpit/);
  await page.locator('[data-action="pause"]').click();
  await page.locator('[data-action="hangar"]').click();
}

test('free flight supports orbit, zoom, airport overview, recovery and repeat departures', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=CLOUD-FREE-FLIGHT');
  await openFlightSettings(page);
  await page.locator('[data-aircraft="t6"]').click();
  await expect(page.locator('[data-action="runway"]')).toBeEnabled();
  await page.locator('[data-setting="runway-strip"]').selectOption('1');
  await page.locator('[data-action="runway"]').click();
  await expect(page.locator('.av-panel')).toBeHidden();
  await page.mouse.move(700, 400); await page.mouse.down({ button: 'right' });
  await page.mouse.move(900, 460, { steps: 8 }); await page.mouse.up({ button: 'right' });
  await page.mouse.wheel(0, 500);
  await expect(page.locator('[data-view="orbitAngle"]')).not.toHaveValue('0');
  expect(Number(await page.locator('[data-view="chaseDistance"]').inputValue())).toBeGreaterThan(100);
  await page.locator('[data-action="camera"]').click();
  await expect(page.locator('[data-camera]')).toHaveCount(9);
  await page.locator('[data-camera="8"]').click();
  await expect(page.locator('[data-action="camera"]')).toContainText('机场总览');
  await page.locator('[data-action="camera"]').click();
  await page.locator('[data-action="recover"]').click();
  await expect(page.locator('[data-value="phase"]')).toContainText('AIRBORNE');
  await expect(page.locator('.av-panel')).toBeHidden();
  await expect(page.locator('[data-value="guide"]')).toContainText('自由探索');
  await page.locator('[data-action="airport"]').click();
  await expect(page.locator('[data-value="phase"]')).toContainText('TAXI');
  await expect(page.locator('#aviation')).toHaveClass(/av-cockpit/);
  await expect(page.locator('.av-panel')).toBeHidden();
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('[data-metric="Seed"]')).toHaveText('CLOUD-FREE-FLIGHT');
  await expect(page.locator('#airport-dock')).toBeVisible();
  expect(errors).toEqual([]);
});

test('all aircraft and airports load after teleporting within the road world', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=CLOUD-FLIGHT-FLEET');
  await page.locator('#drive-toggle').click();
  await expect(page.locator('body')).toHaveClass(/driving/);
  await openFlightSettings(page);
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
  await expect(page.locator('body')).toHaveClass(/walking/);
  await expect(page.locator('[data-metric="Seed"]')).toHaveText('CLOUD-FLIGHT-FLEET');
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('airborne cockpit controls, precision input and pause remain isolated from road bindings', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=CLOUD-FLIGHT-CONTROLS');
  await openFlightSettings(page); await page.locator('[data-aircraft="su30"]').click();
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready');
  await page.locator('[data-action="airborne"]').click(); await expect(page.locator('.av-panel')).toBeHidden(); await page.keyboard.press('KeyV');
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
  await openFlightSettings(page);
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready');
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('#world')).toBeFocused();
  expect(errors).toEqual([]);
});

test('mouse aim steers the flight path, hides the cursor and releases it for settings', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=CLOUD-MOUSE-AIM');
  await openFlightSettings(page);
  await page.locator('[data-aircraft="su30"]').click();
  await page.locator('[data-action="airborne"]').click();
  await expect(page.locator('.av-panel')).toBeHidden();
  const aim = page.locator('.av-aim'), canvas = page.locator('#aviation #world');
  const heading = page.locator('[data-value="heading"]'), vertical = page.locator('[data-value="vertical"]');
  await page.mouse.move(700, 480);
  await expect(aim).toBeVisible();
  await expect(canvas).toHaveCSS('cursor', 'none');
  await expect(page.locator('[data-value="keyhint"]')).toContainText('移动鼠标瞄准');
  const before = (await page.locator('.av-aim-target').boundingBox())!;
  await page.mouse.move(870, 400, { steps: 6 });
  await expect.poll(async () => (await page.locator('.av-aim-target').boundingBox())!.x).toBeGreaterThan(before.x + 50);
  await expect.poll(async () => Number(await heading.textContent()), { timeout: 10000 }).toBeGreaterThan(5);
  await expect.poll(async () => Number(await vertical.textContent())).toBeGreaterThan(2);
  await page.screenshot({ path: info.outputPath('flight-mouse-aim.png') });

  const bank = page.locator('[data-value="bank"]');
  const rollDegrees = async () => Number((await bank.textContent())?.match(/滚转 (-?\d+)°/)?.[1]);
  await page.keyboard.down('ArrowRight');
  try {
    await expect.poll(async () => Math.abs(await rollDegrees()), { timeout: 10000 }).toBeGreaterThan(120);
  } finally {
    await page.keyboard.up('ArrowRight');
  }
  await expect.poll(async () => Math.abs(await rollDegrees()), { timeout: 10000 }).toBeLessThan(5);

  await page.mouse.click(870, 400);
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('world');
  await expect(page.locator('[data-value="keyhint"]')).toContainText('Esc 释放鼠标');
  await page.keyboard.press('KeyP');
  await expect(page.locator('.av-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(aim).toBeHidden();
  await expect(canvas).not.toHaveCSS('cursor', 'none');

  await page.locator('[data-setting="flight-mode"]').selectOption('limited');
  await expect(page.locator('[data-physics="bankLimit"]')).toBeEnabled();
  await expect(page.locator('[data-value="physics-help"]')).toContainText('限角机动');
  await page.getByText(/^气动与失速 ·/).click();
  await page.locator('[data-physics-number="stallRecovery"]').fill('150');
  await expect(page.locator('[data-physics="stallRecovery"]')).toHaveValue('150');
  await expect(page.locator('[data-value="aero-snapshot"]')).toContainText('气流分离');
  await page.locator('[data-setting="flight-mode"]').selectOption('maneuver');
  await expect(page.locator('[data-physics="bankLimit"]')).toBeDisabled();

  await page.locator('.av-help summary').filter({ hasText: /^操作与键位$/ }).click();
  await page.locator('[data-setting="mouse-aim"]').selectOption('off');
  await page.locator('[data-action="resume"]').click();
  await page.mouse.move(700, 480);
  await expect(aim).toBeHidden();
  await expect(canvas).not.toHaveCSS('cursor', 'none');
  await page.locator('[data-action="exit"]').click();
  expect(errors).toEqual([]);
});

test('high-altitude tuning displays true and equivalent airspeed separately', async ({ page }) => {
  await page.goto('/?seed=CLOUD-AIRSPEED');
  await openFlightSettings(page);
  await page.locator('[data-aircraft="su30"]').click();
  await page.locator('[data-flight-preset="altitude"]').click();
  await page.locator('[data-action="airborne"]').click();
  await expect(page.locator('.av-panel')).toBeHidden();
  const eas = page.locator('[data-value="equivalent-speed"]');
  await expect(eas).toBeVisible();
  const equivalent = Number((await eas.textContent())?.match(/EAS (\d+)/)?.[1]);
  expect(equivalent).toBeGreaterThan(0);
  expect(equivalent).toBeLessThan(Number(await page.locator('[data-value="speed"]').textContent()));
});

test('touch flight fits a phone and keeps the exit and throttle reachable', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto('/?seed=CLOUD-TOUCH-FLIGHT');
    await openFlightSettings(page); await page.locator('[data-aircraft="t6"]').tap();
    await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready');
    await page.locator('[data-action="airborne"]').tap();
    await expect(page.locator('[data-action="exit"]')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.av-stick-pad')).toBeVisible();
    const header = await page.locator('.av-header').boundingBox(), instruments = await page.locator('.av-instruments').boundingBox();
    expect(instruments!.y).toBeGreaterThan(header!.y + header!.height);
    await page.locator('[data-throttle="1"]').tap();
    await expect(page.locator('[data-value="throttle"]')).toHaveText('100%');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: test.info().outputPath('flight-phone.png') });
    await page.locator('[data-action="exit"]').tap();
    await expect(page.locator('#error')).toBeHidden();
  } finally { await context.close(); }
});

test('returns the shared canvas safely when WebGL is lost during flight', async ({ page }) => {
  await page.goto('/?seed=CLOUD-FLIGHT-CONTEXT');
  await openFlightSettings(page); await page.locator('[data-aircraft="su30"]').click();
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready');
  await page.locator('[data-action="airborne"]').click();
  const extension = await page.locator('#world').evaluateHandle(canvas => (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!);
  await extension.evaluate(ext => ext.loseContext());
  await expect(page.locator('#aviation')).toHaveCount(0); await expect(page.locator('#error')).toBeVisible();
  await page.waitForTimeout(200); await extension.evaluate(ext => ext.restoreContext());
  await expect(page.locator('#error')).toBeHidden(); await expect(page.locator('#app > #world')).toHaveCount(1);
  await openFlightSettings(page);
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready');
  await page.locator('[data-action="exit"]').click();
});
