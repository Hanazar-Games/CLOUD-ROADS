import { expect, test } from '@playwright/test';
import { closeSettings, control, openSettings } from './settings';

test('opens categorized modal settings, freezes driving and restores fresh keyboard control', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT');
  await page.locator('#drive-toggle').click();
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(5);
  await page.locator('#controls-toggle').click();
  const dialog = page.getByRole('dialog', { name: '旅程设置' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('navigation', { name: '设置分类' }).getByRole('button')).toHaveCount(7);
  const position = page.locator('[data-metric="Vehicle position"]');
  await page.waitForTimeout(250); const parked = await position.textContent();
  await page.keyboard.press('KeyF'); await page.waitForTimeout(300);
  await expect(position).toHaveText(parked!);
  await expect(page.locator('[data-metric="Travel mode"]')).toHaveText('driving');
  await page.keyboard.up('KeyW'); await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible(); await expect(page.locator('#world')).toBeFocused();
});

test('animates windows, roof and washer water, and preserves pause through settings', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT'); await page.locator('#drive-toggle').click();
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.keyboard.press('KeyT'); await page.keyboard.press('KeyJ'); await page.keyboard.press('KeyG');
  await expect(metric('Roof opening')).toHaveText('0.00', { timeout: 15000 });
  await expect(metric('Window opening')).toHaveText('1.00');
  await expect.poll(async () => Number(await metric('Washer fluid').textContent())).toBeLessThan(3);
  await (await control(page, page.locator('#vehicle-windows'))).fill('0');
  await (await control(page, page.locator('#cabin-light'))).click();
  await (await control(page, page.locator('#cabin-fan'))).selectOption('3');
  await closeSettings(page);
  await expect(metric('Cabin exposure')).toHaveText('0.00');
  await page.keyboard.press('KeyP'); await openSettings(page); await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('KeyP'); await page.keyboard.press('KeyG');
  await expect.poll(async () => parseFloat((await metric('Glass water').textContent())!)).toBeGreaterThan(0);
  await page.keyboard.press('KeyF');
  await (await control(page, page.locator('#washer-refill'))).click();
  await expect(metric('Washer fluid')).toHaveText('3.00');
});

test('disables unsupported equipment and retains gear selection after switching vehicles', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT');
  await (await control(page, page.locator('#transmission-mode'))).selectOption('manual');
  for (const kind of ['truck5', 'coach', 'sedan', 'motorcycle', 'roadster']) {
    await (await control(page, page.locator('#vehicle-kind'))).selectOption(kind);
    await (await control(page, page.locator('#vehicle-roof'))).scrollIntoViewIfNeeded();
    if (kind === 'roadster') await expect(page.locator('#vehicle-roof')).toBeEnabled();
    else await expect(page.locator('#vehicle-roof')).toBeDisabled();
    for (const id of ['washer', 'vehicle-windows', 'cabin-fan', 'cabin-light']) {
      if (kind === 'motorcycle') await expect(page.locator(`#${id}`)).toBeDisabled();
      else await expect(page.locator(`#${id}`)).toBeEnabled();
    }
    await expect(page.locator('#transmission-mode')).toHaveValue('manual');
  }
});

test('shifts automatically, allows manual shifts and blocks roof motion at speed', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT');
  await (await control(page, page.locator('#terrain-kind'))).selectOption('meadow');
  await (await control(page, page.locator('#route-style'))).selectOption('0');
  await (await control(page, page.locator('#max-grade'))).fill('0');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  await page.locator('#drive-toggle').click(); await page.keyboard.down('KeyW');
  await expect(page.locator('[data-metric="Transmission"]')).toHaveText('auto / 2', { timeout: 20000 });
  await page.keyboard.up('KeyW'); await page.keyboard.press('BracketRight');
  await expect(page.locator('[data-metric="Transmission"]')).toHaveText(/manual \/ [23]/);
  await openSettings(page); await page.locator('[data-settings-target="equipment"]').click();
  await expect(page.locator('#vehicle-roof')).toBeDisabled(); await expect(page.locator('#washer-refill')).toBeDisabled();
  await closeSettings(page); await page.keyboard.press('KeyR');
  await expect(page.locator('#vehicle-gear')).toHaveText('P');
});

test('keeps every settings category usable in a short narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 450 }); await page.goto('/?seed=FLEET-FLAT');
  await openSettings(page);
  for (const [category, id] of [['driving', 'transmission-mode'], ['equipment', 'cabin-fan'], ['world', 'road-width'], ['weather', 'daylight'], ['graphics', 'view-distance'], ['audio', 'preview-horn'], ['explore', 'cloud-toggle']]) {
    await page.locator(`[data-settings-target="${category}"]`).click();
    const heading = await page.locator(`#settings-${category} h3`).boundingBox();
    const content = await page.locator('#settings-content').boundingBox();
    expect(heading!.y - content!.y).toBeGreaterThanOrEqual(0);
    expect(heading!.y - content!.y).toBeLessThanOrEqual(24);
    await page.locator(`#${id}`).scrollIntoViewIfNeeded(); await expect(page.locator(`#${id}`)).toBeInViewport();
    await expect(page.locator('#settings-close')).toBeInViewport();
  }
  await page.keyboard.press('Escape'); await expect(page.locator('#world')).toBeFocused();
});

test('previews layered audio and suspends when the master is muted', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=FLEET-FLAT'); await openSettings(page);
  await page.locator('[data-settings-target="audio"]').click();
  await expect(page.locator('#audio-channels input')).toHaveCount(9);
  await page.locator('#audio-toggle').click();
  const state = page.locator('[data-metric="Audio state"]'); await expect(state).toHaveText('running');
  for (const style of ['night', 'motion', 'ambient']) await page.locator('#music-style').selectOption(style);
  for (const id of ['engine', 'shift', 'horn']) { await page.locator(`#preview-${id}`).click(); await expect(page.locator('#audio-preview-status')).toContainText('正在试听'); }
  await page.locator('#master-volume').fill('0'); await expect(state).toHaveText('suspended');
  await page.locator('#master-volume').fill('80'); await expect(state).toHaveText('running');
  expect(errors).toEqual([]);
});
