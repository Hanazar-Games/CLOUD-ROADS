import { expect, test } from '@playwright/test';
import { closeSettings, control, ignite } from './settings';

test('drinks a bottle, pauses safely, prevents driving during the action and refills', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=FLEET-FLAT');
  await (await control(page, page.locator('#graphics-preset'))).selectOption('economy');
  await closeSettings(page); await page.locator('#drive-toggle').click(); await ignite(page); await page.keyboard.press('KeyC');
  await expect(page.locator('[data-metric="Driving camera"]')).toHaveText('cockpit');
  await page.screenshot({ path: info.outputPath('console-buttons.png') });
  await expect(page.locator('#vehicle-fridge')).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.click(1105, 772);
  await expect(page.locator('#vehicle-fridge')).toHaveAttribute('aria-pressed', 'true');
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.keyboard.press('Shift+KeyK');
  await expect(metric('Drinking water')).toHaveText('drinking'); await expect(metric('Water bottles')).toHaveText('5');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(450); await page.keyboard.up('KeyW');
  await expect(page.locator('#vehicle-speed')).toHaveText('0');
  await page.waitForTimeout(1100);
  await page.keyboard.press('Slash'); await page.waitForTimeout(1000);
  await expect(metric('Water consumed')).toHaveText('0'); await expect(metric('Drinking water')).toHaveText('drinking');
  await page.screenshot({ path: info.outputPath('taking-water.png') });
  await page.keyboard.press('Slash');
  await expect(metric('Water consumed')).toHaveText('500'); await expect(metric('Drinking water')).toHaveText('idle');
  await page.keyboard.press('Shift+KeyX'); await expect(metric('Water bottles')).toHaveText('6');
  await page.keyboard.press('Shift+KeyK'); await expect(metric('Drinking water')).toHaveText('drinking');
  await page.keyboard.press('KeyP'); await page.locator('[data-seat="front"]').click();
  await expect(metric('Drinking water')).toHaveText('idle'); await expect(metric('Water bottles')).toHaveText('6');
  await page.keyboard.press('Shift+KeyK'); await expect(metric('Drinking water')).toHaveText('drinking');
  await expect(metric('Water consumed')).toHaveText('1000');
  expect(errors).toEqual([]);
});

test('renders transitioning cloud banks and precipitation without shader errors', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=CLOUD-BANKS');
  await page.locator('#drive-toggle').click(); await page.keyboard.press('KeyC');
  for (const kind of ['storm', 'denseFog', 'clear']) {
    await (await control(page, page.locator(`#weather-${kind}`))).check();
    await closeSettings(page); await page.waitForTimeout(1200);
    await expect(page.locator('#vehicle-speed')).toHaveText('0');
  }
  await page.screenshot({ path: info.outputPath('clear-clouds.png') });
  expect(errors).toEqual([]);
});
