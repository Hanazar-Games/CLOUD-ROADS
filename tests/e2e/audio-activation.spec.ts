import { expect, test } from '@playwright/test';
import { control } from './settings';

test.use({ launchOptions: { args: [
  ...(process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : ['--enable-webgl']),
  '--autoplay-policy=document-user-activation-required',
] } });

for (const kind of ['engine', 'shift', 'horn']) test(`starts ${kind} preview directly and plays it after delayed device resume`, async ({ page }) => {
  const warnings: string[] = [], errors: string[] = [];
  page.on('console', message => { if (message.text().includes('AudioContext was not allowed')) warnings.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const Native = AudioContext;
    window.AudioContext = class extends Native {
      async resume() { await new Promise(resolve => setTimeout(resolve, 250)); return super.resume(); }
      createDynamicsCompressor() {
        const limiter = super.createDynamicsCompressor(), meter = this.createAnalyser();
        limiter.connect(meter); Reflect.set(window, 'previewMeter', meter); return limiter;
      }
    };
  });
  await page.goto('/?seed=AUDIO-PREVIEW');
  for (const id of ['music', 'weather', 'nature']) await (await control(page, page.locator(`#${id}-volume`))).fill('0');
  await expect(page.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'false');
  const level = () => page.evaluate(() => {
    const meter = Reflect.get(window, 'previewMeter') as AnalyserNode | undefined;
    if (!meter) return 0;
    const samples = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await (await control(page, page.locator(`#preview-${kind}`))).click();
    await expect(page.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(level, { intervals: [10], timeout: 2000 }).toBeGreaterThan(kind === 'shift' ? 0.0001 : 0.003);
    await expect(page.locator('#audio-preview-status')).toContainText('试听已结束');
    await page.locator('#audio-toggle').click();
    await expect(page.locator('[data-metric="Audio state"]')).toHaveText('suspended');
  }
  expect(warnings).toEqual([]); expect(errors).toEqual([]);
});

for (const gesture of ['keyboard', 'click']) test(`restores startup audio after a real ${gesture} gesture and emits sound`, async ({ page, browser }) => {
  await page.goto('/?seed=AUDIO-ACTIVATION');
  await (await control(page, page.locator('#audio-toggle'))).click();
  await (await control(page, page.locator('#preset-name'))).fill('Audio startup');
  await page.locator('#startup-save').click();
  const context = await browser.newContext({ storageState: await page.context().storageState() });
  const restored = await context.newPage();
  const warnings: string[] = [], errors: string[] = [];
  restored.on('console', message => { if (message.text().includes('AudioContext was not allowed')) warnings.push(message.text()); });
  restored.on('pageerror', error => errors.push(error.message));
  await restored.addInitScript(() => {
    const Native = AudioContext, contexts: AudioContext[] = [];
    Reflect.set(window, 'startupContexts', contexts);
    Reflect.set(window, 'startupActivated', navigator.userActivation.hasBeenActive);
    window.AudioContext = class extends Native {
      constructor() { super(); contexts.push(this); }
      createDynamicsCompressor() {
        const limiter = super.createDynamicsCompressor(), meter = this.createAnalyser();
        limiter.connect(meter); Reflect.set(window, 'startupMeter', meter); return limiter;
      }
    };
  });
  try {
    await restored.goto(page.url());
    // CDP reads must not grant the activation that this regression is testing.
    const session = await context.newCDPSession(restored);
    const read = async (expression: string) => (await session.send('Runtime.evaluate', {
      expression, returnByValue: true, userGesture: false,
    })).result.value;
    await expect.poll(() => read("document.querySelector('#startup-status').textContent")).toContain('已恢复');
    await restored.waitForTimeout(4500);
    expect(await read('window.startupActivated')).toBe(false);
    expect(await read('navigator.userActivation.hasBeenActive')).toBe(false);
    expect(await read('window.startupContexts.length')).toBe(0);
    expect(await read("document.querySelector('#audio-toggle').getAttribute('aria-pressed')")).toBe('true');
    expect(await read("document.querySelector('#audio-status').textContent")).toContain('点击页面或按键');
    await read("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })); document.querySelector('#world').click()");
    expect(await read('window.startupContexts.length')).toBe(0);
    expect(warnings).toEqual([]);
    if (gesture === 'keyboard') await restored.keyboard.press('ArrowUp');
    else await restored.locator('#world').click({ position: { x: 700, y: 500 } });
    await expect.poll(() => read('window.startupContexts.map(c => c.state)')).toEqual(['running']);
    const level = () => read(`(() => {
      const meter = window.startupMeter, samples = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    })()`);
    await expect.poll(level).toBeGreaterThan(0.001);
    await (await control(restored, restored.locator('#audio-recover'))).click();
    await expect.poll(() => read('window.startupContexts.map(c => c.state)')).toEqual(['closed', 'running']);
    await (await control(restored, restored.locator('#sfx-volume'))).fill('0');
    await (await control(restored, restored.locator('#music-volume'))).fill('0');
    await (await control(restored, restored.locator('#audio-test'))).click();
    await expect.poll(level, { intervals: [50], timeout: 2000 }).toBeGreaterThan(0.015);
    expect(warnings).toEqual([]); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
