import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : ['--enable-webgl'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(process.argv[2] || 'http://127.0.0.1:5173');
  await page.waitForFunction(() => document.querySelector('[data-metric="Road ready"]')?.textContent === 'yes');
  await page.waitForFunction(() => document.querySelector('[data-metric="Pending / queued"]')?.textContent === '0 / 0');
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
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
