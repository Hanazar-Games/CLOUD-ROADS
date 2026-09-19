import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : ['--enable-webgl'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const driving = process.argv.includes('--drive');
  await page.goto(process.argv.slice(2).find(arg => /^https?:/.test(arg)) || 'http://127.0.0.1:5173');
  if (process.argv.includes('--far')) await page.locator('#view-distance').selectOption('16');
  await page.waitForFunction(() => document.querySelector('[data-metric="Road ready"]')?.textContent === 'yes');
  await page.waitForFunction(() => document.querySelector('[data-metric="Pending / queued"]')?.textContent === '0 / 0');
  const route = process.argv.find(arg => arg.startsWith('--route='))?.slice(8);
  const highway = process.argv.includes('--highway');
  if (route || highway) {
    if (route) await page.locator('#route-style').selectOption(route);
    if (highway) await page.locator('#road-type').selectOption('highway');
    await page.getByRole('button', { name: '应用并返回起点' }).click();
    if (route) await page.waitForFunction(style => document.querySelector('[data-metric="Route style"]')?.textContent === style,
      { natural: '自然山路', winding: '蜿蜒盘山路', cliff: '峡谷挂壁公路' }[route]);
    if (highway) await page.waitForFunction(() => document.querySelector('[data-metric="Road layout"]')?.textContent === '双向四车道');
    await page.waitForFunction(() => document.querySelector('[data-metric="Road ready"]')?.textContent === 'yes');
    await page.waitForFunction(() => document.querySelector('[data-metric="Pending / queued"]')?.textContent === '0 / 0');
  }
  if (driving) {
    await page.locator('#drive-toggle').click();
    await page.waitForTimeout(500);
    await page.waitForFunction(() => document.querySelector('[data-metric="Pending / queued"]')?.textContent === '0 / 0');
  }
  await page.locator('#world').focus();
  await page.keyboard.down('KeyW');
  const result = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const intervals = [], longTasks = [];
    const observer = new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration)));
    observer.observe({ type: 'longtask' });
    let previous;
    await new Promise((resolve) => {
      const start = performance.now();
      const frame = (time) => {
        if (previous !== undefined) intervals.push(time - previous);
        previous = time;
        if (time - start < 10_000) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    observer.disconnect();
    const sorted = [...intervals].sort((a, b) => a - b);
    return {
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      resolution: `${canvas.width}×${canvas.height}`,
      fps: Math.round(intervals.length * 1000 / intervals.reduce((a, b) => a + b)),
      frameMs: { p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) },
      longTasksOver50ms: longTasks.filter((duration) => duration > 50),
      telemetry: Object.fromEntries([...document.querySelectorAll('[data-metric]')].map((node) => [node.dataset.metric, node.textContent])),
    };
  });
  await page.keyboard.up('KeyW');
  console.log(JSON.stringify({ mode: driving ? 'driving' : 'flight', ...result }, null, 2));
} finally {
  await browser.close();
}
