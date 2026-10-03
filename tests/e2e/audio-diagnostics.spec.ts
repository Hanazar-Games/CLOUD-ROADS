import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { control } from './settings';

test('recovers a failed audio device, emits a test signal with muted buses and exports diagnostics', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const Native = window.AudioContext, contexts: AudioContext[] = [], meters = new Map<AudioContext, AnalyserNode>();
    Reflect.set(window, 'testContexts', contexts); Reflect.set(window, 'testMeters', meters);
    window.AudioContext = class extends Native {
      constructor() { super(); contexts.push(this); }
      resume() { return contexts.indexOf(this) === 0 ? Promise.reject(new Error('Simulated audio device failure')) : super.resume(); }
      createGain() {
        const gain = super.createGain();
        if (!meters.has(this)) { const meter = this.createAnalyser(); gain.connect(meter); meters.set(this, meter); }
        return gain;
      }
    };
  });
  await page.goto('/?seed=AUDIO-RECOVERY');
  const states = () => page.evaluate(() => (Reflect.get(window, 'testContexts') as AudioContext[]).map(c => c.state));
  await (await control(page, page.locator('#audio-toggle'))).click();
  await expect.poll(states).toEqual(['running']);
  await page.locator('#audio-toggle').click(); await expect.poll(states).toEqual(['suspended']);
  await (await control(page, page.locator('#audio-toggle'))).click();
  await expect(page.locator('#audio-status')).toContainText('音频恢复失败');
  await expect(page.locator('#audio-toggle')).toBeEnabled();
  await (await control(page, page.locator('#master-volume'))).fill('0');
  await (await control(page, page.locator('#engine-volume'))).fill('40');
  await (await control(page, page.locator('#audio-recover'))).click();
  await expect.poll(states).toEqual(['closed', 'running']);
  await expect(page.locator('#master-volume')).toHaveValue('85'); await expect(page.locator('#engine-volume')).toHaveValue('40');
  await (await control(page, page.locator('#sfx-volume'))).fill('0');
  await (await control(page, page.locator('#music-volume'))).fill('0');
  await expect.poll(states).toEqual(['closed', 'suspended']);
  await (await control(page, page.locator('#audio-test'))).click();
  await expect.poll(() => page.evaluate(() => {
    const contexts = Reflect.get(window, 'testContexts') as AudioContext[];
    const meter = (Reflect.get(window, 'testMeters') as Map<AudioContext, AnalyserNode>).get(contexts.at(-1)!)!;
    const samples = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  })).toBeGreaterThan(0.015);
  await expect.poll(states).toEqual(['closed', 'suspended']);
  await expect(page.locator('#sfx-volume')).toHaveValue('0'); await expect(page.locator('#music-volume')).toHaveValue('0');
  await (await control(page, page.locator('#audio-resume-fade'))).fill('300');
  const guide = page.locator('#audio-resume-fade-parameter-help').locator('..'); await guide.locator('summary').click();
  await expect(guide).toContainText('约 95%');
  await (await control(page, page.locator('#preset-name'))).fill('Audio recovery');
  await page.locator('#preset-save').click(); await expect(page.locator('#preset-status')).toContainText('已保存');
  await (await control(page, page.locator('#audio-mix-reset'))).click();
  await expect(page.locator('#audio-resume-fade')).toHaveValue('120');
  await (await control(page, page.locator('#preset-apply'))).click();
  await expect(page.locator('#audio-resume-fade')).toHaveValue('300');
  await (await control(page, page.locator('#diagnostics-open'))).click();
  await expect(page.locator('#debug')).toBeVisible();
  await page.locator('#log-filter').selectOption('error');
  await expect(page.locator('#log-entries')).toContainText('Simulated audio device failure');
  const download = page.waitForEvent('download'); await page.locator('#log-export').click();
  const file = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(file.format).toBe('cloud-roads-diagnostics'); expect(file.entries.some((e: { source: string; level: string }) => e.source === 'audio' && e.level === 'error')).toBe(true);
  expect(file.entries.some((e: { message: string }) => e.message.includes('test scheduled'))).toBe(true);
  expect(file.metrics['Audio state']).toBeDefined();
  await page.screenshot({ path: info.outputPath('diagnostics.png') });
  await page.locator('#log-clear').click(); await expect(page.locator('#log-entries')).toContainText('没有日志');
  expect(errors).toEqual([]);
});

test('keeps recovery controls and parameter explanations accessible on a narrow screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 700 }); await page.goto('/?seed=AUDIO-MOBILE');
  await (await control(page, page.locator('#audio-recover'))).click();
  await expect(page.locator('#audio-status')).toContainText('声音已开启');
  await page.screenshot({ path: info.outputPath('audio-mobile.png') });
  await (await control(page, page.locator('#log-capacity'))).fill('100');
  await page.locator('#log-recording').uncheck();
  await page.locator('#diagnostics-open').click();
  await expect(page.locator('#log-status')).toContainText('已暂停记录');
  await expect(page.locator('#log-status')).toContainText('/ 100');
  await expect(page.locator('#log-filter')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#debug-close').click(); await expect(page.locator('#world')).toBeFocused();
});

test('exports a startup failure even when the renderer and developer panel cannot initialize', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null }));
  await page.goto('/'); await expect(page.locator('#error')).toBeVisible();
  const download = page.waitForEvent('download'); await page.locator('#error-export-log').click();
  const file = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(file.entries.some((e: { source: string; level: string }) => e.source === 'startup' && e.level === 'error')).toBe(true);
  await expect(page.locator('#retry-world')).toBeEnabled();
});
