import './style.css';
import { Game } from './game/Game';
import { ReleaseNotes } from './ui/ReleaseNotes';
import { runtimeLog } from './debug/RuntimeLog';
import { exportRuntimeLog } from './debug/DebugUI';
import { LanguageSettings } from './i18n/LanguageSettings';

const stopCapture = runtimeLog.capture(window);
const exportError = () => exportRuntimeLog();
document.getElementById('error-export-log')!.addEventListener('click', exportError);
runtimeLog.write('info', 'app', 'Starting CLOUD ROADS.');
if (import.meta.hot) import.meta.hot.dispose(() => {
  stopCapture(); document.getElementById('error-export-log')?.removeEventListener('click', exportError);
});
const releases = new ReleaseNotes();
if (import.meta.hot) import.meta.hot.dispose(() => releases.dispose());

try {
  const game = new Game();
  if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
} catch (error) {
  runtimeLog.write('error', 'startup', error);
  const panel = document.getElementById('error');
  if (panel) {
    panel.hidden = false;
    for (const id of ['world', 'explorer']) document.getElementById(id)!.inert = true;
    (document.getElementById('controls-toggle') as HTMLButtonElement).disabled = true;
    document.getElementById('notice')!.textContent = '3D 世界未启动 · 请重新加载页面';
    document.getElementById('error-message')!.textContent = `无法启动 3D 世界。请使用支持 WebGL2 的桌面浏览器并开启硬件加速。${error instanceof Error ? error.message : String(error)}`;
    const retry = document.getElementById('retry-world')!;
    retry.textContent = '重新加载页面';
    retry.onclick = () => location.reload();
    panel.focus();
  }
  console.error(error);
}

const language = new LanguageSettings();
if (import.meta.hot) import.meta.hot.dispose(() => language.dispose());
