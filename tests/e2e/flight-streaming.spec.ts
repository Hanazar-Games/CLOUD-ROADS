import { expect, test } from '@playwright/test';

test('waits for real terrain preparation and keeps streaming attached to the aircraft during overview', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const requests: { kind: string; x: number; z: number; cells?: number; inner?: number }[] = [];
    Reflect.set(window, 'flightRequests', requests);
    window.Worker = class extends NativeWorker {
      private readonly horizon: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); this.horizon = String(url).includes('FlightHorizon');
      }
      postMessage(message: { request?: { x: number; z: number; cells: number }; x?: number; z?: number; inner?: number }, options?: StructuredSerializeOptions | Transferable[]) {
        requests.push({ kind: this.horizon ? 'horizon' : 'terrain', x: message.request?.x ?? message.x!, z: message.request?.z ?? message.z!, cells: message.request?.cells, inner: message.inner });
        const send = () => Array.isArray(options) ? super.postMessage(message, options) : super.postMessage(message, options);
        if (this.horizon) setTimeout(send, 1200);
        else send();
      }
    };
  });
  await page.goto('/?seed=CLOUD-STREAMING-PREFLIGHT');
  await page.locator('#aircraft-toggle').click();
  await expect(page.locator('#airport-board')).toBeEnabled();
  await page.locator('#airport-board').click();
  await expect(page.locator('.av-load-status')).toContainText('预加载地图');
  await expect(page.locator('.av-panel')).toBeVisible();
  await expect(page.locator('[data-action="runway"]')).toBeDisabled();
  await expect(page.locator('.av-panel')).toBeHidden();
  await expect(page.locator('[data-value="phase"]')).toContainText('TAXI');
  const horizons = await page.evaluate(() => Reflect.get(window, 'flightRequests').filter((request: { kind: string }) => request.kind === 'horizon').length);
  await page.locator('[data-action="camera"]').click();
  await page.locator('[data-camera="8"]').click();
  await expect(page.locator('[data-action="camera"]')).toContainText('机场总览');
  await page.waitForTimeout(600);
  const requests = await page.evaluate(() => Reflect.get(window, 'flightRequests') as { kind: string; x: number; z: number; inner?: number }[]);
  expect(requests.filter(request => request.kind === 'horizon')).toHaveLength(horizons);
  expect(requests.filter(request => request.kind === 'horizon').every(request => request.inner === 256)).toBe(true);
  expect(requests.filter(request => request.kind === 'terrain').slice(-10).every(request => request.z < 6)).toBe(true);
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('#airport-dock')).toBeVisible();
});

test('reports failed distant terrain before departure and keeps returning to ground available', async ({ page }) => {
  await page.route('**/FlightHorizonWorker-*.js', route => route.abort('failed'));
  await page.goto('/?seed=CLOUD-STREAMING-FAILURE');
  await page.locator('#aircraft-toggle').click();
  await expect(page.locator('#airport-board')).toBeEnabled();
  await page.locator('#airport-board').click();
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'error', { timeout: 20000 });
  await expect(page.locator('.av-load-status')).toContainText('地图加载失败');
  await expect(page.locator('[data-action="runway"]')).toBeDisabled();
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('#airport-dock')).toBeVisible();
});

test('changing the departure during preparation waits for the player to launch again', async ({ page }) => {
  await page.route('**/FlightHorizonWorker-*.js', async route => {
    await new Promise(resolve => setTimeout(resolve, 3000)); await route.continue();
  });
  await page.goto('/?seed=CLOUD-STREAMING-CHANGE');
  await page.locator('#aircraft-toggle').click();
  await page.locator('#airport-board').click();
  await expect(page.locator('.av-load-status')).toContainText('预加载地图');
  await page.locator('[data-setting="airport"]').selectOption('alpine');
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready', { timeout: 20000 });
  await expect(page.locator('.av-panel')).toBeVisible();
  await page.locator('[data-action="runway"]').click();
  await expect(page.locator('.av-panel')).toBeHidden();
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('#airport-dock')).toBeVisible();
});
