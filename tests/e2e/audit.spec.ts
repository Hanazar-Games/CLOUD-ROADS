import { expect, test } from '@playwright/test';
import { BiomeSystem } from '../../src/biome/BiomeSystem';
import { HeightFunction } from '../../src/terrain/HeightFunction';

test('stops held movement when focus leaves the canvas and consumes flight shortcuts', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#fps')).not.toHaveText('—');
  await page.locator('#world').focus();
  await page.keyboard.down('KeyW');
  await page.locator('#seed').click();
  await page.waitForTimeout(350);
  const position = await page.locator('#position').textContent();
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyW');
  await expect(page.locator('#position')).toHaveText(position!);
  const handled = await page.locator('#world').evaluate((canvas) => {
    (canvas as HTMLElement).focus();
    return !canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'KeyD', ctrlKey: true }));
  });
  expect(handled).toBe(true);
  await page.keyboard.up('KeyD');
});

test('keeps ground readings aligned with the displayed coordinates during fast flight', async ({ page }) => {
  const terrain = new HeightFunction('CLOUD-ROAD-001'), biomes = new BiomeSystem('CLOUD-ROAD-001');
  await page.goto('/');
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes', { timeout: 20_000 });
  await page.locator('#speed').fill('1200');
  await page.locator('#world').focus();
  await page.keyboard.down('ControlLeft');
  await page.keyboard.down('KeyD');
  await expect.poll(async () => Number((await page.locator('[data-metric="Coordinates"]').textContent())!.split(',')[0])).toBeGreaterThan(8000);
  try {
    for (let i = 0; i < 8; i++) {
      const metrics = await page.locator('[data-metric]').evaluateAll((nodes) => Object.fromEntries(nodes.map((node) => [(node as HTMLElement).dataset.metric, node.textContent!])));
      const [x, , z] = metrics.Coordinates.split(',').map(Number);
      const ground = terrain.sample(x, z);
      const normalY = 4 / Math.hypot(terrain.sample(x - 2, z) - terrain.sample(x + 2, z), 4, terrain.sample(x, z - 2) - terrain.sample(x, z + 2));
      expect(Math.abs(parseFloat(metrics['Ground altitude']) - ground)).toBeLessThan(2);
      expect(Math.abs(parseFloat(metrics['Snow line']) - biomes.sample(x, z, ground, normalY).snowLine)).toBeLessThan(2);
      await page.waitForTimeout(270);
    }
  } finally { await page.keyboard.up('KeyD'); await page.keyboard.up('ControlLeft'); }
});

test('keeps all controls reachable in a short desktop window', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 450 });
  await page.goto('/');
  await page.locator('#terrain-kind').selectOption('forest');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  for (const id of ['sun-view', 'shadows', 'bridge-view', 'cloud-view', 'cloud-toggle', 'pause']) {
    const button = page.locator(`#${id}`);
    await expect(button).toBeEnabled({ timeout: 20_000 });
    await button.scrollIntoViewIfNeeded();
    const bounds = await button.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThan(450);
    await button.click({ timeout: 3000 });
  }
});

test('recovers from a failed terrain worker without reloading the page', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let fail = true;
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
        if (fail) { fail = false; throw new Error('Injected worker failure'); }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('#error')).toContainText('Injected worker failure');
  await page.getByRole('button', { name: '重试当前世界' }).click();
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes', { timeout: 20_000 });
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 20_000 });
});

test('restores rendering after context loss and clears held flight keys', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes', { timeout: 20_000 });
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 20_000 });
  await page.locator('#world').focus();
  await page.keyboard.down('KeyW');
  await page.locator('#world').evaluate((canvas) => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 1000);
  });
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#explorer')).toHaveAttribute('inert', '');
  await expect(page.locator('#controls-toggle')).toBeDisabled();
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#explorer')).not.toHaveAttribute('inert', '');
  await page.waitForTimeout(350);
  const position = await page.locator('#position').textContent();
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyW');
  await expect(page.locator('#position')).toHaveText(position!);
  await expect(page.locator('[data-metric="Draw calls"]')).not.toHaveText('0');
});

