import { bindingActions } from './KeyBindings';

export interface ShortcutContext {
  mode: 'flight' | 'walking' | 'driver' | 'passenger' | 'operator' | 'interior';
  paused?: boolean; modal?: boolean; ready?: boolean; accessing?: boolean; stopped?: boolean;
  board?: boolean; cargo?: boolean; lock?: boolean; leaveSeat?: boolean; sit?: boolean; exit?: boolean;
  glass?: boolean; convertible?: boolean; ev?: boolean; trailer?: boolean; driveReady?: boolean;
  doors?: string; tailgate?: string; auxiliary?: string; crane?: boolean;
}
export function availableShortcuts(s: ShortcutContext): { id: string; label: string; group: string }[] {
  if (s.modal) return [{ id: 'Escape', label: '关闭弹窗', group: '菜单' }];
  const keys = new Map<string, string>();
  const add = (...ids: string[]) => ids.forEach(id => keys.set(id, bindingActions.find(a => a[0] === id)?.[3] ?? id));
  const label = (id: string, text: string) => keys.set(id, text);
  add('KeyM', 'Settings', 'Panel', 'PauseToggle', 'Pause', 'Debug');
  if (!s.paused && s.ready !== false) {
    add('Audio');
    const outside = s.mode === 'flight' || s.mode === 'walking';
    if (outside) {
      if (!s.accessing) {
        for (const [id, text] of [['KeyW', '前进'], ['KeyS', '后退'], ['KeyA', '左移'], ['KeyD', '右移']]) label(id, text);
        add('Space', 'ShiftLeft', 'ShiftRight');
        label('Space', s.mode === 'flight' ? '上升' : '跳跃');
        for (const id of ['ShiftLeft', 'ShiftRight']) label(id, s.mode === 'flight' ? '下降' : '跑步');
        if (s.mode === 'flight') add('ControlLeft', 'ControlRight');
        else {
          label('KeyE', '疾跑'); add('KeyR');
          if (s.board) label('KeyF', '开门上车');
          if (s.cargo) label('CabinWalk', '尾门进入货厢');
          if (s.lock) add('VehicleLock');
        }
      }
    } else if (!s.accessing) {
      const driver = s.mode === 'driver', walking = s.mode === 'interior';
      if (s.exit && s.stopped) label('KeyF', '下到车外');
      if (walking) {
        for (const [id, text] of [['KeyW', '前进'], ['KeyS', '后退'], ['KeyA', '左移'], ['KeyD', '右移']]) label(id, text);
        label('Space', '跳跃（受顶棚限制）');
        if (s.sit) label('CabinWalk', '就近坐下');
      } else {
        add('KeyC', 'ViewReset', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Backspace');
        if (s.leaveSeat && s.stopped) label('CabinWalk', '车内离座');
      }
      add('KeyP', 'KeyL', 'LightPower', 'LightRange', 'FogLights', 'Fridge', 'KeyV');
      if (s.glass) add('KeyB', 'KeyG', 'KeyN', 'KeyK', 'KeyU', 'Comma', 'Period');
      if (s.glass && s.stopped) add('Refill');
      if (s.convertible && s.stopped) add('KeyT');
      for (let i = 0; i < 10; i++) add(`Digit${i}`);
      if (driver) {
        add('Ignition', 'Powertrain', 'KeyQ', 'KeyE', 'KeyH', 'AutoMode', 'AutoSlower', 'AutoFaster');
        label('KeyQ', '左转灯'); label('KeyE', '右转灯'); label('KeyH', '双闪');
        if (s.lock) add('VehicleLock');
        if (s.ev) add('Regeneration'); else add('Transmission', 'BracketLeft', 'BracketRight');
        if (s.trailer) add('TrailerBrake');
        if (s.driveReady) { add('Autopilot', 'KeyR'); label('Space', '按住手刹漂移'); label('KeyW', '油门'); label('KeyS', '制动 / 倒车'); label('KeyA', '左转'); label('KeyD', '右转'); }
        if (s.doors && s.stopped) label('KeyJ', s.doors);
        if (s.tailgate && s.stopped) label('KeyY', s.tailgate);
        if (s.auxiliary) label('KeyI', s.auxiliary);
      }
      if (s.mode === 'operator' && s.crane) {
        add('KeyO', 'KeyZ', 'KeyX');
        for (const [id, text] of [['KeyW', '升吊臂'], ['KeyS', '降吊臂'], ['KeyA', '左回转'], ['KeyD', '右回转'], ['KeyQ', '收吊臂'], ['KeyE', '伸吊臂']]) label(id, text);
      }
    }
  }
  return bindingActions.filter(([id]) => keys.has(id)).map(([id, , group]) => ({ id, label: keys.get(id)!, group }));
}
