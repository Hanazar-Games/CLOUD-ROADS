import { expect, test } from '@playwright/test';
import { control } from './settings';

test('changes viewing distance in place, streams repeated passes and preserves settings on world changes', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  const ready = async () => {
    await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
    await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 30000 });
  };
  await page.goto('/?seed=CLOUD-ROAD-001'); await ready();
  const home = await metric('Coordinates').textContent();
  await expect(metric('Mountain stage')).toHaveText('山谷');
  for (const radius of [6, 16, 8]) {
    await (await control(page, page.locator('#view-distance'))).selectOption(String(radius));
    await expect(metric('Target chunks')).toHaveText(String((radius * 2 + 1) ** 2));
    await ready();
    await expect(metric('Active chunks')).toHaveText(String((radius * 2 + 1) ** 2));
    await expect(metric('Coordinates')).toHaveText(home!);
    await expect(metric('Fog near / far')).toHaveText(`${Math.round(1000 * radius / 8)} / ${Math.round(1950 * radius / 8)} m`);
  }
  const visit = async () => {
    const before = await metric('Coordinates').textContent();
    await (await control(page, page.locator('#pass-view'))).click();
    await expect(metric('Coordinates')).not.toHaveText(before!, { timeout: 30000 });
    await ready();
    await expect(metric('Mountain stage')).toHaveText('垭口');
    await expect(metric('Mountain passes')).toHaveText('1');
    return Number((await metric('Coordinates').textContent())!.split(',')[2]);
  };
  const first = await visit(), second = await visit();
  expect(first - second).toBeGreaterThan(25000);
  await (await control(page, page.locator('#pass-view'))).click();
  await (await control(page, page.locator('#home'))).click(); await ready();
  await expect(metric('Coordinates')).toHaveText(home!);
  await (await control(page, page.locator('#view-distance'))).selectOption('6');
  await (await control(page, page.locator('#terrain-kind'))).selectOption('forest');
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '应用并返回起点' }))).click();
  await ready();
  await expect(page.locator('#pass-view')).toBeDisabled();
  await expect(page.locator('#view-distance')).toHaveValue('6');
  await expect(metric('Active chunks')).toHaveText('169');
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});