test('shows the current release, archives the previous baseline and isolates dialog controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#fps')).not.toHaveText('—');
  await page.getByRole('button', { name: '版本公告' }).click();
  const dialog = page.getByRole('dialog', { name: '版本公告' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-release="current"]')).toContainText('0.1.19');
  await expect(dialog.locator('[data-release="current"]')).toContainText('雨行秋野 · 车灯雨刮与悬挂调校');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.18');
  await expect(dialog.locator('[data-release="history"]')).toContainText('百变旅途 · 载具车队与雨雾');
  await dialog.getByText('历史公告', { exact: true }).click();
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.0');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.1');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.2');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.3');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.4');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.5');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.6');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.7');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.8');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.9');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.10');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.11');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.12');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.13');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.14');
  await expect(dialog.locator('[data-release="history"]')).toContainText('0.1.15');
  const position = await page.locator('#position').textContent();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyW');
  await expect(page.locator('#position')).toHaveText(position!);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: '版本公告' })).toBeFocused();
});

test('retains release access and a reload action when WebGL cannot start', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null }));
  await page.goto('/');
  await expect(page.locator('#error')).toContainText('无法启动 3D 世界');
  await expect(page.locator('#explorer')).toHaveAttribute('inert', '');
  await expect(page.locator('#controls-toggle')).toBeDisabled();
  await expect(page.getByRole('button', { name: '重新加载页面' })).toBeVisible();
  await page.getByRole('button', { name: '版本公告' }).click();
  await expect(page.getByRole('dialog', { name: '版本公告' })).toBeVisible();
});

test('releases workers through repeated seed changes and keeps display preferences', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeWorker = window.Worker, live = new Set<Worker>();
    Object.defineProperty(window, 'activeTerrainWorkers', { get: () => live.size });
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); live.add(this); }
      terminate() { live.delete(this); super.terminate(); }
    };
  });
  await page.goto('/');
  await expect(page.locator('#fps')).not.toHaveText('—');
  const workerCount = await page.evaluate(() => Reflect.get(window, 'activeTerrainWorkers'));
  await page.locator('#wireframe').click();
  await page.locator('#road-debug').click();
  for (let i = 0; i < 10; i++) {
    await page.locator('#seed').fill(`AUDIT-${i}`);
    await page.getByRole('button', { name: '加载种子' }).click();
    await expect(page.locator('[data-metric="Seed"]')).toHaveText(`AUDIT-${i}`);
    expect(await page.evaluate(() => Reflect.get(window, 'activeTerrainWorkers'))).toBe(workerCount);
  }
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes', { timeout: 20_000 });
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 20_000 });
  await expect(page.locator('#wireframe')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#road-debug')).toHaveAttribute('aria-pressed', 'true');
  expect(Number(await page.locator('[data-metric="Allocated meshes"]').textContent())).toBe(289);
  await expect(page.locator('[data-metric="GPU textures"]')).toHaveText('7');
  expect(errors).toEqual([]);
});

test('collapses the panel and keeps pause button and keyboard state in sync', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '收起面板' }).click();
  await expect(page.locator('#explorer')).toBeHidden();
  await page.getByRole('button', { name: '展开面板' }).click();
  await page.getByRole('button', { name: '暂停探索' }).click();
  await expect(page.locator('#pause')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#notice')).toContainText('已暂停');
  await page.keyboard.press('KeyP');
  await expect(page.locator('#pause')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#pause')).toHaveText('暂停探索');
});

test('explains pointer lock rejection and keeps drag controls available', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('#world').evaluate((canvas) => {
    (canvas as HTMLCanvasElement).requestPointerLock = () => Promise.reject(new Error('Pointer lock denied'));
  });
  await page.locator('#world').dblclick({ position: { x: 900, y: 400 } });
  await expect(page.locator('#notice')).toContainText('鼠标锁定不可用', { timeout: 5000 });
  await page.mouse.move(900, 400);
  await page.mouse.down();
  await page.mouse.move(1000, 400);
  await page.mouse.up();
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number((await page.locator('[data-metric="Coordinates"]').textContent())!.split(',')[0])).toBeGreaterThan(130);
  await page.keyboard.up('KeyW');
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});
