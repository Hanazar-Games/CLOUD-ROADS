import { expect, test } from '@playwright/test';
import { closeSettings, control, ignite } from './settings';

test('keeps cockpit status keyboard accessible with direct equipment and seat navigation', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=FLEET-FLAT'); await closeSettings(page);
  await page.locator('#drive-toggle').click(); await ignite(page);
  const details = page.locator('#hud-cabin-details');
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#radio-reading')).toBeVisible();
  const position = await page.locator('[data-metric="Vehicle position"]').textContent();
  await page.keyboard.press('KeyW');
  await expect(page.locator('[data-metric="Vehicle position"]')).toHaveText(position!);
  await page.keyboard.press('Escape'); await expect(details).not.toHaveAttribute('open', '');
  await expect(page.locator('#world')).toBeFocused();
  await page.locator('#hud-seats').click(); await expect(page.locator('#seat-dialog')).toBeVisible();
  await page.locator('[data-seat="front"]').click();
  await expect(page.locator('#hud-mode')).toHaveText('PASSENGER');
  await page.locator('#hud-equipment').click(); await expect(page.locator('#settings-equipment')).toBeVisible();
  await closeSettings(page); await page.locator('#hud-vehicle-panel').click();
  await expect(page.locator('#panel-ignition')).toBeDisabled();
  const specification = page.locator('.panel-specification');
  await expect(specification).not.toHaveAttribute('open', ''); await specification.locator('summary').click();
  await expect(page.locator('#vehicle-panel-specs dd')).toHaveCount(9);
  await page.screenshot({ path: info.outputPath('vehicle-panel.png') });
  await page.keyboard.press('Escape'); await expect(page.locator('#world')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 450 });
  await expect(page.locator('#hud-vehicle-panel')).toBeInViewport();
  await expect(page.locator('#hud-seats')).toBeInViewport(); await expect(page.locator('#hud-equipment')).toBeInViewport();
  await details.locator('summary').click(); await expect(page.locator('#radio-reading')).toBeInViewport();
  await page.screenshot({ path: info.outputPath('compact-cockpit.png') });
  expect(errors).toEqual([]);
});

test('renders detailed cabins across cars, buses, camper, truck, motorcycle and crane', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?seed=FLEET-FLAT');
  await (await control(page, page.locator('#driving-view'))).selectOption('cockpit');
  await (await control(page, page.locator('#time-preset'))).selectOption('0');
  await closeSettings(page); await page.locator('#drive-toggle').click();
  for (const kind of ['sedan', 'doubleDecker', 'adventureCamper', 'truck8', 'touringMotorcycle', 'crane']) {
    await (await control(page, page.locator('#vehicle-kind'))).selectOption(kind); await closeSettings(page);
    await ignite(page); await page.keyboard.press('KeyH');
    await page.mouse.move(900, 430); await page.mouse.down(); await page.mouse.move(950, 510, { steps: 8 }); await page.mouse.up();
    await expect(page.locator('#drive-hud')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${kind}-cockpit.png`) });
  }
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('doubleDecker');
  await (await control(page, page.locator('#time-preset'))).selectOption('150'); await closeSettings(page);
  await page.keyboard.press('KeyU'); await page.keyboard.press('KeyK');
  await page.locator('#hud-seats').click(); await page.locator('[data-deck="2"]').click(); await page.locator('[data-seat="upper-row-6-3"]').click();
  await expect(page.locator('#hud-mode')).toHaveText('PASSENGER');
  await page.mouse.move(900, 430); await page.mouse.down(); await page.mouse.move(560, 410, { steps: 8 }); await page.mouse.up();
  await page.screenshot({ path: info.outputPath('upper-deck-night.png') });
  expect(errors).toEqual([]);
});
