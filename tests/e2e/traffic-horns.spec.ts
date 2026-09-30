import { expect, test } from '@playwright/test';
import { closeSettings, control, ignite, openSettings } from './settings';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext, horns: AnalyserNode[] = [], outputs: AnalyserNode[] = [];
    Reflect.set(window, 'hornMeters', horns); Reflect.set(window, 'hornOutputs', outputs);
    window.AudioContext = class extends Native {
      createStereoPanner(): StereoPannerNode {
        const node = super.createStereoPanner(), meter = this.createAnalyser(); meter.fftSize = 4096; meter.smoothingTimeConstant = 0;
        node.connect(meter); horns.push(meter); return node;
      }
      createDynamicsCompressor(): DynamicsCompressorNode {
        const node = super.createDynamicsCompressor(), meter = this.createAnalyser(); meter.fftSize = 2048;
        node.connect(meter); outputs.push(meter); return node;
      }
    };
    Reflect.set(window, 'readHorns', () => ({
      voices: horns.slice(0, 5).map(meter => {
        const samples = new Float32Array(meter.fftSize), spectrum = new Float32Array(meter.frequencyBinCount);
        meter.getFloatTimeDomainData(samples); meter.getFloatFrequencyData(spectrum);
        const peak = Math.max(...samples.map(Math.abs)), power = samples.reduce((sum, value) => sum + value * value, 0);
        let band = 0; for (let i = 1; i < spectrum.length; i++) if (spectrum[i] > spectrum[band]) band = i;
        return { rms: Math.sqrt(power / samples.length), peak, pitch: band * meter.context.sampleRate / meter.fftSize };
      }),
      peak: Math.max(0, ...outputs.map(meter => {
        const samples = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(samples); return Math.max(...samples.map(Math.abs));
      })),
    }));
  });
});

test('plays loud vehicle-specific horns, mutes independently, pauses and restores saved volumes', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=HORN-AUDIT');
  await (await control(page, page.locator('#audio-toggle'))).click();
  await expect(page.locator('[data-metric="Audio state"]')).toHaveText('running');
  const read = () => page.evaluate(() => Reflect.get(window, 'readHorns')() as { voices: { rms: number; peak: number; pitch: number }[]; peak: number });
  const pitches: number[] = [];
  for (const [kind, low, high] of [['sedan', 350, 500], ['truck8', 100, 220], ['motorcycle', 480, 640]] as const) {
    await (await control(page, page.locator('#vehicle-kind'))).selectOption(kind);
    await (await control(page, page.locator('#preview-horn'))).click();
    await expect.poll(async () => {
      const voice = (await read()).voices[0];
      return voice.rms > 0.12 && voice.pitch >= low && voice.pitch <= high;
    }).toBe(true);
    const audio = await read(); pitches.push(audio.voices[0].pitch);
    expect(audio.voices).toHaveLength(5); expect(audio.voices[0].peak).toBeGreaterThan(0.3);
    expect(audio.peak).toBeLessThan(0.98);
    await expect(page.locator('#audio-preview-status')).toContainText('试听已结束');
    await expect.poll(async () => (await read()).voices[0].rms).toBeLessThan(0.001);
  }
  expect(pitches[1]).toBeLessThan(pitches[0]); expect(pitches[2]).toBeGreaterThan(pitches[0]);
  await page.locator('#horn-volume').fill('300'); await page.locator('#preview-horn').click();
  await expect.poll(async () => (await read()).voices[0].rms).toBeGreaterThan(0.4);
  expect((await read()).peak).toBeLessThan(0.98);
  await page.locator('#effects-volume').fill('0'); await page.locator('#preview-horn').click();
  await expect.poll(async () => (await read()).voices[0].rms).toBeGreaterThan(0.12);
  await page.locator('#horn-volume').fill('0');
  await expect.poll(async () => (await read()).voices[0].rms).toBeLessThan(0.001);
  await page.locator('#preview-horn').click(); await expect(page.locator('#audio-preview-status')).toContainText('本车喇叭');
  await page.locator('#horn-volume').fill('145'); await page.locator('#npc-horn-volume').fill('85');
  await (await control(page, page.locator('#preset-name'))).fill('喇叭混音'); await page.locator('#preset-save').click();
  await page.reload();
  await (await control(page, page.locator('#preset-apply'))).click();
  await (await control(page, page.locator('#horn-volume'))).scrollIntoViewIfNeeded();
  await expect(page.locator('#horn-volume')).toHaveValue('145'); await expect(page.locator('#npc-horn-volume')).toHaveValue('85');
  if (await page.locator('#audio-toggle').getAttribute('aria-pressed') === 'false') await page.locator('#audio-toggle').click();
  await closeSettings(page);
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30_000 }); await page.locator('#drive-toggle').click();
  await page.keyboard.down('KeyV'); await expect.poll(async () => (await read()).voices[0].rms).toBeGreaterThan(0.12);
  await page.keyboard.press('Slash'); await page.keyboard.up('KeyV');
  await expect(page.locator('[data-metric="Audio state"]')).toHaveText('suspended');
  await page.keyboard.press('Slash');
  await expect.poll(async () => (await read()).voices[0].rms).toBeLessThan(0.001);
  expect(errors).toEqual([]);
});

