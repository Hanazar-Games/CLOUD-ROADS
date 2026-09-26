import { expect, test } from '@playwright/test';

test('applies muted SFX and BGM channels before the native audio context resumes', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext, gains: GainNode[] = [], resumes: number[][] = [], targets = new Map<GainNode, number>();
    const meters: AnalyserNode[] = [];
    Reflect.set(window, 'resumeLevels', resumes);
    Reflect.set(window, 'channelMeters', meters);
    window.AudioContext = class extends Native {
      createGain() {
        const gain = super.createGain(), meter = this.createAnalyser(); gains.push(gain); meters.push(meter); gain.connect(meter);
        const schedule = gain.gain.setValueAtTime.bind(gain.gain);
        gain.gain.setValueAtTime = (value, time) => { targets.set(gain, value); return schedule(value, time); };
        return gain;
      }
      resume() { resumes.push(gains.map(gain => targets.get(gain) ?? gain.gain.value)); return super.resume(); }
    };
  });
  await page.goto('/?seed=FLEET-FLAT');
  await page.getByText('声音与音乐', { exact: true }).click(); await page.locator('#audio-toggle').click();
  const state = page.locator('[data-metric="Audio state"]');
  await expect(state).toHaveText('running');
  for (const [sfx, music] of [['0', '80'], ['60', '0']]) {
    await page.locator('#pause').click(); await expect(state).toHaveText('suspended');
    await page.locator('#sfx-volume').fill(sfx); await page.locator('#music-volume').fill(music);
    await page.locator('#pause').click(); await expect(state).toHaveText('running');
    const levels = await page.evaluate(() => (Reflect.get(window, 'resumeLevels') as number[][]).at(-1)!);
    expect(levels[1]).toBeCloseTo(Number(sfx) / 100); expect(levels[2]).toBeCloseTo(Number(music) / 100);
    await expect.poll(() => page.evaluate(channel => {
      const meter = (Reflect.get(window, 'channelMeters') as AnalyserNode[])[channel], samples = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    }, sfx === '0' ? 1 : 2)).toBeLessThan(0.00001);
  }
});

test('returns keyboard control when closing settings and boards the parked car from the header', async ({ page }) => {
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=FLEET-FLAT');
  await page.locator('#terrain-kind').selectOption('meadow');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  await page.locator('#drive-toggle').click();
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-trip').textContent())).toBeGreaterThan(0.01);
  await page.keyboard.up('KeyW'); await page.keyboard.press('KeyF');
  await expect(metric('Travel mode')).toHaveText('walking');
  const parked = await metric('Vehicle position').textContent(), trip = await page.locator('#vehicle-trip').textContent();
  await expect(page.locator('#drive-toggle')).toHaveText('回到车辆');
  await page.locator('#drive-toggle').click();
  await expect(metric('Travel mode')).toHaveText('driving');
  const before = parked!.split(',').map(Number), after = (await metric('Vehicle position').textContent())!.split(',').map(Number);
  expect([after[0], after[2]]).toEqual([before[0], before[2]]);
  expect(Math.abs(after[1] - before[1])).toBeLessThan(0.1);
  await expect(page.locator('#vehicle-trip')).toHaveText(trip!);
  await page.locator('#controls-toggle').click(); await page.locator('#controls-toggle').click();
  await expect(page.locator('#world')).toBeFocused();
  await page.keyboard.press('KeyF'); await expect(metric('Travel mode')).toHaveText('walking');
});

test('keeps the settings panel clear of the walking HUD beside a parked vehicle', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 520 });
  await page.goto('/?seed=FLEET-FLAT'); await page.locator('#drive-toggle').click();
  await page.keyboard.press('KeyF'); await expect(page.locator('#boarding-help')).toBeVisible();
  await page.locator('#controls-toggle').click();
  for (const size of [{ width: 480, height: 520 }, { width: 800, height: 450 }, { width: 390, height: 450 }]) {
    await page.setViewportSize(size);
    const panel = await page.locator('#explorer').boundingBox(), hud = await page.locator('#walk-hud').boundingBox();
    expect(panel!.y + panel!.height + 8).toBeLessThanOrEqual(hud!.y);
  }
});

test('updates parked lights and wipers and still freezes them while paused', async ({ page }) => {
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=FLEET-FLAT');
  await page.locator('#vehicle-kind').selectOption('truck5');
  await page.locator('#vehicle-lights').selectOption('high');
  await page.locator('#vehicle-wipers').selectOption('high');
  await page.locator('#drive-toggle').click();
  await expect(metric('Vehicle lights')).toHaveText('high');
  await page.keyboard.press('KeyF'); await expect(metric('Parked vehicle')).toHaveText('yes');
  await page.locator('#controls-toggle').click();
  await page.locator('#vehicle-lights').selectOption('off');
  await expect(metric('Vehicle lights')).toHaveText('off');
  await page.locator('#vehicle-wipers').selectOption('off');
  await expect(metric('Wiper sweep')).toHaveText('0.000');
  await page.locator('#vehicle-wipers').selectOption('high');
  await expect.poll(async () => Number(await metric('Wiper sweep').textContent())).toBeGreaterThan(0.2);
  await page.locator('#world').focus(); await page.keyboard.press('KeyP'); await page.waitForTimeout(200);
  const sweep = await metric('Wiper sweep').textContent(); await page.waitForTimeout(350);
  await expect(metric('Wiper sweep')).toHaveText(sweep!);
  await expect(metric('Travel mode')).toHaveText('walking');
});
