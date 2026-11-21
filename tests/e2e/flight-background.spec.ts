import { expect, test } from '@playwright/test';

test('can cancel initial boarding while the cockpit graphics prepare', async ({ page }) => {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('.av-load-status')?.getAttribute('data-stage') !== 'graphics') return;
      const button = document.querySelector<HTMLButtonElement>('[data-action="cancel-departure"]')!;
      Reflect.set(window, 'graphicsCancelVisible', button.checkVisibility()); observer.disconnect();
      if (button.checkVisibility()) button.click();
    });
    observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-stage'] });
  });
  await page.goto('/?seed=CLOUD-GRAPHICS-CANCEL');
  await page.locator('#aircraft-toggle').click();
  await page.locator('#airport-board').click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'graphicsCancelVisible'))).toBe(true);
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready', { timeout: 20000 });
  await expect(page.locator('.av-panel')).toBeVisible();
  await expect(page.locator('#av-panel-title')).toBeFocused();
  await expect(page.locator('[data-action="cancel-departure"]')).toBeHidden();
  await page.locator('[data-action="apron"]').click();
  await expect(page.locator('.av-panel')).toBeHidden();
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('#airport-board')).toBeEnabled();
});

for (const event of ['visibility', 'focus']) test(`backgrounding during module loading cancels boarding (${event})`, async ({ page }) => {
  await page.route(/\/(?:assets\/AviationSession-[^/]+\.js|src\/aviation\/AviationSession\.ts)(?:\?.*)?$/, async route => {
    await page.evaluate(event => {
      if (event === 'visibility') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      } else {
        Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false });
        window.dispatchEvent(new Event('blur'));
      }
      Reflect.set(window, 'backgroundedDuringModuleLoad', true);
    }, event);
    await route.continue();
  });
  await page.goto(`/?seed=CLOUD-MODULE-${event}`);
  await page.locator('#aircraft-toggle').click();
  await page.locator('#airport-board').click();
  await expect(page.locator('#aviation')).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'backgroundedDuringModuleLoad'))).toBe(true);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden'); Reflect.deleteProperty(document, 'hasFocus');
    document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready', { timeout: 20000 });
  await expect(page.locator('.av-panel')).toBeVisible();
  await expect(page.locator('[data-action="cancel-departure"]')).toBeHidden();
  await page.locator('[data-action="apron"]').click();
  await expect(page.locator('.av-panel')).toBeHidden();
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('#airport-board')).toBeEnabled();
});
