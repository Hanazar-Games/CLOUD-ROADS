import { expect, test } from '@playwright/test';
import { control } from './settings';

test('visits highway services 10–20 km apart and cancels search when returning home', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  const ready = async () => {
    await expect(metric('Road ready')).toHaveText('yes', { timeout: 30_000 });
    await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 30_000 });
  };
  await page.goto('/?seed=CLOUD-ROAD-001');
  await (await control(page, page.locator('#terrain-kind'))).selectOption('forest');
  await (await control(page, page.locator('#road-type'))).selectOption('highway');
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '应用并返回起点' }))).click();
  await ready();
  const home = await metric('Coordinates').textContent();
  const visit = async () => {
    const before = await metric('Coordinates').textContent();
    await (await control(page, page.locator('#service-view'))).click();
    await expect(metric('Coordinates')).not.toHaveText(before!, { timeout: 30_000 });
    await ready();
    await expect(metric('Service areas')).toHaveText('1');
    await expect(page.locator('#error')).toBeHidden();
    return parseFloat((await metric('Service mileage').textContent())!);
  };
  const first = await visit(), firstPosition = await metric('Coordinates').textContent();
  const second = await visit();
  expect(second - first).toBeGreaterThanOrEqual(10);
  expect(second - first).toBeLessThanOrEqual(20);
  await (await control(page, page.locator('#service-view'))).click();
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '返回起点', exact: true }))).click();
  await expect(metric('Coordinates')).toHaveText(home!);
  await ready();
  await expect(page.locator('#service-view')).toHaveText('下一服务区');
  expect(await visit()).toBe(first);
  await expect(metric('Coordinates')).toHaveText(firstPosition!);
  await (await control(page, page.locator('#time-preset'))).selectOption('150');
  await expect(metric('Light phase')).toHaveText('夜晚');
  await (await control(page, page.locator('#pause'))).click();
  const paused = await metric('Coordinates').textContent();
  await page.waitForTimeout(400);
  await expect(metric('Coordinates')).toHaveText(paused!);
  expect(errors).toEqual([]);
});
