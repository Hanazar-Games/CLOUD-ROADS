export const bindingActions = [
  ['KeyW', 'KeyW', '驾驶 / 移动', '油门 / 前进 / 升吊臂'], ['KeyS', 'KeyS', '驾驶 / 移动', '制动与倒车 / 后退 / 降吊臂'],
  ['KeyA', 'KeyA', '驾驶 / 移动', '左转 / 左移 / 吊车左回转'], ['KeyD', 'KeyD', '驾驶 / 移动', '右转 / 右移 / 吊车右回转'],
  ['Space', 'Space', '驾驶 / 移动', '按住手刹漂移 / 跳跃 / 飞行上升'], ['ShiftLeft', 'ShiftLeft', '驾驶 / 移动', '跑步 / 飞行下降（左键）'],
  ['ShiftRight', 'ShiftRight', '驾驶 / 移动', '跑步 / 飞行下降（右键）'], ['ControlLeft', 'ControlLeft', '驾驶 / 移动', '飞行加速（左键）'],
  ['ControlRight', 'ControlRight', '驾驶 / 移动', '飞行加速（右键）'], ['Ignition', 'Backquote', '驾驶 / 移动', '点火 / 熄火'],
  ['KeyF', 'KeyF', '驾驶 / 移动', '安全上下车'], ['KeyR', 'KeyR', '驾驶 / 移动', '回到道路'],
  ['BracketLeft', 'BracketLeft', '驾驶 / 移动', '手动降挡'], ['BracketRight', 'BracketRight', '驾驶 / 移动', '手动升挡'],
  ['Powertrain', 'Shift+KeyI', '驾驶 / 移动', '切换燃油 / 电动动力'], ['Regeneration', 'Shift+KeyN', '驾驶 / 移动', '电动能量回收 0–3 档'],
  ['TrailerBrake', 'Shift+KeyH', '车型操作', '挂车独立制动开关'],
  ['Transmission', 'Shift+KeyT', '驾驶 / 移动', '自动 / 手动变速箱'],
  ['Autopilot', 'Semicolon', '自动驾驶', '开启 / 退出自动驾驶'], ['AutoMode', 'Quote', '自动驾驶', '切换控制模式（同时退出）'],
  ['AutoSlower', 'Minus', '自动驾驶', '最高巡航速度 −5 km/h'], ['AutoFaster', 'Equal', '自动驾驶', '最高巡航速度 +5 km/h'],
  ['KeyL', 'KeyL', '设备', '自动 / 关 / 近光 / 远光'], ['LightPower', 'Shift+KeyL', '设备', '车灯亮度循环'],
  ['LightRange', 'Shift+KeyB', '设备', '车灯距离循环'], ['KeyQ', 'KeyQ', '设备', '左转灯 / 收吊臂'],
  ['FogLights', 'Shift+KeyF', '设备', '前后雾灯开关'],
  ['VehicleLock', 'Shift+KeyJ', '设备', '锁车 / 近车解锁'], ['Fridge', 'Shift+KeyU', '设备', '车载冷藏箱开关'],
  ['KeyE', 'KeyE', '设备', '右转灯 / 伸吊臂 / 步行疾跑'], ['KeyH', 'KeyH', '设备', '双闪'],
  ['KeyB', 'KeyB', '设备', '雨刮模式'], ['KeyG', 'KeyG', '设备', '玻璃水喷洗'], ['Refill', 'Shift+KeyG', '设备', '停车补充玻璃水'],
  ['Comma', 'Comma', '设备', '按住升窗'], ['Period', 'Period', '设备', '按住降窗'], ['KeyN', 'KeyN', '设备', '空调风机 0–6 档'],
  ['KeyK', 'KeyK', '设备', '氛围灯'], ['KeyU', 'KeyU', '设备', '阅读灯'], ['KeyT', 'KeyT', '设备', '低速开关敞篷'],
  ['KeyV', 'KeyV', '设备', '按住鸣笛'], ['Audio', 'Shift+KeyV', '设备', '声音开启 / 静音'],
  ['KeyJ', 'KeyJ', '车型操作', '驾驶室 / 乘客门'], ['KeyY', 'KeyY', '车型操作', '尾门 / 行李舱 / 坡板'],
  ['KeyI', 'KeyI', '车型操作', '尾翼 / 警示灯 / 洒水泵 / 驻车支架'], ['KeyO', 'KeyO', '车型操作', '操作席启动 / 收起吊车'],
  ['KeyZ', 'KeyZ', '车型操作', '收起吊钩'], ['KeyX', 'KeyX', '车型操作', '放下吊钩'],
  ['KeyC', 'KeyC', '视角 / 座椅', '切换驾驶视角'], ['ViewReset', 'Shift+KeyC', '视角 / 座椅', '视角回正'],
  ['KeyP', 'KeyP', '视角 / 座椅', '座位地图'], ['PageUp', 'PageUp', '视角 / 座椅', '升高座椅'], ['PageDown', 'PageDown', '视角 / 座椅', '降低座椅'],
  ['ArrowUp', 'ArrowUp', '视角 / 座椅', '座椅前移'], ['ArrowDown', 'ArrowDown', '视角 / 座椅', '座椅后移'],
  ['ArrowLeft', 'ArrowLeft', '视角 / 座椅', '座椅左移'], ['ArrowRight', 'ArrowRight', '视角 / 座椅', '座椅右移'],
  ['Home', 'Home', '视角 / 座椅', '靠背直立'], ['End', 'End', '视角 / 座椅', '靠背后仰'], ['Backspace', 'Backspace', '视角 / 座椅', '重置座椅'],
  ['KeyM', 'KeyM', '菜单', '操作菜单'], ['Panel', 'Shift+KeyM', '菜单', '载具面板'], ['Settings', 'Shift+KeyP', '菜单', '旅程设置'],
  ['PauseToggle', 'Slash', '菜单', '暂停 / 继续'], ['Pause', 'Pause', '菜单', '暂停 / 继续（备用）'], ['Debug', 'Backslash', '菜单', '调试信息'],
  ...Array.from({ length: 10 }, (_, i) => [`Digit${i}`, `Digit${i}`, '电台', `频道 ${i || 10}`]),
] as readonly (readonly string[])[];

