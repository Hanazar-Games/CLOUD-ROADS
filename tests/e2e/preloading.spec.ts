import { expect, test } from '@playwright/test';
import { control } from './settings';

test('preloads the next view, continues streaming and rebuilds the preload after turning and teleporting', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  const ready = async () => {
    await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 30000 });
    await expect.poll(async () => Number(await metric('Prefetched chunks').textContent()), { timeout: 30000 }).toBeGreaterThan(0);
  };
  await page.goto('/?seed=CLOUD-ROAD-001'); await ready();
  await expect(metric('Active chunks')).toHaveText('289');
  const completed = Number(await metric('Generated chunks').textContent());
  await (await control(page, page.locator('#world'))).focus(); await page.keyboard.down('KeyW');
  await expect.poll(async () => Number((await metric('Coordinates').textContent())!.split(',')[2])).toBeLessThan(-400);
  await page.keyboard.up('KeyW'); await ready();
  expect(Number(await metric('Generated chunks').textContent())).toBeGreaterThan(completed);
  expect(Number(await metric('Prefetched chunks').textContent())).toBeLessThanOrEqual(128);
  await (await control(page, page.locator('#sun-view'))).click(); await ready();
  await (await control(page, page.locator('#service-view'))).click();
  await expect.poll(async () => Number((await metric('Coordinates').textContent())!.split(',')[2]), { timeout: 30000 }).toBeLessThan(-10000);
  await ready();
  await (await control(page, page.locator('#home'))).click();
  await expect(page.locator('#position')).toHaveText('128 / 128'); await ready();
  await expect(metric('Active chunks')).toHaveText('289');
  expect(errors).toEqual([]);
});
