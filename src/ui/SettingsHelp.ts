import { graphicsControls, graphicsLabel } from '../game/GraphicsSettings';

const explanations: Record<string, string> = {
  'master-volume': '控制所有游戏声音。0% 会停止音频输出；声音测试也受此项控制。',
  'sfx-volume': '同时调整车辆、环境、交通和设备声音；不改变背景音乐与独立测试音。',
  'music-volume': '控制车载电台与背景音乐总音量，不改变驾驶音效。',
  'horn-focus': '鸣笛时压低音乐与环境声的比例。0% 不压低背景，本车和 NPC 喇叭的音量另行调整。',
  'cabin-isolation': '关窗时减少车外环境声。开窗、开门或打开敞篷会减弱隔音效果。',
  'music-ducking': '加速或碰撞时给音效让出空间；越高音乐暂时越轻，松油门后逐渐恢复。',
  'terrain-follow': '越高越倾向沿自然山势布线，减少不必要的高桥。最大坡度、弯道与地形仍会限制路线。应用世界设置后生效。',
  'bridge-height': '普通路线规划的目标桥高，不是硬上限；谷地跨度与道路坡度约束可能使实际桥更高。应用世界设置后生效。',
  'render-scale': '改变 3D 渲染分辨率，界面保持清晰。200% 约需绘制四倍像素；卡顿时优先降低。',
  'road-texture': '提高路面纹理清晰度会增加显存占用；远景由缩小纹理自动过滤。低配可选较低分辨率。',
  'road-relief': '控制路面凹凸着色细节；关闭可减少像素计算，不改变道路碰撞或抓地力。',
  'road-filtering': '提高斜视远处路面的清晰度；越高纹理采样成本越高，实际档位受显卡上限限制。',
  'model-load-budget': '每帧用于生成精细车辆模型的目标时间。较低可减少生成尖峰，但替换粗模更慢；单个模型不可中断。',
  'model-preload-distance': '提前生成附近车辆精模的距离。较大减少接近时的模型切换，但增加提前计算与缓存需求。',
  'terrain-upload-budget': '限制每帧处理地形上传的目标时间；较低更平稳，但地块补齐更慢，单块上传可能超出预算。',
  'terrain-upload-limit': '每帧最多上传的地块数，同时受上传时间预算限制。低配可降低以分散加载负担。',
  'terrain-preload': '沿前进方向提前准备地形；较大适合高速驾驶，但需要更多内存与生成工作。',
  'steering-directness': '0% 完全渐进打舵，100% 按键立即给出目标转向；中间值混合两者。高速建议保持较低。',
  'steering-response': '渐进转向部分接近目标的速度；越高打方向越快。即时转向权重为 100% 时此项影响很小。',
  'steering-assist-strength': '调节高速转向限幅强度；越高高速越稳定、转弯半径越大，需开启随速度增大转弯半径。',
  'turning-radius': '自定义低速转弯半径，需开启自定义选项。越小转弯越急，高速辅助仍可能扩大实际半径。',
  'road-grip': '基础路面抓地力，雨雪与路外表面会继续修正。较低更易侧滑；关闭漂移后仍抑制横向侧滑。',
  'drift-min-speed': '主动手刹漂移的最低车速，越高越不容易误触发；低于此速度仍能用手刹减速。',
  'drift-delay': '持续按住手刹多久才允许进入主动漂移，增大可避免短按导致侧滑。',
};

export function parameterExplanation(input: HTMLInputElement): string {
  const body = input.dataset.help ?? explanations[input.id]
    ?? (input.id.endsWith('-volume') ? '独立调整这一声音层，0% 静音；仍受总音量及所属的音乐或音效总线控制。' : '');
  const range = (graphicsControls as readonly string[]).includes(input.id) ? `默认：${graphicsLabel(input.id, Number(input.defaultValue))}。滑动时上方显示实际档位。`
    : `默认 ${input.defaultValue}；范围 ${input.min}–${input.max}，步长 ${input.step || 1}。单位见上方读数。`;
  return `${body}${body ? ' ' : ''}${range}`;
}