const valid = (key: string) => /^(Shift\+)?(Key[A-Z]|Digit[0-9]|F([2-9]|10)|Space|Comma|Period|Slash|Semicolon|Quote|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|PageUp|PageDown|Home|End|Arrow(Up|Down|Left|Right)|Backspace|Pause|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(key);
export const keyLabel = (key: string): string => key.replace(/Key|Digit/g, '').replace('Comma', '，').replace('Period', '。')
  .replace('Backquote', '·').replace('Backslash', '反斜杠').replace('Slash', '/').replace('Semicolon', ';').replace('Quote', "'").replace('BracketLeft', '[').replace('BracketRight', ']').replace('Minus', '−').replace('Equal', '=');

export class KeyBindings {
  private values: Record<string, string> = Object.fromEntries(bindingActions.map(([id, key]) => [id, key]));
  snapshot(): Record<string, string> { return { ...this.values }; }
  label(id: string): string { return keyLabel(this.values[id] ?? id); }
  resolve(code: string, shift: boolean): string | undefined {
    const entries = Object.entries(this.values), chord = shift ? entries.find(([, key]) => key === `Shift+${code}`) : undefined;
    return (chord ?? entries.find(([, key]) => key === code))?.[0];
  }
  bind(id: string, key: string): void { this.load({ ...this.values, [id]: key }); }
  reset(): void { this.values = Object.fromEntries(bindingActions.map(([id, key]) => [id, key])); }
  load(data: unknown): void {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('按键数据无效。');
    const values = data as Record<string, string>;
    if (Object.keys(values).length !== bindingActions.length || !bindingActions.every(([id]) => typeof values[id] === 'string' && valid(values[id])))
      throw new Error('请选择字母、数字、功能键或 Shift 组合；Esc、Tab 及系统组合键保留。');
    if (new Set(Object.values(values)).size !== bindingActions.length) throw new Error('此按键已被占用，请先为原操作换一个按键。');
    this.values = { ...values };
  }
  format(text: string): string {
    return text.replace(/(?<![A-Za-z0-9°])(?:\{(?:Ignition|PauseToggle|Debug|FogLights|VehicleLock|Fridge)\}|[A-Z]|PageUp|PageDown|Home|End|Backspace|Space)(?![A-Za-z0-9])/g,
      (key: string, index: number) => key === 'L' && /\d\s?$/.test(text.slice(0, index)) ? key : this.label(key.startsWith('{') ? key.slice(1, -1) : key.length === 1 ? `Key${key}` : key));
  }
}