test('hears nearby NPC queue horns and freezes their simulation in settings', async ({ page }) => {
  test.setTimeout(100_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 960, height: 600 }); await page.goto('/?seed=NPC-HORNS');
  await (await control(page, page.locator('#road-type'))).selectOption('highway');
  await page.locator('#road-lanes').selectOption('3'); await page.locator('#terrain-kind').selectOption('meadow');
  await page.locator('#route-style').selectOption('0'); await page.locator('#max-grade').fill('0');
  await page.locator('#world-options button[type="submit"]').click();
  await (await control(page, page.locator('#traffic-density'))).fill('100');
  await page.locator('#traffic-limit').fill('84'); await page.locator('#traffic-scenario').selectOption('queue');
  await (await control(page, page.locator('#graphics-preset'))).selectOption('economy');
  await (await control(page, page.locator('#audio-toggle'))).click(); await closeSettings(page);
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30_000 }); await page.locator('#drive-toggle').click(); await ignite(page);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => parseFloat((await page.locator('#vehicle-trip').textContent())!), { timeout: 20_000 }).toBeGreaterThan(0.16);
  await page.keyboard.up('KeyW'); await page.keyboard.down('Space');
  await expect(page.locator('#vehicle-speed')).toHaveText('0', { timeout: 15_000 }); await page.keyboard.up('Space');
  await expect.poll(() => page.evaluate(() => Math.max(0, ...(Reflect.get(window, 'hornMeters') as AnalyserNode[]).slice(5).map(meter => {
    const data = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(data);
    return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
  }))), { timeout: 15_000 }).toBeGreaterThan(0.0005);
  const npcLevel = () => page.evaluate(() => {
    const audio = Reflect.get(window, 'readHorns')() as { voices: { rms: number }[] };
    return Math.max(0, ...audio.voices.slice(1).map(voice => voice.rms));
  });
  await expect.poll(npcLevel, { timeout: 50_000, intervals: [100] }).toBeGreaterThan(0.003);
  await openSettings(page);
  await page.waitForTimeout(300);
  const paused = await page.locator('[data-metric="NPC motion"]').textContent();
  await expect.poll(npcLevel).toBeLessThan(0.001);
  await page.waitForTimeout(400); await expect(page.locator('[data-metric="NPC motion"]')).toHaveText(paused!);
  await (await control(page, page.locator('#traffic-density'))).fill('0'); await closeSettings(page);
  await expect(page.locator('[data-metric="NPC vehicles"]')).toHaveText('0'); await expect.poll(npcLevel).toBeLessThan(0.001);
  expect(errors).toEqual([]);
});
