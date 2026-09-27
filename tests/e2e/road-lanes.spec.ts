import { expect, test, type Page } from '@playwright/test';
import { control, closeSettings, ignite } from './settings';
import { readFile } from 'node:fs/promises';

const metric = (page: Page, name: string) => page.locator(`[data-metric="${name}"]`);
const apply = async (page: Page) => {
  await page.locator('#world-options button[type="submit"]').click();
  await expect(page.locator('#explorer')).toBeHidden();
  await expect(metric(page, 'Road ready')).toHaveText('yes', { timeout: 30000 });
};

test('drives custom avenues and highways with safe width validation and live traffic rendering', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?seed=LANE-41');
  await (await control(page, page.locator('#road-type'))).selectOption('avenue');
  await page.locator('#road-lanes').selectOption('4');
  await expect(page.locator('#road-width')).toHaveValue('10');
  await page.locator('#road-width').fill('5');
  await page.locator('#world-options button[type="submit"]').click();
  await expect(page.locator('#explorer')).toBeVisible();
  await page.locator('#road-width').fill('11.5'); await apply(page);
  await expect(metric(page, 'Road layout')).toHaveText('双向四车道');
  await expect(metric(page, 'Carriageway width')).toHaveText('11.5 m');
  await page.locator('#drive-toggle').click(); await ignite(page);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(10);
  await page.keyboard.up('KeyW');
  await (await control(page, page.locator('#road-type'))).selectOption('highway');
  await page.locator('#road-lanes').selectOption('3'); await page.locator('#road-width').fill('12'); await apply(page);
  await expect(metric(page, 'Road layout')).toHaveText('双向六车道');
  await (await control(page, page.locator('#road-one-way'))).check();
  await page.locator('#road-lanes').selectOption('1'); await page.locator('#road-width').fill('5'); await apply(page);
  await expect(metric(page, 'Road layout')).toHaveText('单向一车道');
  await expect(metric(page, 'Carriageway width')).toHaveText('5 m');
  await page.locator('#drive-toggle').click(); await ignite(page);
  await expect.poll(async () => Number(await metric(page, 'NPC vehicles').textContent()), { timeout: 30000 }).toBeGreaterThan(2);
  await page.screenshot(); expect(errors).toEqual([]);
});

test('exports, reloads and applies custom lane layouts without runtime traffic state', async ({ page }) => {
  await page.goto('/?seed=LANE-PRESET');
  await (await control(page, page.locator('#road-type'))).selectOption('highway');
  await page.locator('#road-one-way').check(); await page.locator('#road-lanes').selectOption('3');
  await expect(page.locator('#road-width')).toHaveValue('9'); await page.locator('#road-width').fill('10.5');
  await (await control(page, page.locator('#preset-name'))).fill('单向三车道'); await page.locator('#preset-save').click();
  const waiting = page.waitForEvent('download'); await page.locator('#preset-export').click();
  const data = JSON.parse(await readFile((await (await waiting).path())!, 'utf8'));
  expect(data.world).toMatchObject({ oneWay: true, roadLanes: 3, roadWidth: 10.5 });
  expect(data.traffic).toBeUndefined();
  await page.reload();
  await (await control(page, page.locator('#preset-apply'))).click();
  await expect(metric(page, 'Road layout')).toHaveText('单向三车道');
  await (await control(page, page.locator('#road-lanes'))).scrollIntoViewIfNeeded();
  await expect(page.locator('#road-lanes')).toHaveValue('3');
  await expect(page.locator('#road-one-way')).toBeChecked();
  await expect(page.locator('#road-width')).toHaveValue('10.5'); await closeSettings(page);
});
