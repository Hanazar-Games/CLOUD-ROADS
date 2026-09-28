import { expect, test, type Page } from '@playwright/test';
import { ignite, control } from './settings';

const metric = (page: Page, name: string) => page.locator(`[data-metric="${name}"]`);
const position = async (page: Page) => (await metric(page, 'Walking position').textContent())!.split(',').map(Number);
async function move(page: Page, key: string, axis: number, amount: number) {
  await expect(metric(page, 'Travel mode')).toHaveText('walking');
  await expect(metric(page, 'Walking speed')).toHaveText('0.0 km/h');
  const start = await position(page);
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down(key);
  await expect.poll(async () => Math.abs((await position(page))[axis] - start[axis]), { timeout: 8000, intervals: [80] }).toBeGreaterThan(amount);
  await page.keyboard.up(key); await page.keyboard.up('ShiftLeft');
  await expect(metric(page, 'Walking speed')).toHaveText('0.0 km/h');
}

async function walkTo(page: Page, key: string, axis: number, target: number) {
  await expect(metric(page, 'Travel mode')).toHaveText('walking');
  await expect(metric(page, 'Walking speed')).toHaveText('0.0 km/h');
  const direction = Math.sign(target - (await position(page))[axis]);
  await page.keyboard.down(key);
  await expect.poll(async () => direction * ((await position(page))[axis] - target), { timeout: 8000, intervals: [40] }).toBeGreaterThan(-0.6);
  await page.keyboard.up(key);
  await expect(metric(page, 'Walking speed')).toHaveText('0.0 km/h');
  const opposite: Record<string, string> = { KeyW: 'KeyS', KeyS: 'KeyW', KeyA: 'KeyD', KeyD: 'KeyA' };
  for (let attempt = 0; attempt < 6; attempt++) {
    const remaining = target - (await position(page))[axis];
    if (Math.abs(remaining) < 0.4) break;
    const correction = Math.sign(remaining) === direction ? key : opposite[key];
    await page.keyboard.down(correction);
    await page.waitForTimeout(Math.min(150, Math.abs(remaining) * 160));
    await page.keyboard.up(correction);
    await expect(metric(page, 'Walking speed')).toHaveText('0.0 km/h');
  }
  expect(Math.abs((await position(page))[axis] - target)).toBeLessThan(0.4);
}

test('walks through classified parking, drives parked vehicles and leaves the previous car available', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?seed=SERVICE-FLEET');
  await (await control(page, page.locator('#terrain-kind'))).selectOption('meadow');
  await (await control(page, page.locator('#route-style'))).selectOption('0');
  await (await control(page, page.locator('#max-grade'))).fill('0');
  await page.getByRole('button', { name: '应用并返回起点', exact: true }).click();
  await expect(metric(page, 'Road ready')).toHaveText('yes');
  await (await control(page, page.locator('#service-view'))).click();
  await expect.poll(async () => Number(await metric(page, 'Service vehicles').textContent()), { timeout: 30000 }).toBeGreaterThan(25);
  await expect(metric(page, 'Pending / queued')).toHaveText('0 / 0', { timeout: 30000 });
  expect(Number(await metric(page, 'Parking batches').textContent())).toBeLessThanOrEqual(41);
  const count = Number(await metric(page, 'Service vehicles').textContent());
  await page.locator('#walk-toggle').click(); await move(page, 'KeyD', 0, 17); await move(page, 'KeyW', 2, 9);
  await expect(page.locator('#boarding-help')).toBeVisible(); await page.keyboard.press('KeyF');
  await expect(metric(page, 'Travel mode')).toHaveText('driving'); await expect(metric(page, 'Service vehicles')).toHaveText(String(count - 1));
  const first = await metric(page, 'Vehicle model').textContent();
  const paint = await page.locator('#vehicle-paint').inputValue();
  expect(paint).toMatch(/^[0-9a-f]{6}$/);
  const firstPosition = await metric(page, 'Vehicle position').textContent();
  const [carX, , carZ] = firstPosition!.split(',').map(Number);
  await page.keyboard.press('KeyF'); await expect(metric(page, 'Travel mode')).toHaveText('walking');
  const firstDoor = await position(page);
  // Use the aisle in front of the cars instead of walking through a neighbouring body.
  await walkTo(page, 'KeyW', 0, carX + 4.5); await walkTo(page, 'KeyA', 2, carZ - 6); await walkTo(page, 'KeyS', 0, carX);
  await expect(page.locator('#boarding-help')).toBeVisible(); await page.keyboard.press('KeyF');
  await expect(metric(page, 'Travel mode')).toHaveText('driving'); await expect(metric(page, 'Vehicle model')).not.toHaveText(first!);
  await expect(metric(page, 'Service vehicles')).toHaveText(String(count - 1));
  await page.keyboard.press('KeyF');
  await walkTo(page, 'KeyW', 0, carX + 4.5); await walkTo(page, 'KeyD', 2, firstDoor[2]); await walkTo(page, 'KeyS', 0, firstDoor[0]);
  await expect(page.locator('#boarding-help')).toBeVisible(); await page.keyboard.press('KeyF');
  await expect(metric(page, 'Vehicle model')).toHaveText(first!); await expect(metric(page, 'Vehicle position')).toHaveText(firstPosition!);
  await expect(page.locator('#vehicle-paint')).toHaveValue(paint);
  await expect(metric(page, 'Travel mode')).toHaveText('driving'); await ignite(page);
  await page.keyboard.down('KeyW'); await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(3); await page.keyboard.up('KeyW');
  expect(errors).toEqual([]);
});
