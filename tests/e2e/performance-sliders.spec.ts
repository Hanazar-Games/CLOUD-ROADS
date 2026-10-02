import { expect, test } from '@playwright/test';
import { closeSettings, control } from './settings';

test('thins vegetation in place without resizing graphics or regenerating terrain', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width')!;
    Reflect.set(window, 'canvasResizes', 0);
    Object.defineProperty(HTMLCanvasElement.prototype, 'width', { ...descriptor, set(value) {
      if (this.id === 'world') Reflect.set(window, 'canvasResizes', Reflect.get(window, 'canvasResizes') + 1);
      descriptor.set!.call(this, value);
    } });
  });
  await page.goto('/?seed=CLOUD-ROAD-001');
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await (await control(page, page.locator('#tree-density'))).focus();
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 30000 });
  await expect(metric('Vegetation pending')).toHaveText('0');
  const full = Number(await metric('Vegetation instances').textContent()); expect(full).toBeGreaterThan(0);
  const chunks = await metric('Generated chunks').textContent(), coordinates = await metric('Coordinates').textContent();
  const resizes = await page.evaluate(() => Reflect.get(window, 'canvasResizes'));
  for (const id of ['tree-density', 'ground-density', 'flower-density', 'rock-density']) {
    await page.locator(`#${id}`).fill('0'); await expect(page.locator(`#${id}-value`)).toHaveText('0%');
  }
  await expect(metric('Vegetation pending')).toHaveText('0');
  await expect(metric('Vegetation instances')).toHaveText('0');
  await expect(metric('Generated chunks')).toHaveText(chunks!);
  await expect(metric('Coordinates')).toHaveText(coordinates!);
  expect(await page.evaluate(() => Reflect.get(window, 'canvasResizes'))).toBe(resizes);
  for (const id of ['tree-density', 'ground-density', 'flower-density', 'rock-density']) await page.locator(`#${id}`).fill('100');
  await expect(metric('Vegetation instances')).toHaveText(String(full));
  const slider = await control(page, page.locator('#render-scale'));
  await slider.evaluate(node => {
    for (const value of ['50', '60', '70', '75']) {
      (node as HTMLInputElement).value = value; node.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await expect(page.locator('#render-scale-value')).toHaveText('75%');
  await expect(metric('Render scale')).toHaveText('75%');
  expect(await page.evaluate(() => Reflect.get(window, 'canvasResizes'))).toBe(resizes + 2);
  expect(await page.locator('#world').evaluate(node => (node as HTMLCanvasElement).width)).toBe(1080);
  expect(errors).toEqual([]);
});

test('offers labeled performance sliders and keeps them usable on narrow screens', async ({ page }) => {
  await page.goto('/?seed=CLOUD-ROAD-001');
  await (await control(page, page.locator('#tree-density'))).fill('45');
  const section = page.locator('#settings-graphics');
  await expect(section.locator('input[type=range]')).toHaveCount(17);
  await expect(section.locator('select')).toHaveCount(1);
  for (const slider of await section.locator('input[type=range]').all()) {
    await expect(slider).toHaveAccessibleName(/\S/); await expect(slider).toHaveAttribute('aria-valuetext', /\S/);
  }
  await (await control(page, page.locator('#frame-limit'))).fill('7');
  await expect(page.locator('#frame-limit-value')).toHaveText('不限帧率');
  await expect(page.locator('#frame-limit-number')).toBeHidden();
  await page.locator('#frame-limit').focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#frame-limit-value')).toHaveText('240 FPS');
  await (await control(page, page.locator('#tree-density-number'))).fill('35');
  await page.locator('#tree-density-number').press('Enter');
  await expect(page.locator('#tree-density')).toHaveValue('35');
  await expect(page.locator('#tree-density-value')).toHaveText('35%');
  await page.setViewportSize({ width: 390, height: 844 });
  await (await control(page, page.locator('#tree-density'))).focus();
  expect(await page.locator('#settings-content').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: '/tmp/cloud-roads-performance-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await (await control(page, page.locator('[data-settings-target="graphics"]'))).click();
  await page.screenshot({ path: '/tmp/cloud-roads-performance-desktop.png' });
  await closeSettings(page);
  await (await control(page, page.locator('#terrain-kind'))).selectOption('forest');
  await (await control(page, page.locator('#world-options button[type=submit]'))).click();
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 30000 });
  await (await control(page, page.locator('#road-view'))).click();
  await page.screenshot({ path: '/tmp/cloud-roads-vegetation-scene.png' });
});
