import { expect, test } from '@playwright/test';

test('requires a fresh movement key after focus loss or keyboard pause', async ({ page }) => {
  const coordinates = page.locator('[data-metric="Coordinates"]');
  await page.goto('/');
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 20_000 });
  await page.locator('#world').focus();
  await page.keyboard.down('KeyW');
  await page.locator('#seed').focus();
  await page.locator('#world').focus();
  await page.waitForTimeout(300);
  const stopped = await coordinates.textContent();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  await expect(coordinates).toHaveText(stopped!);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyW');
  await expect(coordinates).not.toHaveText(stopped!);
  await page.keyboard.press('KeyP');
  await expect(page.locator('#pause')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  const paused = await coordinates.textContent();
  await page.keyboard.press('KeyP');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  await expect(coordinates).toHaveText(paused!);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyW');
  await expect(coordinates).not.toHaveText(paused!);
  await page.keyboard.up('KeyW');
});

test('keeps pause and debug shortcuts available on buttons without hijacking editing or dialogs', async ({ page }) => {
  await page.goto('/');
  await page.locator('#controls-toggle').click();
  await page.keyboard.press('KeyP');
  await expect(page.locator('#pause')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('F3');
  await expect(page.locator('#debug')).toBeVisible();
  await page.locator('#controls-toggle').click();
  await page.locator('#seed').focus();
  await page.keyboard.press('KeyP');
  await expect(page.locator('#pause')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#release-open').click();
  await page.keyboard.press('KeyP');
  await page.keyboard.press('F3');
  await expect(page.locator('#pause')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#debug')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyP');
  await expect(page.locator('#pause')).toHaveAttribute('aria-pressed', 'false');
});

test('blocks exploration during a terrain failure and restores controls and preferences after retry', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
        if (Reflect.get(window, 'failTerrain')) {
          Reflect.set(window, 'failTerrain', false);
          throw new Error('Injected audit failure');
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 20_000 });
  await page.locator('#daylight').fill('90');
  await page.locator('#shadows').click();
  await page.evaluate(() => Reflect.set(window, 'failTerrain', true));
  await page.locator('#seed').fill('AUDIT-RECOVERY');
  await page.getByRole('button', { name: '加载种子' }).click();
  await expect(page.locator('#error')).toContainText('Injected audit failure');
  await page.locator('#world').focus();
  await page.waitForTimeout(300);
  const position = await page.locator('[data-metric="Coordinates"]').textContent();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyW');
  await expect(page.locator('[data-metric="Coordinates"]')).toHaveText(position!);
  await expect(page.locator('#explorer')).toHaveAttribute('inert', '');
  await expect(page.locator('#controls-toggle')).toBeDisabled();
  await expect(page.locator('#notice')).toContainText('探索已中止');
  await page.locator('#release-open').click();
  await expect(page.locator('#release-notes')).toBeVisible();
  await page.locator('#world').evaluate((canvas) => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 1000);
  });
  await expect(page.locator('#error')).toContainText('图形上下文暂时丢失');
  await expect(page.locator('#error')).toContainText('Injected audit failure');
  await expect(page.locator('#explorer')).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: '关闭公告' })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.locator('#retry-world').click();
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#explorer')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#controls-toggle')).toBeEnabled();
  await expect(page.locator('#daylight')).toHaveValue('90');
  await expect(page.locator('#shadows')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 20_000 });
  await page.keyboard.down('KeyW');
  await expect(page.locator('[data-metric="Coordinates"]')).not.toHaveText(position!);
  await page.keyboard.up('KeyW');
});

test('keeps the release close button reachable while reading the oldest announcement', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 450 });
  await page.goto('/');
  await page.locator('#release-open').click();
  await page.getByText('历史公告', { exact: true }).click();
  await page.locator('#release-history article').last().locator('li').last().scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '关闭公告' })).toBeInViewport();
  await page.getByRole('button', { name: '关闭公告' }).click();
  await expect(page.locator('#release-notes')).toBeHidden();
  await expect(page.locator('#release-open')).toBeFocused();
});

test('closes overlapping debug telemetry with a visible control in a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#world').focus();
  await page.keyboard.press('F3');
  await expect(page.locator('#debug')).toBeVisible();
  const close = page.getByRole('button', { name: '关闭调试面板' });
  await page.locator('#debug dd').last().scrollIntoViewIfNeeded();
  await expect(close).toBeInViewport();
  await close.click();
  await expect(page.locator('#debug')).toBeHidden();
  await expect(page.locator('#world')).toBeFocused();
  await page.locator('#seed').click();
  await expect(page.locator('#seed')).toBeFocused();
});
