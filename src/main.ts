import './style.css';
import { Game } from './game/Game';

try {
  const game = new Game();
  if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
} catch (error) {
  const panel = document.getElementById('error');
  if (panel) {
    panel.hidden = false;
    panel.textContent = `无法启动 3D 世界。请使用支持 WebGL2 的桌面浏览器并开启硬件加速。${error instanceof Error ? error.message : String(error)}`;
  }
  console.error(error);
}
