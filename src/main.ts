import './style.css';
import { Game } from './game/Game';
import { ReleaseNotes } from './ui/ReleaseNotes';

const releases = new ReleaseNotes();
if (import.meta.hot) import.meta.hot.dispose(() => releases.dispose());

try {
  const game = new Game();
  if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
} catch (error) {
  const panel = document.getElementById('error');
  if (panel) {
    panel.hidden = false;
    document.getElementById('error-message')!.textContent = `无法启动 3D 世界。请使用支持 WebGL2 的桌面浏览器并开启硬件加速。${error instanceof Error ? error.message : String(error)}`;
    const retry = document.getElementById('retry-world')!;
    retry.textContent = '重新加载页面';
    retry.onclick = () => location.reload();
  }
  console.error(error);
}
