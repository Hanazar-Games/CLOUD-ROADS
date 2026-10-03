import { expect, test, type Page } from '@playwright/test';
import { ignite, control, closeSettings } from './settings';

const metric = (page: Page, name: string) => page.locator(`[data-metric="${name}"]`);
const choose = async (page: Page, kind: string) => {
  await (await control(page, page.locator('#vehicle-kind'))).selectOption(kind); await closeSettings(page);
};

test('uses exact bus row counts and selects both double-decker floors without granting passenger controls', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT');
  for (const [kind, count] of [['minibus', 33], ['coach', 53], ['coach15', 65], ['citybus', 41]] as const) {
    await choose(page, kind);
    if (!await page.locator('#drive-hud').isVisible()) await page.locator('#drive-toggle').click(); await ignite(page);
    await page.keyboard.press('KeyP'); await expect(page.locator('#seat-map button')).toHaveCount(count);
    await page.keyboard.press('Escape');
  }
  await choose(page, 'doubleDecker'); await page.keyboard.press('KeyP');
  await expect(page.locator('#seat-map button')).toHaveCount(49);
  await page.locator('[data-deck="2"]').click(); await expect(page.locator('#seat-map button')).toHaveCount(48);
  await page.locator('[data-seat="upper-row-12-3"]').click(); await expect(metric(page, 'Cabin floor')).toHaveText('2');
  const position = (await metric(page, 'Vehicle position').textContent())!.split(',').map(Number);
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyJ'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
  const after = (await metric(page, 'Vehicle position').textContent())!.split(',').map(Number);
  expect([after[0], after[2]]).toEqual([position[0], position[2]]);
  expect(Math.abs(after[1] - position[1])).toBeLessThan(0.15);
  await expect(metric(page, 'Vehicle speed')).toHaveText('0.0 km/h');
  await expect(metric(page, 'Vehicle operations')).toHaveText('0.00 / 0.00 / 0.00');
  await page.setViewportSize({ width: 390, height: 450 }); await page.keyboard.press('KeyP');
  await expect(page.locator('[data-deck="1"]')).toBeInViewport(); await page.locator('[data-deck="1"]').click();
  await page.locator('[data-seat="driver"]').click(); await expect(metric(page, 'Cabin floor')).toHaveText('1');
  await expect(page.locator('#world')).toBeFocused();
});

test('animates doors and luggage, blocks departure until shut, and freezes fittings in menus', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT'); await choose(page, 'coach'); await page.locator('#drive-toggle').click(); await ignite(page);
  await page.keyboard.press('KeyJ'); await expect(metric(page, 'Vehicle operations')).toHaveText('1.00 / 0.00 / 0.00');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW'); await expect(page.locator('#vehicle-speed')).toHaveText('0');
  await page.keyboard.press('KeyY'); await page.keyboard.press('Shift+KeyR');
  await expect(page.locator('#vehicle-status')).toHaveText('已暂停');
  await page.waitForTimeout(200); // Let throttled telemetry catch up with the last pre-dialog frame.
  const frozen = await metric(page, 'Vehicle operations').textContent(); await page.waitForTimeout(400);
  await expect(metric(page, 'Vehicle operations')).toHaveText(frozen!); await page.keyboard.press('Escape');
  await expect(metric(page, 'Vehicle operations')).toHaveText('1.00 / 1.00 / 0.00');
  await page.keyboard.press('KeyJ'); await page.keyboard.press('KeyY');
  await expect(metric(page, 'Vehicle operations')).toHaveText('0.00 / 0.00 / 0.00');
  await page.keyboard.down('KeyW'); await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(3); await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyJ'); await expect(metric(page, 'Vehicle operations')).toHaveText('0.00 / 0.00 / 0.00');
});

test('provides supercar factory speed, wing and stake-trailer gates from the vehicle panel', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?seed=FLEET-FLAT'); await choose(page, 'supercar'); await page.locator('#drive-toggle').click(); await ignite(page);
  await expect(metric(page, 'Vehicle speed limit')).toHaveText('350.0 km/h');
  await page.locator('#hud-vehicle-panel').click(); await page.locator('#panel-aux').click();
  await expect(page.locator('#panel-aux')).toHaveAttribute('aria-pressed', 'true'); await page.keyboard.press('Escape');
  await expect(metric(page, 'Vehicle operations')).toHaveText('0.00 / 0.00 / 1.00');
  await page.keyboard.down('KeyW'); await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(5); await page.keyboard.up('KeyW');
  await choose(page, 'stake18'); await page.locator('#hud-vehicle-panel').click(); await page.locator('#panel-cargo').click(); await page.keyboard.press('Escape');
  await expect(metric(page, 'Vehicle operations')).toHaveText('0.00 / 1.00 / 0.00');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(300); await page.keyboard.up('KeyW'); await expect(page.locator('#vehicle-speed')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('interlocks the pickup tailgate and dump bed and operates emergency beacons', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT');
  for (const kind of ['pickup', 'dumptruck']) {
    await choose(page, kind);
    if (!await page.locator('#drive-hud').isVisible()) await page.locator('#drive-toggle').click(); await ignite(page);
    await page.keyboard.press('KeyY'); await expect(metric(page, 'Vehicle operations')).toHaveText('0.00 / 1.00 / 0.00');
    await page.keyboard.down('KeyW'); await page.waitForTimeout(350); await page.keyboard.up('KeyW');
    await expect(page.locator('#vehicle-speed')).toHaveText('0');
    await page.keyboard.press('KeyY'); await expect(metric(page, 'Vehicle operations')).toHaveText('0.00 / 0.00 / 0.00');
    await page.keyboard.down('KeyW'); await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(3); await page.keyboard.up('KeyW');
  }
  for (const kind of ['ambulance', 'firetruck']) {
    await choose(page, kind); await page.keyboard.press('KeyI');
    await expect(metric(page, 'Vehicle operations')).toHaveText('0.00 / 0.00 / 1.00');
    await page.keyboard.press('KeyI'); await expect(metric(page, 'Vehicle operations')).toHaveText('0.00 / 0.00 / 0.00');
  }
});
