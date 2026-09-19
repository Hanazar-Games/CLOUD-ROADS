import { version } from '../../package.json';
import { element } from '../debug/DebugUI';

const releases = [
  {
    version, title: '桥隧、路灯与晴雨昼夜',
    notes: [
      '桥梁加入纵梁、栏杆扶手和立柱，道路增加金属护栏与近景沥青细节。',
      '路灯按种子分段布置，入夜点亮；新增「灯光路段」入口与路灯开关。',
      '山体覆盖充足的缓弯路段生成可穿行的隧道，高速为左右双洞；配有洞口、内衬、顶灯与侧墙引导带。',
      '新增「隧道入口」；进入洞内后雨线消失、云雾减弱，保留照明与道路标线。',
      '可即时选择晴天、多云、雨天和浓雾，以及清晨、午后、金色时刻、橙色晚霞和夜晚；时刻仍可连续微调。',
      '新增夜空、月亮和雨线，雨天路面更湿润；暂停或打开公告会冻结雨与云的漂移。',
      '切换世界保留天气、时段与路灯偏好，v0.1.5 公告已移入历史。当前仍为无碰撞自由飞行版，暂无车辆、SFX / BGM。',
    ],
  },
  {
    version: '0.1.5', title: '森林、沙漠与双幅高速',
    notes: [
      '新增高山雪岭、森林山谷、沙丘旷野和沙漠峡谷四种地貌选择，山体增加岩层色彩。',
      '加入按种子分布的松树与仙人掌，避开陡坡和道路；植被可随时开关。',
      '可选双向两车道山路或分隔式双向四车道高速，支持 6 / 8 / 10 米车行道，高速按每个方向计算。',
      '道路宽度同步影响标线、路肩、路基和桥梁；高速使用独立双幅桥面与中央护栏。',
      '晚霞与远山薄雾更偏橙金色，切换地貌或道路后保留光照与显示设置。',
      '修复 GitHub Pages 白屏，发布前实际检查子目录下的脚本、样式、Worker 和场景加载。',
      '当前仍为自由飞行开发版；车辆、音效与背景音乐尚未实现。',
    ],
  },
  {
    version: '0.1.4', title: '探索交互与故障恢复',
    notes: [
      '修复失焦、暂停或图形恢复后，按键连发导致意外继续移动的问题。',
      '收起面板或按钮获得焦点后，P 暂停与 F3 调试仍可用；输入编辑与公告保持独立。',
      '地形或图形故障期间停止探索操作，保留公告与恢复入口；重试后保留光照设置。',
      '扩大速度和光照滑杆的操作区域，长公告保持关闭按钮可见，调试面板增加关闭入口。',
      '当前仍为自由飞行开发版；车辆、音效与背景音乐尚未实现。',
    ],
  },
  {
    version: '0.1.3', title: '落日与山影',
    notes: [
      '加入太阳、天空渐变与暖色薄雾，光照可从午后连续调到日落，默认金色时刻。',
      '地形、道路、桥梁和云海共用太阳方向与颜色；附近山体与桥墩会投下随光照变化的影子。',
      '新增光照时刻、望向太阳和山体投影控制，换种子保留光照设置。',
      '统一远山雾与天空的颜色，修复浓云色带与日落光晕的水平断层，保持暂停与图形恢复体验。',
      '当前仍为自由飞行开发版；车辆、植被、音效与背景音乐尚未实现。',
    ],
  },
  {
    version: '0.1.2', title: '穿云与云海',
    notes: [
      '加入按种子生成的起伏云海，支持云下、云中和云上的连续飞行体验。',
      '进入云层后能见度降低，穿出云顶后恢复视野；云与山体、道路和桥梁按深度柔和衔接。',
      '新增「穿云起点」与云层开关，按 Space 上升、Shift 下降；F3 可查看云层高度、密度与雾的范围。',
      '暂停探索或打开公告会停止云的漂移，换种子保留云层开关设置。',
      '当前仍为自由飞行开发版；车辆、日落、音效和背景音乐尚未实现。',
    ],
  },
  {
    version: '0.1.1', title: '稳定性与探索体验修复',
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
