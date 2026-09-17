import { expect, test } from '@playwright/test';

test('shows a streamed road spine, inspects it and preserves display settings across seeds', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes', { timeout: 20_000 });
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 20_000 });
  const highDetail = Number((await page.locator('[data-metric="LOD 0 / 1 / 2"]').textContent())!.split('/')[0]);
  expect(highDetail).toBeGreaterThan(25);
  const count = Number(await page.locator('[data-metric="Road segments"]').textContent());
  expect(count).toBeGreaterThan(20);
  expect(count).toBeLessThanOrEqual(256);
  const before = await page.locator('#altitude').textContent();
  await page.getByRole('button', { name: '道路视角' }).click();
  await expect(page.locator('#altitude')).not.toHaveText(before!);
  await expect(page.locator('[data-metric="Road grade"]')).toContainText('%');
  await page.getByRole('button', { name: '路线骨架' }).click();
  await expect(page.locator('#road-debug')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#seed').fill('ROAD-TEST-002');
  await page.getByRole('button', { name: '加载种子' }).click();
  await expect(page.locator('[data-metric="Seed"]')).toHaveText('ROAD-TEST-002');
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes');
  await expect(page.locator('#road-debug')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('extends the road during 30 km of northbound flight and replays it on return', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 20_000 });
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 20_000 });
  const initialBridges = await metric('Bridges').textContent();
  await page.locator('#speed').fill('1200');
  await page.mouse.move(900, 450);
  await page.mouse.down();
  await page.mouse.move(900, 325);
  await page.mouse.up();
  await page.keyboard.down('ControlLeft');
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number((await metric('Coordinates').textContent())?.split(',')[2]), { timeout: 40_000 }).toBeLessThan(-30_000);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ControlLeft');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 20_000 });
  expect(parseFloat((await metric('Road distance').textContent())!)).toBeGreaterThan(30);
  expect(Number(await metric('Road segments').textContent())).toBeLessThanOrEqual(256);
  expect(Number(await metric('Origin rebases').textContent())).toBeGreaterThanOrEqual(5);
  await page.getByRole('button', { name: '道路视角' }).click();
  await expect(page.locator('#notice')).not.toContainText('已暂停');
  await page.getByRole('button', { name: '返回起点' }).click();
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 20_000 });
  await expect(metric('Road distance')).toHaveText('0.00 km');
  await expect(metric('Bridges')).toHaveText(initialBridges!);
  expect(errors).toEqual([]);
});

test('inspects generated hairpins and continues streaming the coupled terrain', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  const button = page.getByRole('button', { name: '发卡弯视角' });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  expect(Number(await page.locator('[data-metric="Hairpins"]').textContent())).toBeGreaterThanOrEqual(2);
  const before = await page.locator('#position').textContent();
  await button.click();
  await expect(page.locator('#position')).not.toHaveText(before!);
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 20_000 });
  await expect(page.locator('[data-metric="Active chunks"]')).toHaveText('289');
  await expect(page.locator('#phase-label')).toHaveText('/ 06');
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('renders viaducts, inspects a bridge and rebuilds the same bridges after changing seeds', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/');
  const button = page.getByRole('button', { name: '桥梁视角' });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 20_000 });
  const bridges = await metric('Bridges').textContent(), piers = await metric('Bridge piers').textContent();
  expect(Number(bridges)).toBeGreaterThan(0);
  expect(Number(piers)).toBeGreaterThan(Number(bridges) * 2);
  const position = await page.locator('#position').textContent();
  await button.click();
  await expect(page.locator('#position')).not.toHaveText(position!);
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 20_000 });
  for (const seed of ['ROAD-TEST-002', 'CLOUD-ROAD-001']) {
    await page.locator('#seed').fill(seed);
    await page.getByRole('button', { name: '加载种子' }).click();
    await expect(metric('Seed')).toHaveText(seed);
    await expect(metric('Road ready')).toHaveText('yes', { timeout: 20_000 });
  }
  await expect(metric('Bridges')).toHaveText(bridges!);
  await expect(metric('Bridge piers')).toHaveText(piers!);
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});
