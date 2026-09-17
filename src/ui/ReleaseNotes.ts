import { version } from '../../package.json';
import { element } from '../debug/DebugUI';

const releases = [
  {
    version, title: '稳定性与探索体验修复',
    notes: [
      '修复快速飞行时地面海拔、雪线与坐标不同步的问题。',
      '修复编辑种子后继续移动、飞行快捷键冲突和图形恢复后的按键残留。',
      '改进地形生成失败后的资源回收，支持重试当前世界。',
      '优化小窗口控制面板，增加暂停、面板收起与版本公告入口。',
      '当前为开发者自由飞行版本；车辆、音效和背景音乐尚未实现。',
    ],
  },
  {
    version: '0.1.0', title: '无限山地开发基线',
    notes: [
      '历史补录：旧版本没有独立公告，本条依据开发记录整理。',
      '实现种子地形、分块流式加载、LOD、浮动原点、山路与混凝土桥梁。',
      '加入山谷、森林、岩石、高山与雪区地表配色，以及位置相关的雪线。',
      '提供自由相机、道路观察视角与 F3 调试信息。',
    ],
  },
];

export class ReleaseNotes {
  private readonly events = new AbortController();

  constructor() {
    const button = element<HTMLButtonElement>('release-open');
    const dialog = element<HTMLDialogElement>('release-notes');
    button.textContent = `v${version} · 公告`;
    element('release-current').replaceChildren();
    element('release-history').replaceChildren();
    for (const [index, release] of releases.entries()) {
      const section = element(index === 0 ? 'release-current' : 'release-history');
      const heading = document.createElement('h3');
      heading.textContent = `v${release.version} · ${release.title}`;
      const list = document.createElement('ul');
      for (const note of release.notes) {
        const item = document.createElement('li');
        item.textContent = note;
        list.append(item);
      }
      const article = document.createElement('article');
      article.append(heading, list);
      section.append(article);
    }
    button.addEventListener('click', () => {
      if (document.pointerLockElement) document.exitPointerLock();
      dialog.showModal();
    }, { signal: this.events.signal });
  }

  dispose(): void {
    this.events.abort();
    element<HTMLDialogElement>('release-notes').close();
  }
}
