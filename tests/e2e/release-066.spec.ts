import { expect, test } from '@playwright/test';
import { control, closeSettings, ignite } from './settings';

test('keeps settings description IDs unique and every accessibility reference connected', async ({ page }) => {
  await page.goto('/?seed=AUDIT-066-LABELS');
  await control(page, page.locator('#view-distance'));
  const problems = await page.locator('#explorer').evaluate(dialog => {
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    return {
      duplicates: ids.filter((id, i) => ids.indexOf(id) !== i),
      descriptions: [...dialog.querySelectorAll('[aria-describedby]')].flatMap(node => {
        const refs = node.getAttribute('aria-describedby')!.split(/\s+/);
        return refs.filter((id, i) => !document.getElementById(id) || refs.indexOf(id) !== i).map(id => `${node.id}: ${id}`);
      }),
    };
  });
  expect(problems).toEqual({ duplicates: [], descriptions: [] });
});

test('keeps translated settings usable and the active category visible after resizing', async ({ page }, info) => {
  await page.goto('/?seed=AUDIT-066-LAYOUT');
  for (const language of ['en', 'es', 'ko', 'ja']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await (await control(page, page.locator('#interface-language'))).selectOption(language);
    await control(page, page.locator('#signal-mainGreen'));
    await page.setViewportSize({ width: 390, height: 450 });
    await expect(page.locator('#settings-close')).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`${language}-short-settings.png`) });
    expect(await page.locator('#settings-content').evaluate(node => node.clientHeight), language).toBeGreaterThanOrEqual(90);
    const bounds = await page.locator('.settings-nav [aria-current="true"]').evaluate(node => {
      const rect = node.getBoundingClientRect(), nav = node.parentElement!.getBoundingClientRect();
      return { left: rect.left - nav.left, right: nav.right - rect.right, top: rect.top - nav.top, bottom: nav.bottom - rect.bottom };
    });
    for (const [edge, distance] of Object.entries(bounds)) expect(distance, `${language}: active category ${edge}`).toBeGreaterThanOrEqual(-0.5);
  }
});

test('stops rewriting paused traffic reminders and hides them after leaving driving', async ({ page }) => {
  await page.goto('/?seed=AUDIT-066-WARNING');
  await (await control(page, page.locator('#graphics-preset'))).selectOption('economy');
  await (await control(page, page.locator('#terrain-kind'))).selectOption('meadow');
  await (await control(page, page.locator('#route-style'))).selectOption('0');
  await (await control(page, page.locator('#mountain-height'))).selectOption('range');
  await page.locator('#mountain-min').fill('100'); await page.locator('#mountain-max').fill('100');
  await (await control(page, page.locator('#max-grade'))).fill('0');
  await page.getByRole('button', { name: '应用并返回起点', exact: true }).click();
  await (await control(page, page.locator('#rules-limit'))).fill('20'); await page.locator('#rules-duration').fill('12');
  await (await control(page, page.locator('#interface-language'))).selectOption('en');
  await closeSettings(page); await page.locator('#drive-toggle').click(); await ignite(page);
  await page.keyboard.down('KeyW'); await expect(page.locator('#traffic-warning')).toBeVisible({ timeout: 20000 }); await page.keyboard.up('KeyW');
  await expect(page.locator('#traffic-warning')).toContainText('Traffic reminder:');
  await control(page, page.locator('#rules-limit')); await page.waitForTimeout(300);
  const changes = await page.locator('#traffic-warning').evaluate(async node => {
    let count = 0; const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(node, { subtree: true, childList: true, characterData: true });
    await new Promise(resolve => setTimeout(resolve, 500)); observer.disconnect(); return count;
  });
  expect(changes).toBe(0);
  await closeSettings(page); await page.keyboard.down('Space');
  await expect(page.locator('#vehicle-speed')).toHaveText('0', { timeout: 15000 }); await page.keyboard.up('Space');
  await page.keyboard.press('KeyF'); await expect(page.locator('[data-metric="Travel mode"]')).toHaveText('walking');
  await expect(page.locator('#traffic-warning')).toBeHidden();
});

test('localizes audio failures and invalid preset imports, then recovers sound without reloading', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    let fail = true;
    window.AudioContext = class extends Native {
      constructor() { if (fail) { fail = false; throw new Error('Injected audio creation failure'); } super(); }
    };
  });
  await page.goto('/?seed=AUDIT-066-ERRORS');
  await (await control(page, page.locator('#audio-toggle'))).click();
  for (const [language, audio, preset] of [
    ['en', 'This browser cannot start audio.', 'The file is not valid JSON.'],
    ['ja', 'このブラウザーでは音声を開始できません。', '有効な JSON ファイルではありません。'],
    ['ko', '이 브라우저에서는 오디오를 시작할 수 없습니다.', '올바른 JSON 파일이 아닙니다.'],
    ['es', 'Este navegador no puede iniciar el audio.', 'El archivo no es un JSON válido.'],
  ]) {
    await (await control(page, page.locator('#interface-language'))).selectOption(language);
    await control(page, page.locator('#audio-recover'));
    await expect(page.locator('#audio-status')).toContainText(audio);
    await control(page, page.locator('#preset-import-open'));
    await page.locator('#preset-import').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
    await expect(page.locator('#preset-status')).toContainText(preset);
    if (language !== 'ja') await expect(page.locator('#preset-status')).not.toContainText(/[\u3400-\u9fff]/);
  }
  await (await control(page, page.locator('#interface-language'))).selectOption('zh-CN');
  await (await control(page, page.locator('#audio-recover'))).click();
  await expect(page.locator('#audio-status')).toHaveText('声音已开启');
  await expect(page.locator('#error')).toBeHidden();
  await (await control(page, page.locator('#interface-language'))).selectOption('en');
  await (await control(page, page.locator('#log-recording'))).uncheck();
  await (await control(page, page.locator('#diagnostics-open'))).click();
  await page.locator('#log-clear').click();
  await expect(page.locator('#log-entries')).toHaveText('No logs match the current filter.');
  const changes = await page.locator('#log-status').evaluate(async node => {
    let count = 0; const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(node, { subtree: true, childList: true, characterData: true });
    await new Promise(resolve => setTimeout(resolve, 600)); observer.disconnect(); return count;
  });
  expect(changes).toBe(0);
});
