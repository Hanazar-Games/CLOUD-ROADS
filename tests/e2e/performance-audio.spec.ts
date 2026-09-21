import { expect, test } from '@playwright/test';

test('applies graphics controls immediately and retains them after reloading a world', async ({ page }) => {
  await page.goto('/?seed=CLOUD-ROAD-001');
  await page.locator('#graphics-preset').selectOption('economy');
  await expect(page.locator('#render-scale')).toHaveValue('0.65');
  await expect(page.locator('#shadows')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#cloud-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#render-scale').selectOption('0.5');
  await page.locator('#frame-limit').selectOption('30');
  await expect(page.locator('#graphics-preset')).toHaveValue('custom');
  const width = await page.locator('#world').evaluate(canvas => (canvas as HTMLCanvasElement).width);
  const expected = await page.evaluate(() => Math.floor(innerWidth * Math.min(devicePixelRatio, 1.5) * 0.5));
  expect(width).toBe(expected);
  await page.locator('#random-world').click();
  await expect(page.locator('[data-metric="Seed"]')).toHaveText(/^ROAD-/);
  await expect(page.locator('[data-metric="Render scale"]')).toHaveText('50%');
  await expect(page.locator('[data-metric="Frame limit"]')).toHaveText('30');
  await expect(page.locator('[data-metric="Scene samples"]')).toHaveText('0');
  await page.locator('#graphics-preset').selectOption('quality');
  await expect(page.locator('#frame-limit')).toHaveValue('30');
  await expect(page.locator('#antialiasing')).toHaveValue('4');
  await page.locator('#render-scale').selectOption('0.75'); await page.locator('#shadow-quality').selectOption('1024');
  await page.locator('#world').evaluate(canvas => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 500);
  });
  await expect(page.locator('#error')).toContainText('图形上下文暂时丢失');
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#render-scale')).toHaveValue('0.75');
  await expect(page.locator('#shadow-quality')).toHaveValue('1024');
  await expect(page.locator('[data-metric="Scene samples"]')).toHaveText('4');
});

test('unlocks audio explicitly, pauses in announcements, and mutes without creating another context', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext;
    const contexts: AudioContext[] = [];
    Reflect.set(window, 'auditAudioContexts', contexts);
    window.AudioContext = class extends NativeContext {
      constructor() { super(); contexts.push(this); }
      createGain() {
        const gain = super.createGain();
        if (!Reflect.get(window, 'auditAudioMeter')) { const meter = this.createAnalyser(); gain.connect(meter); Reflect.set(window, 'auditAudioMeter', meter); }
        return gain;
      }
    };
  });
  await page.goto('/?seed=CLOUD-ROAD-001');
  const state = () => page.evaluate(() => (Reflect.get(window, 'auditAudioContexts') as AudioContext[]).map(c => c.state));
  expect(await state()).toEqual([]);
  await page.getByText('声音与音乐', { exact: true }).click();
  await page.locator('#audio-toggle').click();
  await expect(page.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(state).toEqual(['running']);
  const level = () => page.evaluate(() => {
    const meter = Reflect.get(window, 'auditAudioMeter') as AnalyserNode;
    const samples = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  });
  await page.locator('#sfx-volume').fill('0'); await page.locator('#music-volume').fill('100');
  await expect.poll(level).toBeGreaterThan(0.005);
  expect(await level()).toBeLessThan(0.5);
  await page.locator('#sfx-volume').fill('100'); await page.locator('#music-volume').fill('0');
  await page.waitForTimeout(250);
  await expect.poll(level).toBeGreaterThan(0.0004);
  await page.locator('#release-open').click();
  await expect.poll(state).toEqual(['suspended']);
  await page.keyboard.press('Escape');
  await expect.poll(state).toEqual(['running']);
  await page.locator('#pause').click();
  await expect.poll(state).toEqual(['suspended']);
  await page.locator('#pause').click();
  await page.locator('#audio-toggle').click();
  await expect.poll(state).toEqual(['suspended']);
  await page.locator('#audio-toggle').click();
  await expect.poll(state).toEqual(['running']);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(state).toEqual(['suspended']);
  await page.waitForTimeout(300);
  expect(await state()).toEqual(['suspended']);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(state).toEqual(['running']);
  await page.locator('#sfx-volume').fill('0'); await page.locator('#music-volume').fill('0');
  await expect.poll(state).toEqual(['suspended']);
  expect(errors).toEqual([]);
});

test('keeps exploration available when audio initialization fails', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(window, 'AudioContext', class { constructor() { throw new Error('Injected audio failure'); } });
  });
  await page.goto('/?seed=CLOUD-ROAD-001');
  await page.getByText('声音与音乐', { exact: true }).click(); await page.locator('#audio-toggle').click();
  await expect(page.locator('#audio-status')).toContainText('当前浏览器无法开启音频');
  await expect(page.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 20000 });
});

test('shows bridge and railway scenery while retaining the active route', async ({ page }) => {
  await page.goto('/?seed=VALLEY-28');
  await page.locator('#terrain-kind').selectOption('forest');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  await expect(page.locator('[data-metric="Landscape"]')).toHaveText('森林山谷');
  await expect(page.locator('#crossing-view')).toBeEnabled({ timeout: 20000 });
  await expect(page.locator('[data-metric="Valley crossings"]')).toContainText('rail');
  const position = await page.locator('[data-metric="Coordinates"]').textContent();
  await page.locator('#crossing-view').click();
  await expect(page.locator('[data-metric="Coordinates"]')).not.toHaveText(position!);
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 20000 });
  await expect(page.locator('[data-metric="Active route"]')).toHaveText('root');
  await page.locator('#drive-toggle').click();
  await expect(page.locator('#drive-hud')).toBeVisible();
  await expect(page.locator('#error')).toBeHidden();
});
