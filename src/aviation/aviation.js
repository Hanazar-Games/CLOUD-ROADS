import './aviation.css';
import { AIRCRAFT, AIRCRAFT_PHYSICS_DEFAULTS, AIRCRAFT_PHYSICS_LIMITS, AIRCRAFT_PRESETS, setAircraftPhysics, createAircraftFlight, updateAircraftFlight, recoverAircraftFlight, toggleAircraftGear, toggleAircraftPause, aircraftEnvelope, setAircraftFlaps, toggleAircraftSpeedBrake } from './aircraft-flight.js';
import { AviationWorld, AVIATION_CAMERAS, AVIATION_VIEW_DEFAULTS } from './aviation-world.js';
import { AviationRenderClock } from './aviation-render-clock.js';
import { AVIATION_ENVIRONMENT_DEFAULTS } from './aviation-world.js';
import { AIRCRAFT_CONTROL_DEFAULTS, aircraftInput, smoothAircraftInput, aircraftKeyBinding, aircraftTrimBinding, aircraftTrimInput, aircraftPrecisionActive, aircraftControlHelp, aircraftThrottleShortcut, aircraftSystemShortcut } from './aircraft-controls.js';
import { setText as text, setAttribute, setHidden } from './hud.js';
import { SYSTEM_DEFAULTS, SYSTEM_LIMITS, AUTOBRAKE_MODES, setSystemSettings, setAircraftTrim, setAutopilot, setAutopilotTarget, toggleEngine, toggleParkingBrake, autopilotAvailability, autothrottleAvailability, setAutothrottle, setAutothrottleTarget, setAircraftThrottle, reverseThrustAvailability, toggleReverseThrust, setAutobrake, commandGoAround, AIRCRAFT_SYSTEM_SWITCHES, aircraftElectrical, aircraftSystemAvailability, toggleAircraftSystem, updateAircraftElectrical, engineStartAvailability, restoreAircraftPreflight } from './aircraft-systems.js';

const cameraNames = AVIATION_CAMERAS;
const viewFields = [
  ['cockpitFov', '驾驶舱视场角', 40, 100, 1, 1, '°'],
  ['exteriorFov', '外部视场角', 40, 100, 1, 1, '°'],
  ['chaseDistance', '外部镜头距离', 60, 500, 5, 100, '%'],
  ['chaseHeight', '外部镜头高度', 50, 200, 5, 100, '%'],
  ['orbitAngle', '外部环绕角度', -180, 180, 5, 1, '°'],
  ['followResponse', '跟随响应', 1, 15, 1, 1, '/秒'],
  ['lookAngle', '舱内左右观察幅度', 30, 120, 5, 1, '°'],
  ['lookResponse', '舱内转头响应', 2, 20, 1, 1, '/秒'],
  ['speedFovAmount', '速度扩角幅度', 0, 30, 1, 1, '°'],
];
const cockpitFields = [
  ['seatHeight', '座椅高度', -15, 30, 1, 100, ' cm'],
  ['seatForward', '座椅前后 · 负值向前', -20, 35, 1, 100, ' cm'],
  ['lookPitch', '视线俯仰偏移', -60, 70, 1, 1, '°'],
  ['panelScale', '仪表面板缩放', 80, 110, 1, 100, '%'],
  ['panelHeight', '仪表面板高度', -20, 10, 1, 100, ' cm'],
  ['panelDistance', '仪表面板前后 · 正值靠近', -20, 25, 1, 100, ' cm'],
];
const viewSliders = fields => fields.map(([key, label, min, max, step, scale, unit]) => `<label>${label}<output data-view-value="${key}">${AVIATION_VIEW_DEFAULTS[key] * scale}${unit}</output><input data-view="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${AVIATION_VIEW_DEFAULTS[key] * scale}" aria-label="飞机${label}" aria-describedby="${fields === cockpitFields ? 'av-cockpit-note' : 'av-view-note'}"></label>`).join('');
const environmentFields = [['viewDistance', '远景视距', 30, 160, 5], ['detailDistance', '地景细节目标', 1.5, 12, .5]];
const flapNames = ['收起', '起飞', '着陆'];
const maneuverFields = [['pitchRate', '俯仰速率'], ['rollRate', '滚转速率'], ['yawRate', '方向舵速率'], ['response', '操纵响应'], ['stability', '松手回正辅助'], ['flightPath', '纵向航迹响应'], ['lateralResponse', '横向航迹响应'], ['pitchLimit', '辅助俯仰幅度'], ['bankLimit', '辅助滚转幅度'], ['gravity', '重力强度']];
const powerFields = [['thrust', '发动机推力'], ['engineResponse', '发动机响应'], ['mass', '机体质量'], ['drag', '气动阻力'], ['lift', '升力系数'], ['maxSpeed', '速度上限'], ['airBrake', '空中减速强度'], ['wheelBrake', '轮刹强度'], ['stallAngle', '临界迎角倍率'], ['inducedDrag', '诱导与失速阻力'], ['loadLimit', '气动过载上限']];
const physicsFields = [...maneuverFields, ...powerFields];
const controlFields = [
  ['pitchSensitivity', '俯仰灵敏度', 20, 200, 5, 100, '%'],
  ['rollSensitivity', '滚转灵敏度', 20, 200, 5, 100, '%'],
  ['yawSensitivity', '方向舵灵敏度', 20, 200, 5, 100, '%'],
  ['precisionAuthority', '精细操纵幅度', 10, 80, 5, 100, '%'],
  ['inputRiseTime', '操纵渐进时间', 0, 800, 10, 1000, ' ms'],
  ['inputReturnTime', '松手回中时间', 0, 600, 10, 1000, ' ms'],
  ['deadzone', '摇杆中心死区', 0, 25, 1, 100, '%'],
  ['curve', '摇杆响应曲线', 1, 3, .1, 1, '×'],
  ['throttleRate', '键盘油门变化', 5, 100, 5, 100, '%/秒'],
];
const physicsControls = (fields, note) => fields.map(([key, label]) => {
  const [low, high] = AIRCRAFT_PHYSICS_LIMITS[key].map(value => Math.round(value * 100));
  return `<div class="av-parameter"><label for="av-physics-${key}">${label}<small>${low}–${high}%</small></label><span class="av-parameter-number"><input data-physics-number="${key}" type="number" min="${low}" max="${high}" step="1" value="100" inputmode="numeric" aria-label="${label}百分比" aria-describedby="${note}"><span aria-hidden="true">%</span></span><input id="av-physics-${key}" data-physics="${key}" type="range" min="${low}" max="${high}" step="1" value="100" aria-label="${label}" aria-describedby="${note}"></div>`;
}).join('');
import { FLIGHT_MUSIC as flightMusic } from './aircraft-music.js';
const audioStates = { running: 'running', ready: 'menu', paused: 'paused' };
const apReasons = { status: '飞行已结束', ground: '请先离地', mode: '请切换稳定飞行', electrical: '供电或航电已关闭', engine: '请开启发动机', stall: '空速不足', aoa: '迎角过大，请先卸载恢复', attitude: '请减小俯仰和坡度' };
const apDisconnectReasons = { ...apReasons, manual: '已手动接管', ground: '已接地', mode: '切换自由机动', engine: '发动机关闭', attitude: '姿态超出范围' };
const atReasons = { status: '飞行已结束', ground: '仅在空中保速', electrical: '供电或航电已关闭', engine: '发动机关闭', power: '当前推力为零', envelope: '当前调校没有安全保速区间', brake: '制动或减速板已介入', stall: '空速不足，请手动加油门', aoa: '迎角过大，请先卸载', manual: '手动油门接管' };
const electricalReasons = { status: '当前无法操作', aircraft: '本机没有 APU，使用电池启动', power: '请先接通 BAT 电池供电', avionics: '请恢复供电并接通航电', apu: '客机地面启动需要 APU 就绪；打开辅助动力，等待约 5 秒' };
const reverseReasons = { status: '当前无法操作', aircraft: '本机型不支持反推', ground: '反推仅限接地后使用', engine: '请先启动发动机' };
const autoBrakeNames = { off: '关闭', low: '低档', high: '高档' };
const systemFields = [
  ['trimAuthority', '配平最大作用量', 100, '%'], ['trimRate', '键盘配平速度', 100, '%/秒'], ['apResponse', '自动驾驶响应', 100, '%'],
  ['bankLimit', '自动驾驶最大坡度', 1, '°'], ['climbRate', '目标升降率上限', 1, 'm/s'], ['overrideThreshold', '手动接管阈值', 100, '%'], ['displayBrightness', '驾驶舱仪表亮度', 100, '%'],
  ['speedResponse', '自动油门响应', 100, '%'], ['reversePower', '反推强度', 100, '%'], ['autoBrakeStrength', '自动刹车强度', 100, '%'],
];
const systemControls = () => `<p class="av-system-summary" data-system-value="summary"></p><div class="av-system-buttons" role="group" aria-label="飞机系统开关">
  <button data-system-action="engine" aria-pressed="true">发动机 · K</button><button data-system-action="parking" aria-pressed="false">驻车制动 · N</button>
  <button data-system-action="reverse" aria-pressed="false">反推 · M</button><button data-system-action="autobrake" aria-pressed="false">自动刹车：关闭 · O</button>
  <button data-system-action="go-around">复飞全推力 · Y</button><button data-system-action="trim-reset">配平归零 · T</button>
  <button data-system-action="ap-level" aria-pressed="false">机翼调平 · J</button><button data-system-action="ap-hold" aria-pressed="false">航向 / 高度保持 · H</button>
  <button data-system-action="autothrottle" aria-pressed="false">自动油门保速 · U</button><button data-system-action="ap-off">手动接管 · ⌫</button></div>
  <strong class="av-system-section">电源与辅助系统 · 上方实体开关</strong>
  <div class="av-system-buttons" role="group" aria-label="电源与辅助系统">${Object.entries(AIRCRAFT_SYSTEM_SWITCHES).filter(([, control]) => !control.lighting).map(([action, control]) => `<button data-system-action="${action}" aria-pressed="${['battery', 'generator', 'avionics'].includes(action)}">${control.label} · ${control.name}</button>`).join('')}</div>
  <p class="av-electrical-status" data-system-value="electrical"></p>
  <strong class="av-system-section">外部灯光 · 第二排上方开关</strong>
  <div class="av-system-buttons" role="group" aria-label="飞机外部灯光">${Object.entries(AIRCRAFT_SYSTEM_SWITCHES).filter(([, control]) => control.lighting).map(([action, control]) => `<button data-system-action="${action}" aria-pressed="${['nav-lights', 'beacon-lights'].includes(action)}">${control.label} · ${control.name}</button>`).join('')}</div>
  <p class="av-light-status" data-system-value="lights"></p>
  <details class="av-system-guide"><summary>电源、灯光与起降操作说明</summary>
  <p>默认已启动，可直接起飞。客机地面重启：接通 BAT → 打开 APU → 等待 READY → ENG 启动 → 确认 GEN 供电后关闭 APU。电池和发电机分别供电；关闭供电或航电会熄灭座舱仪表并退出 AP / A/THR，发动机继续运行。电池电量不消耗，未模拟真实机型完整启动程序。</p>
  <p>Y/DAMP 在有航电、离地且未满打方向舵时抑制侧滑；SPLR ARM 在接地、低油门、有供电时自动展开扰流板。TOGA 同时解除预位，防止复飞时再次展开。</p>
  <p>NAV 左红右绿、尾部白灯；BEACON 为红色双闪。LAND 向前照明，TAXI 为较宽的近距照明，收轮后熄灭。灯光需要母线供电，断电保留开关选择，恢复供电后重新点亮；航电开关不影响外灯。</p></details>
  <p class="av-ap-availability" data-system-value="availability"></p>
  <p class="av-ap-availability" data-system-value="power"></p>
  <div class="av-ap-targets"><label>目标航向 °<input data-ap-target="heading" type="number" min="0" max="359" step="1" inputmode="numeric" aria-label="自动驾驶目标航向"></label><label>目标高度 m<input data-ap-target="altitude" type="number" min="0" step="1" inputmode="numeric" aria-label="自动驾驶目标高度"></label><label class="av-speed-target">目标空速 km/h<input data-speed-target type="number" step="1" inputmode="numeric" aria-label="自动油门目标空速，千米每小时"><small data-system-value="speed-range"></small></label></div>
  ${[['pitch', '俯仰 · 低头 / 抬头 · [ / ]'], ['roll', '滚转 · 左 / 右 · , / .'], ['yaw', '方向舵 · 左 / 右 · ; / &#39;']].map(([key, label]) => `<label>${label}<output data-trim-value="${key}">0%</output><input data-trim="${key}" type="range" min="-100" max="100" step="1" value="0" aria-label="${label}配平"></label>`).join('')}
  <p>AP 需稳定模式、足够空速与正常姿态，接通时捕获航向 / 高度；A/THR 独立保速，接通时捕获空速，随后可改目标。手动油门或制动退出 A/THR；推杆达到接管阈值退出 AP。Backspace /「接管」退出两者。自动化不会避开地形，推力不足时无法保证目标空速。</p>
  <p>A/BRK 循环关闭 / 低 / 高，空中待命、着陆后收油门自动轮刹，手动刹车取消待命。REV 仅部分机型接地后可用，油门控制反推大小；起飞前按 M 收起。TOGA 设置全前向油门、收减速板并退出自动化；起落架、襟翼和驻车保持原位，需手动确认。所有操作为游戏简化系统。[ / ] 低头 / 抬头配平，, / . 左右滚转配平，; / &#39; 左右方向舵配平；按住连续调整，T 三轴归零；驻车仅在地面低于 3.6 km/h 接通。</p>`;

export function mountAviation({ audio, unlockAudio, onToggleAudio, onExit, host }) {
  const AIRPORTS = host.world.airports.sites;
  const createFlight = (id, airborne, options = {}) => createAircraftFlight(id, airborne, { runwayIndex: Number($('[data-setting="runway-strip"]').value), ...options, airport: typeof options.airport === 'object' ? options.airport : AIRPORTS.find(site => site.id === options.airport) ?? AIRPORTS[0] });
  const root = document.createElement('main');
  root.id = 'aviation'; root.tabIndex = -1;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'CLOUD ROADS · 飞行');
  root.innerHTML = `
    <div class="av-viewport"></div><div class="av-vignette" aria-hidden="true"></div>
    <header class="av-header"><div class="av-brand"><span>✈</span><div>CLOUD ROADS · 飞行<small>SAME WORLD / FLIGHT</small></div></div><nav aria-label="飞机操作"><button data-action="sound" aria-pressed="false">声音</button><button data-action="systems" aria-expanded="false" aria-controls="av-systems-panel" aria-label="座舱系统面板，快捷键 I">系统 · I</button><button data-action="camera" aria-expanded="false" aria-controls="av-camera-panel">追随机位 ▾</button><button data-action="pause">暂停</button><button data-action="airport">传送机场</button><button data-action="exit">返回地面 ↗</button><button data-action="precision" aria-pressed="false" aria-label="精细操纵切换，按住 Shift 临时启用" title="按住 Shift 临时精细操纵，或点按切换；仅影响三轴操纵">标准操纵</button></nav></header>
    <section id="av-systems-panel" class="av-systems-panel av-help" aria-label="实时座舱系统" hidden><div class="av-camera-heading"><strong tabindex="-1">座舱系统 · 飞行继续运行</strong><button data-action="systems-close" aria-label="关闭座舱系统">×</button></div>${systemControls()}</section>
    <section id="av-camera-panel" class="av-camera-panel" aria-label="飞行镜头" hidden><div class="av-camera-heading"><strong>选择飞行镜头</strong><button data-action="camera-close" aria-label="关闭镜头面板">×</button></div><div class="av-camera-presets" role="group" aria-label="镜头机位">${cameraNames.map((name, mode) => `<button data-camera="${mode}" aria-pressed="${mode === 0}">${name}</button>`).join('')}</div><div class="av-camera-actions"><button data-action="camera-lock" aria-pressed="false">锁定方位 · L</button><button data-action="camera-center">镜头回正 · R</button><button data-action="recover">安全恢复飞行</button></div><p data-value="camera-note">右键拖动环绕，滚轮缩放；触屏拖动画面观察。C 切换九种镜头，V 进出驾驶舱。</p></section>
    <div class="av-instruments" aria-label="飞行仪表"><div><small>空速 <span>KM/H</span></small><strong data-value="speed">0</strong></div><div><small>高度 <span>M</span></small><strong data-value="altitude">0</strong></div><div><small>升降率 <span>M/S</span></small><strong data-value="vertical">0</strong></div><div><small>航向 <span>DEG</span></small><strong data-value="heading">000</strong></div><section class="av-system-status" aria-label="自动驾驶与保速状态"><span data-value="ap-mode">手动飞行</span><span data-value="ap-status"></span><button data-system-action="ap-off" aria-label="退出自动驾驶与自动油门并手动接管，快捷键 Backspace" hidden>接管 ⌫</button></section></div>
    <div class="av-navigation"><small data-value="phase">飞机机库</small><strong data-value="guide">当前世界 · 自由探索</strong><span data-value="target">不限时飞行 · 随时返航与再次起飞</span><span data-value="aero" class="av-aero-readout">迎角 0.0° · 载荷 0.0 G</span><div class="av-attitude" aria-label="姿态仪"><div class="av-horizon"><i></i></div><b aria-hidden="true">— ⌄ —</b></div><span data-value="bank">机翼水平 · 机头水平</span></div>
    <div class="av-flight-tools"><label>油门 <output data-value="throttle">0%</output><input data-control="throttle" type="range" min="0" max="100" value="0" aria-label="飞机油门"><small class="av-engine-readout">发动机输出 <output data-value="engine">0%</output></small></label><div class="av-throttle-presets" role="group" aria-label="快捷油门"><button data-throttle="0" aria-label="油门怠速，快捷键 1">怠速</button><button data-throttle="0.65" aria-label="油门 65%，快捷键 2">65%</button><button data-throttle="1" aria-label="油门全开，快捷键 3">全开</button></div><div class="av-systems"><button data-action="gear" aria-pressed="true">轮：放下</button><button data-action="flaps">襟翼：收起</button><button data-action="speed-brake" aria-pressed="false">减速板：收起</button></div><button data-action="navigation" data-value="progress" aria-pressed="false">自由探索 · 返航导航 ↗</button><div class="av-look" role="group" aria-label="驾驶舱观察方向" hidden><button data-action="look-left" aria-label="驾驶舱向左看">左看</button><button data-action="look-center" aria-label="驾驶舱视线回正">正前</button><button data-action="look-right" aria-label="驾驶舱向右看">右看</button></div></div>
    <div class="av-joystick" aria-label="触屏飞机操纵" role="group"><span>前推降 · 后拉升</span><div class="av-stick-pad"><i class="av-stick-cross"></i><b class="av-stick-knob"></b><small>左 / 右滚转</small></div><div class="av-rudder" role="group" aria-label="按住操作方向舵"><button data-hold="yaw-left" aria-label="按住左方向舵" aria-pressed="false">◀ 左舵</button><button data-hold="yaw-right" aria-label="按住右方向舵" aria-pressed="false">右舵 ▶</button></div></div>
    <button class="av-brake" data-hold="brake" aria-pressed="false">按住制动</button>
    <aside class="av-panel" aria-labelledby="av-panel-title" aria-describedby="av-panel-copy">
      <span class="av-eyebrow">CLOUD ROADS / 自由飞行</span><h1 id="av-panel-title" tabindex="-1">飞机与飞行设置</h1><p id="av-panel-copy">选择机场与飞机，探索当前山地世界。</p>
      <label class="av-runway-choice av-airport-choice">出发机场 <select data-setting="airport">${AIRPORTS.map(site => `<option value="${site.id}">${site.name}</option>`).join('')}</select><small data-value="airport-description"></small></label>
      <div class="av-aircraft-list" role="group" aria-label="选择飞机">${AIRCRAFT.map(aircraft => `<button data-aircraft="${aircraft.id}" aria-pressed="${aircraft.id === 'a380'}"><span class="av-plane-icon" aria-hidden="true">${aircraft.cockpit === 'fighter' ? '➤' : '✈'}</span><span><strong>${aircraft.name}</strong><small>${aircraft.role} · ${aircraft.configuration}</small></span></button>`).join('')}</div>
      <label class="av-training-choice"><input type="checkbox" data-setting="training">显示可选导航环练习</label><p class="av-specs" data-value="specs"></p><p class="av-load-status" role="status" aria-live="polite">正在载入飞机模型…</p>
      <label class="av-runway-choice">出发跑道 <select data-setting="runway-strip"><option value="0">西侧跑道</option><option value="1">东侧跑道</option></select></label>
      <label class="av-runway-choice">起飞方向 <select data-setting="runway"><option value="36">跑道 36 · 向北</option><option value="18">跑道 18 · 向南</option></select><small data-value="runway-dimensions"></small></label>
      <div class="av-panel-actions"><button data-action="resume" hidden>继续飞行</button><button data-action="apron" disabled>机坪登机 · 自行滑行</button><button data-action="runway" disabled>跑道起飞 <span>↗</span></button><button data-action="airborne" disabled>直接空中试飞</button><button data-action="retry" hidden>重试模型加载</button><button data-action="hangar" hidden>更换飞机 / 出发点</button></div>
      <details class="av-help av-system-settings"><summary>座舱系统、配平与自动驾驶</summary>${systemControls()}
      ${systemFields.map(([key, label, scale]) => { const [min, max] = SYSTEM_LIMITS[key].map(value => Math.round(value * scale));return `<label>${label}<output data-system-setting-value="${key}"></output><input data-system-setting="${key}" type="range" min="${min}" max="${max}" step="1" value="${SYSTEM_DEFAULTS[key] * scale}" aria-label="${label}"></label>`; }).join('')}
      <button data-action="systems-reset">恢复系统参数</button><p>跑道起飞沿用预飞的系统开关、APU 进度、油门与配平状态；返回机库重置，直接空中试飞使用已启动状态。系统参数对所有机型共用，仅保留在本次飞机模式。驾驶舱共 22 个按钮可直接点按，或使用实时系统面板。关闭发动机后逐渐失去推力，重新开启仍按发动机响应恢复。</p></details>
      <section class="av-tuning" aria-label="本机调校"><p data-value="tuning-name"></p><div class="av-tuning-presets" role="group" aria-label="应用整套飞机调校">${AIRCRAFT_PRESETS.map(preset => `<button data-flight-preset="${preset.id}" aria-pressed="false">${preset.name}</button>`).join('')}</div><small>预设替换本机整套物理参数；手动调整后显示为自定义。每架飞机分别记录，仅保留在本次飞机模式。</small>
      <dl class="av-performance" aria-label="当前飞机性能参考"><div><dt>速度上限</dt><dd data-value="tune-speed"></dd></div><div><dt>满油门加速参考</dt><dd data-value="tune-acceleration"></dd></div><div><dt>起飞参考</dt><dd data-value="tune-takeoff"></dd></div><div><dt>失速参考</dt><dd data-value="tune-stall"></dd></div><div><dt>着陆速度上限</dt><dd data-value="tune-landing"></dd></div><div><dt>辅助俯仰 / 滚转</dt><dd data-value="tune-limits"></dd></div><div><dt>临界迎角</dt><dd data-value="tune-aoa"></dd></div><div><dt>气动过载上限</dt><dd data-value="tune-load"></dd></div></dl><p data-value="performance-note"></p></section>
      <details class="av-help av-physics" open><summary>动力与气动自定义 · ${powerFields.length} 项</summary>
      ${physicsControls(powerFields, 'av-power-note')}
      <p id="av-power-note">100% 为本机默认值。发动机响应越高，加减推力越快；油门是目标，实际推力逐步跟随。质量改变推重比与惯性；质量、重力、升力共同影响低速门槛。临界迎角越低越易大迎角失速；诱导与失速阻力越高，急转与拉升越损失速度。过载上限限制机翼气动力，不限制机头姿态，也不模拟结构损坏。空中减速作用于制动与减速板，轮刹只作用于地面。所有数值为游戏调校。</p></details>
      <details class="av-help av-physics" open><summary>飞行物理与机动</summary>
      <label>飞行模式<select data-setting="flight-mode"><option value="assisted">稳定飞行 · 姿态辅助</option><option value="maneuver">自由机动 · 滚转 / 筋斗</option></select></label>
      <p data-value="physics-help"></p>
      ${physicsControls(maneuverFields, 'av-physics-note')}
      <p id="av-physics-note">速率改变各轴最大旋转速度，响应改变加减旋转的快慢；回正辅助为 0% 时，松手逐步停止主动旋转并保留倾斜。纵向航迹响应改变升降速度跟随机头的快慢，仍受载荷限制；横向响应 25%–300%，越低越保留原来的前进方向，越高转弯跟随越快。侧滑增加阻力，接地前需将航迹与跑道对齐。质量增大会让航迹响应更慢；大迎角会降低升力与操纵效率。辅助幅度仅用于稳定模式，自由机动不限制整周旋转。</p></details>
      <details class="av-help"><summary>操作与键位</summary><p data-value="keys"></p>
      <p data-value="lateral-keys"></p><p><b>1 / 2 / 3</b> 油门怠速 / 65% / 全开（支持数字小键盘）<br><b>G</b> 起落架 · <b>F</b> 切换三档襟翼 · <b>B</b> 减速板<br><b>Shift</b> 按住精细操纵，或点按顶部「标准操纵」切换<br><b>空格</b> 按住制动 · <b>C</b> 循环九种镜头<br><b>V</b> 驾驶舱 / 上次外部机位 · <b>Z / X</b> 按住左右观察<br><b>L</b> 锁定 / 释放外部方位 · <b>R</b> 镜头回正 · 右键拖动观察，滚轮缩放；触屏可拖动画面观察<br><b>Esc / P</b> 暂停并打开设置</p>
      <p><b>I</b> 实时座舱系统 · <b>K</b> 发动机 · <b>N</b> 驻车制动<br><b>J</b> 机翼调平 · <b>H</b> 航向 / 高度保持<br><b>U</b> 自动油门保速 · <b>Y</b> 复飞全推力<br><b>M</b> 接地反推 · <b>O</b> 自动刹车关闭 / 低 / 高<br><b>Backspace</b> 退出 AP 与 A/THR，手动接管<br><b>[ / ]</b> 低头 / 抬头配平 · <b>, / .</b> 左右滚转配平<br><b>; / &#39;</b> 左右方向舵配平，按住连续调整 · <b>T</b> 三轴归零<br>完整系统参数位于「座舱系统、配平与自动驾驶」。</p>
      <label>键位预设<select data-setting="keys"><option value="flight">经典飞行</option><option value="wasd">WASD 升降</option></select></label><label>升降方向<select data-setting="pitch"><option value="normal">标准</option><option value="inverted">反向</option></select></label>
      <label>滚转与偏航键位<select data-setting="lateral"><option value="roll">A / D 滚转 · Q / E 偏航</option><option value="yaw">A / D 偏航 · Q / E 滚转</option></select></label>
      ${controlFields.map(([key, label, min, max, step, scale]) => `<label>${label}<output data-value="${key}"></output><input data-control-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${AIRCRAFT_CONTROL_DEFAULTS[key] * scale}" aria-label="飞机${label}" aria-describedby="av-controls-note"></label>`).join('')}
      <p id="av-controls-note">WASD 标准方向为 W 前推低头、S 后拉抬头；← / → 始终滚转。三轴灵敏度 20%–200%，同时作用于键盘和触屏，满输入以 100% 封顶。精细操纵在灵敏度后将三轴幅度缩至 10%–80%（默认 40%），适合进近与小幅修正；不影响油门、刹车、配平或手动接管，按住 Shift 临时启用，顶部按钮可保持开启。暂停保留按钮选择，重新起飞或恢复默认关闭。渐进与回中时间为满幅行程用时，作用于三轴键盘与触屏输入，设为 0 直接响应；反向操纵先回中再转向，暂停与切换设置立即清空。死区和响应曲线仅作用于触屏。油门变化为每秒 5%–100%，松手保持；刹车和手动接管立即生效。</p><button data-action="controls-reset">恢复默认操作设置</button>
      <p>手机用左下操纵杆升降与滚转，下方按住左右舵，可同时推杆与用舵；两侧同时按住会抵消。右侧调节油门、襟翼和减速板。起飞前可用起飞襟翼，达到提示速度后拉升，关闭减速板；降落前放轮、放着陆襟翼，降低下降率，接地后油门归零并按住制动。襟翼降低失速速度并增加阻力，超速会自动收起；减速板不代替地面刹车。操作设置对各机型共用，仅保留在本次飞机模式。</p><p data-value="flap-limit"></p></details>
      <details class="av-help av-view-settings"><summary>镜头与视野 · 机位与细调</summary><label>飞行机位<select data-setting="camera-mode">${cameraNames.map((name, mode) => `<option value="${mode}">${name}</option>`).join('')}</select></label>
      ${viewSliders(viewFields)}
      <label>速度扩角<select data-setting="speed-fov"><option value="on">开启</option><option value="off">关闭</option></select></label><button data-action="view-reset">恢复默认镜头参数</button><p id="av-view-note">响应越高，跟随或转头越快。高度、距离和环绕角度作用于外部机位，始终保留机身与地面净空；驾驶舱视场角同步作用于舱内与远景。L 锁定外部观察方位与地平线，位置仍跟随飞机；切换机位、调整镜头参数、回正或重新起飞解除锁定。驾驶舱不使用外部方位锁。</p></details>
      <details class="av-help av-cockpit-settings"><summary>座椅与实体仪表面板 · 6 项调节</summary>${viewSliders(cockpitFields)}<button data-action="cockpit-reset">恢复默认座椅与面板</button><p id="av-cockpit-note">座椅高低、前后与视线改变实际驾驶舱视点；面板缩放、位置同时作用于屏幕、按钮、标签和起落架手柄，点按位置随之同步。外部机位不受影响。调整后继续飞行并按 V 查看；视野被挡时可降低面板或升高座椅。设置对所有机型共用，仅保留在本次飞机模式。</p></details>
      <details class="av-help av-environment-settings"><summary>远景视距与地景 LOD</summary>
      ${environmentFields.map(([key, label, min, max, step]) => `<label>${label}<output data-environment-value="${key}"></output><input data-environment="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${AVIATION_ENVIRONMENT_DEFAULTS[key] / 1000}" aria-label="飞机${label}，千米"></label>`).join('')}
      <label>地面模型精度<select data-setting="ground-detail"><option value="low">低模 · 默认省性能</option><option value="balanced">均衡 · 中等细节</option><option value="high">精细 · 近景高细节</option></select></label><button data-action="environment-reset">恢复默认地景</button><p>默认远景 30 km，可调 30–160 km，沿当前种子地图延伸山地。远处地形与机场使用简模，接近后恢复细节。地景细节目标越小越省性能；超出近景预算的部分仍保留简模。低模不影响飞机、座舱和物理碰撞。</p></details>
      <details class="av-help av-audio-settings"><summary>画面与声音</summary><label>渲染比例上限<select data-setting="quality"><option value="0.5">0.5× · 极省电</option><option value="0.75">0.75× · 省电</option><option value="1">1× · 原生</option><option value="1.25">1.25× · 标准</option><option value="1.75">1.75× · 精细</option><option value="2">2× · 高精细</option></select></label><label>画面帧率上限<select data-setting="frame-limit"><option value="30">30 FPS · 省电</option><option value="45">45 FPS</option><option value="60" selected>60 FPS · 标准</option><option value="90">90 FPS</option><option value="120">120 FPS</option><option value="0">跟随屏幕刷新率</option></select></label><label>舱内仪表刷新<select data-setting="display-hz"><option value="5">5 Hz · 省电</option><option value="10" selected>10 Hz · 标准</option><option value="20">20 Hz · 精细</option></select></label><p>渲染比例不超过设备像素比。降低画面帧率或舱内仪表刷新可减少绘制负担，飞行物理与输入继续独立更新。</p><label>背景音乐 <output data-volume-value="music"></output><input data-volume="music" type="range" min="0" max="100" aria-label="飞机背景音乐音量"></label><label>引擎与音效 <output data-volume-value="sfx"></output><input data-volume="sfx" type="range" min="0" max="100" aria-label="飞机引擎与音效音量"></label><p data-value="audio-status" role="status" aria-live="polite"></p><button data-action="audio-retry" hidden>重新启用声音</button><small>暂停与离开页面时停止声音；失速警报会暂时降低音乐音量。声音设置与山路共用，仅保留在当前页面；画面和飞行设置仅保留在本次飞机模式。机场尺寸与飞行参数为游戏设计，驾驶舱为原创简化内饰。</small></details>
      <details class="av-credits"><summary>模型署名</summary><p>Airbus A380：<a href="https://sketchfab.com/3d-models/singapore-airlines-a380-fd047ccf175c4db5b7e3e400c67c47a0" target="_blank" rel="noopener noreferrer">Singapore Airlines A380</a>，作者 zairiq-zairiq-123-pixar-cars-bfdi，用户提供，<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>。游戏中调整了大小、朝向和起落架显示。</p><p>Su-30：本项目原创简化模型（CC0），依据双发、双垂尾与前翼轮廓制作。</p><p>${AIRCRAFT.filter(aircraft => !['a380', 'su30'].includes(aircraft.id)).map(aircraft => aircraft.name).join('、')}：本项目原创架空机型与简化 GLB，采用 CC0。</p></details>
    </aside>
    <div class="av-notice" role="status" aria-live="polite"></div><footer class="av-footer"><span data-value="aircraft">Airbus A380</span><span data-value="keyhint"></span><span data-value="time">00:00</span></footer>`;
  document.body.append(root);
  const $ = selector => root.querySelector(selector);
  const actions = Object.fromEntries([...root.querySelectorAll('[data-action]')].map(element => [element.dataset.action, element]));
  const action = name => actions[name];
  const values = Object.fromEntries([...root.querySelectorAll('[data-value]')].map(element => [element.dataset.value, element]));
  const panel = $('.av-panel'), loadStatus = $('.av-load-status'), stick = $('.av-stick-pad'), knob = $('.av-stick-knob'), systemPanel = $('.av-systems-panel');
  const systemSettings = { ...SYSTEM_DEFAULTS };
  const systemDetails = $('.av-system-settings');
  const systemViews = [systemPanel, systemDetails].map(element => ({
    element, buttons: [...element.querySelectorAll('[data-system-action]')], trims: [...element.querySelectorAll('[data-trim]')],
    trimOutputs: [...element.querySelectorAll('[data-trim-value]')], targets: [...element.querySelectorAll('[data-ap-target]')],
    speedTarget: element.querySelector('[data-speed-target]'), speedRange: element.querySelector('[data-system-value="speed-range"]'),
    summary: element.querySelector('[data-system-value="summary"]'), availability: element.querySelector('[data-system-value="availability"]'), power: element.querySelector('[data-system-value="power"]'), electrical: element.querySelector('[data-system-value="electrical"]'), lights: element.querySelector('[data-system-value="lights"]'),
  }));
  const trimControls = systemViews.flatMap(view => view.trims), apTargets = systemViews.flatMap(view => view.targets), speedTargets = systemViews.map(view => view.speedTarget);
  const systemStatus = $('.av-system-status'), takeoverButton = systemStatus.querySelector('button');
  const systemFieldsUI = systemFields.map(([key, , scale, unit]) => ({ key, scale, unit, slider: $(`[data-system-setting="${key}"]`), output: $(`[data-system-setting-value="${key}"]`) }));
  const cameraPanel = $('.av-camera-panel'), renderClock = new AviationRenderClock();
  const viewControls = [...viewFields, ...cockpitFields].map(([key, , , , , scale, unit]) => ({ key, scale, unit, slider: $(`[data-view="${key}"]`), output: $(`[data-view-value="${key}"]`) }));
  const environmentControls = environmentFields.map(([key]) => ({ key, slider: $(`[data-environment="${key}"]`), output: $(`[data-environment-value="${key}"]`) }));
  const listeners = new AbortController(), held = new Set();
  const controlSettings = { ...AIRCRAFT_CONTROL_DEFAULTS };
  const holdControls = Object.fromEntries([...root.querySelectorAll('[data-hold]')].map(button => [button.dataset.hold, { button, pointer: null, keys: new Set(), active: false }]));
  const aircraftSettings = Object.fromEntries(AIRCRAFT.map(aircraft => [aircraft.id, { ...AIRCRAFT_PHYSICS_DEFAULTS }]));
  let physicsSettings = aircraftSettings.a380;
  const touchInput = { pitch: 0, roll: 0, yaw: 0, brake: false, precision: false }, input = {}, targetInput = {};
  const audioFrame = { status: 'menu', speed: 0, mission: flightMusic.a380, aircraft: AIRCRAFT[0], maxSpeed: AIRCRAFT[0].maxSpeed, engineOutput: 0, stalling: false };
  let world;
  try { world = new AviationWorld($('.av-viewport'), host); }
  catch (error) { root.remove(); throw error; }
  let flight = createFlight(), loaded = false, disposed = false, graphicsLost = false, returning = false, loadVersion = 0;
  let accumulator = 0, uiTime = 0, dirty = true, stickPointer = null, stickPitch = 0, stickRoll = 0, noticeTimer;
  let frameLimit = 60, lastExterior = 0;
  let cameraDrag = null, suppressCockpitClick = false;
  const listen = (target, event, callback, options = {}) => target.addEventListener(event, callback, { ...options, signal: listeners.signal });
  const disable = (element, disabled) => { if (element.disabled !== disabled) element.disabled = disabled; };
  const setValue = (element, value) => { if (document.activeElement !== element && element.value !== String(value)) element.value = value; };
  let lastAudioStatus;

  function syncAudioStatus() {
    const state = audio.enabled ? audio.context?.state ?? 'locked' : 'muted';
    const music = Math.round(audio.volumes.music * 100), sfx = Math.round(audio.volumes.sfx * 100);
    const status = `${state}/${music}/${sfx}`;
    if (status === lastAudioStatus) return;
    lastAudioStatus = status;
    const retry = action('audio-retry'), focused = document.activeElement === retry;
    retry.hidden = state === 'running' || state === 'muted';
    text(values['audio-status'], state === 'muted' ? '全部声音已静音，点击顶部“已静音”恢复。' : state === 'running' ? `音乐 ${music}% · 引擎 / 音效 ${sfx}%。${music || sfx ? '暂停与离开页面时停止播放。' : '当前音量均为 0%，请调高滑杆。'}` : '浏览器尚未启用声音，请点击“重新启用声音”重试。');
    if (focused && retry.hidden) action('sound').focus({ preventScroll: true });
  }

  function releaseStick() {
    const pointer = stickPointer; stickPointer = null; stickPitch = 0; stickRoll = 0;
    if (pointer !== null && stick.hasPointerCapture(pointer)) stick.releasePointerCapture(pointer);
    knob.style.transform = 'translate(-50%, -50%)';
  }

  function syncHold(control) {
    control.active = control.pointer !== null || control.keys.size > 0;
    control.button.classList.toggle('is-held', control.active);
    control.button.setAttribute('aria-pressed', String(control.active));
  }

  function releaseHold(control, clearKeys = true) {
    const pointer = control.pointer; control.pointer = null;
    if (clearKeys) control.keys.clear();
    if (pointer !== null && control.button.hasPointerCapture(pointer)) control.button.releasePointerCapture(pointer);
    syncHold(control);
  }

  function clearInput() {
    const drag = cameraDrag; cameraDrag = null;
    if (drag && world.renderer.domElement.hasPointerCapture(drag.id)) world.renderer.domElement.releasePointerCapture(drag.id);
    held.clear(); releaseStick();
    for (const control of Object.values(holdControls)) releaseHold(control);
    touchInput.pitch = 0; touchInput.roll = 0; touchInput.yaw = 0; touchInput.brake = false;
    aircraftInput(held, touchInput, controlSettings, input);
    aircraftTrimInput(held, input); syncPrecision();
    world.lookTarget = 0;
  }

  function syncPrecision() {
    const active = aircraftPrecisionActive(held, touchInput);
    setAttribute(action('precision'), 'aria-pressed', active);
    text(action('precision'), active ? `精细 ${Math.round(controlSettings.precisionAuthority * 100)}%` : '标准操纵');
  }

  function togglePrecision() {
    touchInput.precision = !touchInput.precision; syncPrecision(); dirty = true;
  }

  function syncControlHelp() {
    syncPrecision();
    const help = aircraftControlHelp(controlSettings);
    text(values.keys, `${help.throttle} 增减油门 · ${help.pitch} 拉升 / 俯冲`);
    text(values['lateral-keys'], `${help.roll} 或 ← / → 左右滚转 · ${help.yaw} 左右偏航`);
    text(values.keyhint, `${help.throttle} 油门 · ${help.pitch.split(' / ')[0]} 拉升 · ${help.roll} 滚转 · ${help.yaw} 偏航 · V 座舱`);
    $('[data-setting="keys"]').value = controlSettings.preset;
    $('[data-setting="lateral"]').value = controlSettings.lateral;
    $('[data-setting="pitch"]').value = controlSettings.invertPitch ? 'inverted' : 'normal';
    for (const [key, , , , , scale, unit] of controlFields) {
      const value = Math.round(controlSettings[key] * scale * 10) / 10;
      $(`[data-control-setting="${key}"]`).value = value;
      text(values[key], `${value}${unit}`);
    }
    text($('.av-joystick>span'), controlSettings.invertPitch ? '前推升 · 后拉降' : '前推降 · 后拉升');
  }

  function syncSystems() {
    const gearLocked = flight.gearDown && flight.gearPosition >= .999;
    const { engineOn, parkingBrake, trim, autopilot, autothrottle, reverse, autoBrake, autoBrakeActive } = flight.systems;
    const electrical = aircraftElectrical(flight), startReason = engineStartAvailability(flight);
    const editable = !graphicsLost && ['ready', 'running', 'paused'].includes(flight.status);
    const availability = autopilotAvailability(flight), speedHold = autothrottleAvailability(flight), reverseReason = reverseThrustAvailability(flight);
    const active = autopilot.mode !== 'off', automated = active || autothrottle.enabled;
    const minimumSpeed = `${Math.ceil(availability.minimumSpeed * 3.6)} km/h`;
    const unavailable = graphicsLost ? '图形连接已中断' : availability.reason ? `${apReasons[availability.reason]}${availability.reason === 'stall' ? ` · 至少 ${minimumSpeed}` : ''}` : '';
    text(values['ap-mode'], `${autopilot.mode === 'hold' ? 'AP 保持' : active ? 'AP 调平' : autothrottle.enabled ? '手动姿态' : '手动飞行'}${autothrottle.enabled ? ' · A/T' : ''}`);
    text(values['ap-status'], autothrottle.enabled ? `保速 ${Math.round(autothrottle.target * 3.6)} km/h` : autopilot.mode === 'hold' ? `${String((Math.round(autopilot.heading * 180 / Math.PI) % 360 + 360) % 360).padStart(3, '0')}° · ${Math.round(autopilot.altitude)} m` : active ? '俯仰与油门手动' : unavailable || 'AP 可接通');
    const statusMode = active ? autopilot.mode : autothrottle.enabled ? 'speed' : 'off';
    if (systemStatus.dataset.mode !== statusMode) systemStatus.dataset.mode = statusMode;
    const returnFocus = document.activeElement === takeoverButton && !automated;
    setHidden(takeoverButton, !automated);disable(takeoverButton, !editable || !automated);
    if (returnFocus) root.focus({ preventScroll: true });
    const minimum = Math.ceil(speedHold.minimum * 3.6), maximum = Math.floor(speedHold.maximum * 3.6);
    const mode = autopilot.mode === 'hold' ? '航向 / 高度保持' : autopilot.mode === 'level' ? '机翼调平' : '手动飞行';
    for (const view of systemViews) {
      if (view.element === systemPanel ? systemPanel.hidden : panel.hidden || !systemDetails.open) continue;
      for (const button of view.buttons) {
        const name = button.dataset.systemAction;
        const extra = AIRCRAFT_SYSTEM_SWITCHES[name];
        const selected = extra ? flight.systems[extra.key] : name === 'engine' ? engineOn : name === 'parking' ? parkingBrake : name === 'reverse' ? reverse : name === 'autobrake' ? autoBrake !== 'off' : name === 'autothrottle' ? autothrottle.enabled : name === 'ap-level' ? autopilot.mode === 'level' : name === 'ap-hold' ? autopilot.mode === 'hold' : false;
        if (button.hasAttribute('aria-pressed')) setAttribute(button, 'aria-pressed', selected);
        const apSwitch = name === 'ap-level' || name === 'ap-hold';
        disable(button, !editable || (extra && !!aircraftSystemAvailability(flight, name)) || (name === 'engine' && !engineOn && !!startReason) || (name === 'parking' && (!flight.onGround || (!parkingBrake && flight.speed >= 1))) || (apSwitch && !selected && !!unavailable) || (name === 'ap-off' && !automated) || (name === 'reverse' && !reverse && !!reverseReason) || (name === 'autothrottle' && !autothrottle.enabled && !!speedHold.reason) || (name === 'go-around' && !engineOn));
        if (name === 'engine') setAttribute(button, 'title', engineOn ? '关闭发动机，保留油门目标' : electricalReasons[startReason] || '启动发动机');
        if (extra) {
          setAttribute(button, 'title', electricalReasons[aircraftSystemAvailability(flight, name)] || `${selected ? '关闭' : '接通'}${extra.name}${extra.lighting && selected ? !electrical.powered ? ' · 已选择，等待供电' : name === 'taxi-lights' && !gearLocked ? ' · 已选择，等待起落架锁定' : ' · 正在工作' : ''}`);
          if (name === 'apu') text(button, `APU · ${!flight.systems.apuOn ? flight.systems.apuRpm > .01 ? '停机中' : '辅助动力' : electrical.apuReady ? 'READY 已就绪' : `启动 ${Math.round(flight.systems.apuRpm * 100)}%`}`);
        }
        if (apSwitch) setAttribute(button, 'title', selected ? '关闭当前自动驾驶' : unavailable || `接通参考空速 ≥ ${minimumSpeed}`);
        if (name === 'autothrottle') setAttribute(button, 'title', autothrottle.enabled ? '退出保速，保持当前油门' : atReasons[speedHold.reason] || '捕获当前空速并自动调整油门');
        if (name === 'reverse') setAttribute(button, 'title', reverse ? '收起反推，恢复前向推力' : reverseReasons[reverseReason] || '展开反推，油门控制反推大小');
        if (name === 'autobrake') text(button, `自动刹车：${autoBrakeNames[autoBrake]}${autoBrake !== 'off' ? autoBrakeActive ? '制动中' : '待命' : ''} · O`);
      }
      text(view.summary, `${engineOn ? '发动机开启' : '发动机关闭'} · ${parkingBrake ? '驻车锁定' : '驻车释放'} · ${reverse ? '反推展开' : '前向推力'} · ${mode}`);
      text(view.availability, active ? `AP 已接通 · ${autothrottle.enabled ? '自动油门保速' : '油门手动'} · 随时可接管` : `AP：${unavailable || `可接通 · 参考空速 ≥ ${minimumSpeed}`}`);
      text(view.power, `A/THR：${autothrottle.enabled ? `保速 ${Math.round(autothrottle.target * 3.6)} km/h` : atReasons[speedHold.reason] || '可接通'} · REV：${reverse ? '已展开' : reverseReasons[reverseReason] || '可用'}`);
      text(view.electrical, `母线：${electrical.powered ? electrical.generatorOnline ? 'GEN 发电机' : electrical.apuReady ? 'APU 辅助动力' : 'BAT 电池' : '断电'} · 航电：${electrical.avionics ? '工作' : '关闭'} · APU：${electrical.apuReady ? 'READY' : `${Math.round(flight.systems.apuRpm * 100)}%`}${!engineOn && startReason ? ` · 启动条件：${electricalReasons[startReason]}` : ''}`);
      text(view.lights, electrical.powered ? `外灯：${[['navLights', '航行'], ['beaconLights', '防撞'], ['landingLights', '着陆'], ['taxiLights', '滑行']].filter(([key]) => flight.systems[key] && (key !== 'taxiLights' || gearLocked)).map(([, name]) => name).join(' / ') || '全部关闭'}${flight.systems.taxiLights && !gearLocked ? ' · 滑行灯等待起落架锁定' : ''}` : '外灯已断电 · 开关选择保留，恢复供电后点亮');
      for (const slider of view.trims) {
        disable(slider, !editable);setValue(slider, Math.round(trim[slider.dataset.trim] * 100));
      }
      for (const output of view.trimOutputs) text(output, `${Math.round(trim[output.dataset.trimValue] * 100)}%`);
      for (const field of view.targets) {
        disable(field, !editable);setValue(field, field.dataset.apTarget === 'heading' ? (Math.round(autopilot.heading * 180 / Math.PI) % 360 + 360) % 360 : Math.round(autopilot.altitude));
      }
      const field = view.speedTarget;
      disable(field, !editable || minimum > maximum);
      setAttribute(field, 'min', minimum);setAttribute(field, 'max', maximum);
      setValue(field, Math.max(minimum, Math.min(maximum, Math.round(autothrottle.target * 3.6))));
      text(view.speedRange, minimum <= maximum ? `当前调校范围 ${minimum}–${maximum} km/h · 接通时捕获当前空速` : '请先调整升力、质量或速度上限，恢复安全保速区间');
    }
    if (panel.hidden || !systemDetails.open) return;
    for (const { key, scale, unit, slider, output } of systemFieldsUI) {
      const value = Math.round(systemSettings[key] * scale);if (slider.value !== String(value)) slider.value = value;
      text(output, `${value}${unit}`);
    }
  }

  function setSystemPanel(open) {
    if (open && (graphicsLost || flight.status !== 'running')) return;
    const focused = systemPanel.contains(document.activeElement);systemPanel.hidden = !open;
    action('systems').setAttribute('aria-expanded', String(open));
    if (open) { setCameraPanel(false);clearInput();syncSystems();$('.av-systems-panel strong').focus({ preventScroll: true }); }
    else if (focused) action('systems').focus({ preventScroll: true });
  }

  function systemAction(name) {
    if (graphicsLost) return;
    let changed = false;
    if (name === 'gear') { gear();return; }
    if (name === 'flaps') { flaps();return; }
    if (name === 'speed-brake') { speedBrake();return; }
    if (Object.hasOwn(AIRCRAFT_SYSTEM_SWITCHES, name)) {
      changed = toggleAircraftSystem(flight, name);
      const control = AIRCRAFT_SYSTEM_SWITCHES[name];
      notify(changed ? `${control.name}已${flight.systems[control.key] ? '接通' : '关闭'}${name === 'apu' && flight.systems.apuOn ? ' · 等待约 5 秒至 READY' : control.lighting && flight.systems[control.key] ? !aircraftElectrical(flight).powered ? ' · 等待供电' : name === 'taxi-lights' && (!flight.gearDown || flight.gearPosition < .999) ? ' · 等待起落架锁定' : '' : ''}` : electricalReasons[aircraftSystemAvailability(flight, name)]);
    }
    if (name === 'engine') {
      changed = toggleEngine(flight);
      notify(changed ? flight.systems.engineOn ? '发动机已启动 · 发电机接通时提供供电' : `发动机已关闭 · ${flight.aircraft.cockpit === 'airliner' && flight.onGround ? '地面重启需 APU READY' : '重新启动前确认供电'}` : electricalReasons[engineStartAvailability(flight)]);
    }
    if (name === 'parking') changed = toggleParkingBrake(flight);
    if (name === 'reverse') {
      changed = toggleReverseThrust(flight);
      notify(changed ? flight.systems.reverse ? '反推已展开 · 油门控制反推大小，起飞前按 M 收起' : '反推已收起 · 恢复前向推力' : reverseReasons[reverseThrustAvailability(flight)]);
    }
    if (name === 'autobrake') {
      changed = setAutobrake(flight, AUTOBRAKE_MODES[(AUTOBRAKE_MODES.indexOf(flight.systems.autoBrake) + 1) % AUTOBRAKE_MODES.length]);
      if (changed) notify(`自动刹车：${autoBrakeNames[flight.systems.autoBrake]}${flight.systems.autoBrake !== 'off' ? ' · 着陆后收油门自动轮刹，手动刹车取消' : ''}`);
    }
    if (name === 'autothrottle') {
      changed = setAutothrottle(flight, !flight.systems.autothrottle.enabled);
      notify(changed ? flight.systems.autothrottle.enabled ? `自动油门已接通 · 保速 ${Math.round(flight.systems.autothrottle.target * 3.6)} km/h，手动油门可接管` : '自动油门已退出 · 油门交还手动' : `自动油门暂不可用 · ${atReasons[autothrottleAvailability(flight).reason]}`);
    }
    if (name === 'go-around') {
      changed = commandGoAround(flight);
      notify(changed ? `复飞：全前向油门、减速板收起、手动姿态 · 请确认起落架与襟翼${flight.systems.parkingBrake ? '，先释放驻车' : ''}` : '复飞推力不可用 · 请先启动发动机');
    }
    if (name === 'trim-reset') for (const axis of ['pitch', 'roll', 'yaw']) changed = setAircraftTrim(flight, axis, 0) || changed;
    if (name.startsWith('ap-')) {
      if (name === 'ap-off') {
        if (flight.systems.autopilot.mode === 'off' && !flight.systems.autothrottle.enabled) return;
        changed = setAutopilot(flight, 'off');setAutothrottle(flight, false);
      } else {
        const mode = name.slice(3);changed = setAutopilot(flight, flight.systems.autopilot.mode === mode ? 'off' : mode);
      }
      if (!changed) {
        const { reason, minimumSpeed } = autopilotAvailability(flight);
        notify(`自动驾驶暂不可用 · ${apReasons[reason]}${reason === 'stall' ? `，至少 ${Math.ceil(minimumSpeed * 3.6)} km/h` : ''}`);
      }
    }
    if (changed) {
      const takeover = name.startsWith('ap-') && flight.systems.autopilot.mode === 'off';
      audio.event(takeover ? 'ap-disconnect' : 'cockpit-switch');
      if (takeover) notify(`姿态已手动接管 · ${flight.systems.autothrottle.enabled ? '自动油门继续保速' : '油门手动'}`);
      else if (name.startsWith('ap-')) notify(`${flight.systems.autopilot.mode === 'hold' ? '航向 / 高度保持已接通' : '机翼调平已接通，俯仰手动'} · ${flight.systems.autothrottle.enabled ? '自动油门保速' : '油门手动'}`);
      syncSystems();dirty = true;
    }
  }

  function syncPerformance() {
    const envelope = aircraftEnvelope(flight), performance = flight.performance, aircraft = flight.aircraft;
    const speedText = value => `${Math.round(value * 3.6)} km/h`;
    text(values['tune-speed'], speedText(envelope.maxSpeed)); text(values['tune-takeoff'], speedText(envelope.takeoff));
    text(values['tune-stall'], speedText(envelope.stall)); text(values['tune-landing'], speedText(envelope.landing));
    text(values['tune-acceleration'], `${performance.acceleration.toFixed(1)} m/s²`);
    text(values['tune-aoa'], `±${(performance.stallAngle * 180 / Math.PI).toFixed(1)}°`);
    text(values['tune-load'], `±${performance.loadLimit.toFixed(1)} G`);
    text(values['tune-limits'], physicsSettings.mode === 'maneuver' ? '自由机动 · 不限角度' : `${Math.round(performance.pitchLimit * 180 / Math.PI)}° / ${Math.round(performance.bankLimit * 180 / Math.PI)}°`);
    text(values['performance-note'], physicsSettings.thrust === 0 ? '发动机推力为零，可空中试飞练习滑翔；跑道起飞需要增加推力。' : envelope.takeoff > envelope.maxSpeed ? '当前起飞参考超过速度上限，请提高上限或升力，或降低质量 / 重力。' : '低速参考已计入襟翼与坡度；高于参考速度仍可能大迎角失速。过载以当前重力为基准。加速参考未扣空气阻力，实际极速取决于推力与阻力。');
    text(values.specs, `${aircraft.subtitle} · 翼展 ${aircraft.span} m · 起飞参考 ≥ ${speedText(envelope.takeoff)} · 速度上限 ${speedText(envelope.maxSpeed)}`);
  }

  function syncPhysics(forceNumbers = false) {
    Object.assign(physicsSettings, setAircraftPhysics(flight, physicsSettings));
    if (physicsSettings.mode === 'maneuver' && flight.systems.autopilot.mode !== 'off') setAutopilot(flight, 'off');
    $('[data-setting="flight-mode"]').value = physicsSettings.mode;
    for (const [key] of physicsFields) {
      const slider = $(`[data-physics="${key}"]`), number = $(`[data-physics-number="${key}"]`), percent = Math.round(physicsSettings[key] * 100);
      slider.value = percent;
      if (forceNumbers || document.activeElement !== number) { number.value = percent; number.removeAttribute('aria-invalid'); }
      slider.disabled = number.disabled = physicsSettings.mode === 'maneuver' && ['pitchLimit', 'bankLimit'].includes(key);
    }
    let presetName = '自定义调校';
    for (const preset of AIRCRAFT_PRESETS) {
      const selected = Object.keys(AIRCRAFT_PHYSICS_DEFAULTS).every(key => physicsSettings[key] === preset.physics[key]);
      $(`[data-flight-preset="${preset.id}"]`).setAttribute('aria-pressed', String(selected));
      if (selected) presetName = preset.id === 'standard' ? '标准调校' : preset.name;
    }
    text(values['tuning-name'], `${flight.aircraft.name} · ${presetName}`);
    const maneuver = physicsSettings.mode === 'maneuver';
    text(values['physics-help'], `${maneuver ? '自由机动按机体轴持续旋转，可完成滚转、倒飞与筋斗；先爬升留出足够高度。' : '稳定飞行将操纵量转为目标姿态，适合起降与巡航。'} 当前满杆俯仰约 ${Math.round(flight.aircraft.pitchRate * physicsSettings.pitchRate * 180 / Math.PI)}°/s，滚转约 ${Math.round(flight.aircraft.rollRate * physicsSettings.rollRate * 180 / Math.PI)}°/s；低速会减弱。`);
    syncPerformance();
    dirty = true;
  }

  function notify(message) {
    text($('.av-notice'), message); $('.av-notice').classList.add('visible');
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('.av-notice').classList.remove('visible'), 3500);
  }

  function setCameraPanel(open) {
    if (open) setSystemPanel(false);
    const focused = cameraPanel.contains(document.activeElement);
    cameraPanel.hidden = !open;
    action('camera').setAttribute('aria-expanded', String(open));
    if (open) cameraPanel.querySelector(`[data-camera="${world.cameraMode}"]`).focus({ preventScroll: true });
    else if (focused) action('camera').focus({ preventScroll: true });
  }

  function syncCameraUI() {
    text(action('camera'), flight.status === 'ready' ? '预览机位' : `${cameraNames[world.cameraMode]}${world.cameraLocked ? ' · 锁' : ''} ▾`);
    for (const button of cameraPanel.querySelectorAll('[data-camera]')) button.setAttribute('aria-pressed', String(Number(button.dataset.camera) === world.cameraMode));
    action('camera-lock').disabled = world.cameraMode === 2 || world.cameraMode === 8;
    action('camera-lock').setAttribute('aria-pressed', String(world.cameraLocked));
    text(action('camera-lock'), world.cameraLocked ? '释放方位 · L' : '锁定方位 · L');
    text(values['camera-note'], world.cameraMode === 2 ? '右键 / 触屏拖动转头，滚轮调整视角。Z / X 左右观察，R 回正，V 返回外部机位。' : world.cameraLocked ? '方位已锁定，地平线保持水平。镜头位置仍跟随飞机；L 释放，R 回正。' : '右键拖动环绕，滚轮缩放；触屏拖动画面观察。C 切换九种镜头，V 进出驾驶舱。');
    $('[data-setting="camera-mode"]').value = world.cameraMode;
  }

  function chooseCamera(mode) {
    world.setCameraMode(mode);
    if (world.cameraMode !== 2) lastExterior = world.cameraMode;
    syncCameraUI(); updateUI(); dirty = true;
  }

  function centerCamera() {
    world.viewSettings.orbitAngle = 0;
    world.viewSettings.lookPitch = AVIATION_VIEW_DEFAULTS.lookPitch;
    world.setCameraMode(world.cameraMode);
    held.delete('KeyZ'); held.delete('KeyX');
    syncViewSettings(); dirty = true;
  }

  function syncViewSettings() {
    for (const { key, scale, unit, slider, output } of viewControls) {
      slider.value = Math.round(world.viewSettings[key] * scale);
      text(output, `${slider.value}${unit}`);
    }
    $('[data-setting="speed-fov"]').value = world.viewSettings.speedFov ? 'on' : 'off';
    syncCameraUI();
  }

  function syncEnvironmentSettings() {
    for (const { key, slider, output } of environmentControls) {
      slider.value = world.environmentSettings[key] / 1000;text(output, `${slider.value} km`);
    }
    $('[data-setting="ground-detail"]').value = world.environmentSettings.groundDetail;
  }

  function showPanel() {
    const ready = flight.status === 'ready' && !graphicsLost, paused = flight.status === 'paused' && !graphicsLost;
    if (ready) touchInput.precision = false;
    action('precision').disabled = graphicsLost || flight.status !== 'running';
    panel.hidden = flight.status === 'running';
    if (!panel.hidden) syncPerformance();
    if (!panel.hidden) { clearTimeout(noticeTimer); $('.av-notice').classList.remove('visible'); }
    $('.av-aircraft-list').hidden = !ready; for (const choice of root.querySelectorAll('.av-runway-choice')) choice.hidden = !ready; values.specs.hidden = !ready; loadStatus.hidden = !ready;
    action('resume').hidden = !paused;
    action('runway').hidden = !ready; action('airborne').hidden = !ready; action('apron').hidden = !ready;
    action('hangar').hidden = ready || graphicsLost;
    action('retry').hidden = loaded || !ready || loadStatus.dataset.state !== 'error';
    text($('#av-panel-title'), graphicsLost ? '图形连接已中断。' : ready ? '飞机与飞行设置' : '飞行已暂停');
    text($('#av-panel-copy'), graphicsLost ? '请返回地面，待画面恢复后重新登机。' : ready ? '在当前公路世界自由飞行。选择机型与出发位置，随时起飞、着陆和再次起飞；没有倒计时或结束画面。' : '调整操纵、物理和视角后继续飞行，也可更换飞机。');
    text(action('pause'), paused ? '继续' : '设置');
    setCameraPanel(false);setSystemPanel(false);syncCameraUI();syncSystems();renderClock.reset();
    action('camera').disabled = flight.status !== 'running';
    action('systems').disabled = graphicsLost || flight.status !== 'running';
    action('pause').disabled = graphicsLost || !['running', 'paused'].includes(flight.status);
    root.classList.toggle('av-flying', flight.status === 'running');
    for (const element of [$('.av-instruments'), $('.av-navigation'), $('.av-flight-tools'), $('.av-joystick'), $('.av-brake')]) element.inert = !panel.hidden;
    clearInput(); dirty = true;
    if (!panel.hidden) (graphicsLost ? action('exit') : paused ? action('resume') : $('#av-panel-title')).focus({ preventScroll: true });
    else root.focus({ preventScroll: true });
  }

  async function selectAircraft(id) {
    if (graphicsLost) return;
    host.world.airports.selectAircraft(id);
    const version = ++loadVersion;
    physicsSettings = aircraftSettings[id];
    flight = createFlight(id, false, { airport: $('[data-setting="airport"]').value, runwayDirection: $('[data-setting="runway"]').value, physics: physicsSettings, systems: systemSettings }); loaded = false; returning = false;
    syncPhysics();
    text(loadStatus, '正在载入飞机模型…'); loadStatus.dataset.state = 'loading';
    action('runway').disabled = true; action('airborne').disabled = true; action('apron').disabled = true;
    for (const button of root.querySelectorAll('[data-aircraft]')) button.setAttribute('aria-pressed', String(button.dataset.aircraft === id));
    text(values.aircraft, flight.aircraft.name);
    text(values['flap-limit'], `本机襟翼展开上限 ${Math.round(flight.aircraft.flapLimit * 3.6)} km/h；超过上限 18 km/h 自动收起。`);
    world.setCameraMode(0); lastExterior = 0;
    showPanel();
    try {
      const installed = await world.setAircraft(flight.aircraft);
      if (disposed || graphicsLost || version !== loadVersion || !installed) return;
      loaded = true; text(loadStatus, '飞机就绪 · 选择跑道起飞或直接空中试飞'); loadStatus.dataset.state = 'ready';
      action('runway').disabled = false; action('airborne').disabled = false; action('apron').disabled = false; action('retry').hidden = true; dirty = true;
      if (initialBoarding) { initialBoarding = false; start(false, true); chooseCamera(2); }
    } catch (error) {
      if (disposed || graphicsLost || version !== loadVersion || error.name === 'AbortError') return;
      console.error('Unable to load aircraft:', error);
      text(loadStatus, '模型载入失败，请重试或选择另一架飞机。'); loadStatus.dataset.state = 'error';
      action('retry').hidden = false; dirty = true;
    }
  }

  function start(airborne, apron = false) {
    if (!loaded || graphicsLost) return;
    const preflight = flight; touchInput.precision = false;
    flight = createFlight(flight.aircraft.id, airborne, { airport: flight.airport.id, departure: apron ? 'apron' : 'runway', runwayDirection: $('[data-setting="runway"]').value, physics: physicsSettings, systems: systemSettings }); flight.status = 'running'; returning = false;
    if (!airborne && !apron) restoreAircraftPreflight(flight, preflight);
    accumulator = 0; world.setCameraMode(world.cameraMode);
    unlockAudio(); showPanel();
    const help = aircraftControlHelp(controlSettings);
    notify(apron ? '机坪已登机 · N 释放驻车 · 低油门滑行 · Q / E 转向 · 进入跑道再加速' : airborne ? `已进入空中 · ${help.pitch} 升降 · V 进入驾驶舱` : `油门推满，达到 ${Math.round(aircraftEnvelope(flight).takeoff * 3.6)} km/h 后按 ${help.pitch.split(' / ')[0]} 拉升`);
  }

  function pause(onlyPause = false) {
    if (graphicsLost) return;
    if (onlyPause && flight.status !== 'running') return;
    toggleAircraftPause(flight); accumulator = 0;
    audio.setState(flight.status === 'running' ? 'running' : 'paused'); showPanel();
  }

  function gear() {
    if (!toggleAircraftGear(flight)) { notify('地面上保持起落架放下，起飞后再收轮。'); return; }
    audio.event('cockpit-switch');notify(flight.gearDown ? '起落架放下中 · 等待锁定后再着陆' : '起落架收起中 · 阻力随收轮逐渐降低'); dirty = true;
  }

  function flaps() {
    if (!setAircraftFlaps(flight, (flight.flaps + 1) % 3)) { notify(`速度过高，请减至 ${Math.round(flight.aircraft.flapLimit * 3.6)} km/h 以下再放襟翼。`); return; }
    audio.event('cockpit-switch');notify(`襟翼：${flapNames[flight.flaps]} · 当前起飞参考 ${Math.round(aircraftEnvelope(flight).takeoff * 3.6)} km/h`); dirty = true;
  }

  function speedBrake() {
    if (!toggleAircraftSpeedBrake(flight)) return;
    audio.event('cockpit-switch');notify(flight.speedBrake ? '减速板展开 · 起飞前请收起，地面停车仍需按住制动' : '减速板收起'); dirty = true;
  }

  function updateUI() {
    syncPrecision(); syncSystems();
    const RUNWAY = flight.airport.runways[flight.runwayIndex], AIR_GATES = flight.airport.gates;
    $('[data-setting="airport"]').value = flight.airport.id;
    const strip = $('[data-setting="runway-strip"]');
    if (strip.dataset.airport !== flight.airport.id) {
      strip.replaceChildren(...flight.airport.runways.map((runway, index) => new Option(`${runway.north} / ${runway.south} · ${index ? '东侧' : '西侧'} · ${runway.length} m`, index)));
      strip.dataset.airport = flight.airport.id;
    }
    strip.value = flight.runwayIndex;
    text(values['airport-description'], `${flight.airport.description} · 海拔 ${flight.airport.elevation} m`);
    text(values['runway-dimensions'], `${RUNWAY.length.toLocaleString('en-US')} × ${RUNWAY.width} m · 两侧各 ${RUNWAY.shoulder} m 道肩`);
    root.classList.toggle('av-cockpit', world.cameraMode === 2);
    $('.av-look').hidden = world.cameraMode !== 2;
    const envelope = aircraftEnvelope(flight), heading = (flight.heading * 180 / Math.PI + 360) % 360;
    text(values.speed, Math.round(flight.speed * 3.6)); text(values.altitude, Math.round(flight.y));
    text(values.vertical, `${flight.verticalSpeed > 0 ? '+' : ''}${flight.verticalSpeed.toFixed(1)}`);
    text(values.heading, String(Math.round(heading) % 360).padStart(3, '0'));
    text(values.throttle, `${Math.round(flight.throttle * 100)}%`);
    text(values.engine, `${flight.systems.reverse ? 'REV ' : ''}${Math.round(flight.engineOutput * physicsSettings.thrust * 100)}%`);
    text(values.aero, `迎角 ${(flight.angleOfAttack * 180 / Math.PI).toFixed(1)}° · 载荷 ${flight.loadFactor.toFixed(1)} G · 侧滑 ${(flight.sideslip * 180 / Math.PI).toFixed(1)}°`);
    const throttle = $('[data-control="throttle"]');
    setValue(throttle, Math.round(flight.throttle * 100));
    const gearLabel = flight.gearPosition > .001 && flight.gearPosition < .999 ? `${flight.gearDown ? '放轮' : '收轮'} ${Math.round(flight.gearPosition * 100)}%` : flight.gearPosition >= .999 ? '放下锁定' : '已收起';
    text(action('gear'), `轮：${gearLabel}`); setAttribute(action('gear'), 'aria-pressed', flight.gearDown);
    setAttribute(action('gear'), 'aria-label', `起落架${gearLabel}`);
    disable(action('gear'), flight.onGround || flight.status !== 'running');
    text(action('flaps'), `襟翼：${flapNames[flight.flaps]}`); disable(action('flaps'), flight.status !== 'running');
    text(action('speed-brake'), `减速板：${flight.speedBrake ? '展开' : '收起'}`); setAttribute(action('speed-brake'), 'aria-pressed', flight.speedBrake); disable(action('speed-brake'), flight.status !== 'running');
    const training = world.trainingEnabled, home = returning || training && flight.gates === AIR_GATES.length;
    world.navigationHome = home;
    text(values.progress, home ? '返航导航 · 切回探索' : training ? `导航环 ${flight.gates}/6 · 返航 ↗` : '自由探索 · 返航导航 ↗');
    setAttribute(action('navigation'), 'aria-pressed', home);
    disable(action('navigation'), false);
    text(values.time, `${String(Math.floor(flight.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(flight.elapsed % 60)).padStart(2, '0')}`);
    const departing = !flight.hasFlown || flight.throttle > .25 && !flight.systems.reverse;
    text(values.phase, flight.status !== 'running' ? `${flight.airport.name} / FLIGHT DECK` : flight.onGround ? departing ? '跑道滑行 / TAKEOFF' : '着陆滑跑 / ROLLOUT' : flight.stalling ? '失速警告 / STALL' : physicsSettings.mode === 'maneuver' ? '自由机动 / AEROBATICS' : '稳定飞行 / AIRBORNE');
    $('.av-navigation').classList.toggle('av-warning', flight.stalling);
    const gate = !home && training ? AIR_GATES[flight.gates] : null;
    if (flight.onGround) {
      text(values.guide, flight.systems.parkingBrake ? '驻车制动锁定 · 按 N 释放' : !flight.systems.engineOn ? engineStartAvailability(flight) ? '发动机关闭 · 按 I 检查电源与 APU' : '发动机关闭 · 按 K 启动' : flight.systems.reverse ? '反推展开 · 起飞前按 M 收起' : !departing ? flight.systems.autoBrakeActive ? '自动轮刹制动中' : '可以停车滑行，或加油门再次起飞' : flight.speedBrake ? '按 B 收起减速板后再起飞' : flight.speed < envelope.takeoff ? '推满油门，沿中线加速' : '拉升机头，离开跑道');
      const remaining = Math.max(0, Math.cos(flight.heading) >= 0 ? flight.z - RUNWAY.end : RUNWAY.start - flight.z);
      text(values.target, !departing ? `跑道剩余 ${Math.round(remaining)} m · 空格制动 · 再起飞前收反推与减速板` : `起飞 ≥ ${Math.round(envelope.takeoff * 3.6)} km/h · 剩余 ${Math.round(remaining)} m · ${aircraftControlHelp(controlSettings).pitch.split(' / ')[0]} 拉升`);
      if (!flight.airport.runways.some(runway => Math.abs(flight.x - runway.x) <= runway.width / 2 && flight.z >= runway.end && flight.z <= runway.start)) {
        text(values.phase, '机坪与滑行道 / TAXI');
        if (!flight.systems.parkingBrake) text(values.guide, '低油门滑行 · Q / E 控制前轮转向');
        text(values.target, '沿黄色滑行线进入跑道 · 建议低于 55 km/h · 空格轮刹');
      }
    } else if (flight.stalling) {
      const highAngle = Math.abs(flight.angleOfAttack) > flight.performance.stallAngle;
      text(values.guide, highAngle ? '减小迎角幅度，卸载恢复' : '减小坡度，降低机头并加油门');
      text(values.target, highAngle ? `迎角参考 ±${(flight.performance.stallAngle * 180 / Math.PI).toFixed(1)}° · 收减速板，保留恢复高度` : `低速参考 ≥ ${Math.round(envelope.stall * 3.6)} km/h · 襟翼：${flapNames[flight.flaps]}`);
    } else if (gate) {
      const bearing = Math.atan2(gate.x - flight.x, -(gate.z - flight.z));
      const angle = Math.atan2(Math.sin(bearing - flight.heading), Math.cos(bearing - flight.heading)) * 180 / Math.PI;
      text(values.guide, `导航环 ${flight.gates + 1} · ${Math.abs(angle) < 8 ? '保持航向' : `${angle > 0 ? '右转' : '左转'} ${Math.round(Math.abs(angle))}°`}`);
      text(values.target, `距离 ${(Math.hypot(gate.x - flight.x, gate.z - flight.z) / 1000).toFixed(1)} km · 目标海拔 ${Math.round(gate.y)} m · 自由探索无需过环`);
    } else if (home) {
      const bearing = Math.atan2(RUNWAY.x - flight.x, flight.z - RUNWAY.center);
      const angle = Math.atan2(Math.sin(bearing - flight.heading), Math.cos(bearing - flight.heading)) * 180 / Math.PI;
      text(values.guide, `返航机场 · ${Math.abs(angle) < 8 ? '保持航向' : `${angle > 0 ? '右转' : '左转'} ${Math.round(Math.abs(angle))}°`}`);
      text(values.target, `${flight.airport.name} ${(Math.hypot(flight.x - RUNWAY.x, flight.z - RUNWAY.center) / 1000).toFixed(1)} km · 海拔 ${flight.airport.elevation} m · 跑道 ${RUNWAY.length / 1000} km · 放轮锁定后着陆`);
    } else {
      text(values.guide, '自由探索 · 随时着陆或继续远行');
      text(values.target, `已飞行 ${(flight.distance / 1000).toFixed(1)} km · V 驾驶舱 · C 切换机位 · 点击返航导航寻找机场`);
    }
    text(values.bank, `滚转 ${Math.round(flight.roll * 180 / Math.PI)}° · 俯仰 ${Math.round(flight.pitch * 180 / Math.PI)}°`);
    $('.av-horizon').style.transform = `translateY(${flight.pitch * 55}px) rotate(${-flight.roll}rad)`;
    setAttribute(action('sound'), 'aria-pressed', !audio.enabled); text(action('sound'), audio.enabled ? '声音开' : '已静音');
  }

  function dispose() {
    if (disposed) return;
    disposed = true; loadVersion++; clearTimeout(noticeTimer);
    clearInput(); listeners.abort(); audio.setState('menu'); world.dispose(); root.remove(); onExit();
  }

  function setThrottle(value) {
    const automated = flight.systems.autothrottle.enabled;
    if (!setAircraftThrottle(flight, value)) return;
    if (automated) { audio.event('ap-disconnect');notify('自动油门已退出 · 手动油门接管');syncSystems(); }
    dirty = true; unlockAudio();
  }

  listen(root, 'click', event => {
    if (event.target === world.renderer.domElement && flight.status === 'running' && !graphicsLost) {
      if (suppressCockpitClick) { suppressCockpitClick = false; return; }
      const control = world.pickCockpitControl(event.clientX, event.clientY);if (control) systemAction(control);return;
    }
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.systemAction) { systemAction(button.dataset.systemAction);return; }
    if (button.dataset.throttle !== undefined) { setThrottle(Number(button.dataset.throttle)); return; }
    if (button.dataset.camera !== undefined) { chooseCamera(Number(button.dataset.camera)); setCameraPanel(false); root.focus({ preventScroll: true }); return; }
    if (button.dataset.aircraft) { if (button.dataset.aircraft !== flight.aircraft.id) selectAircraft(button.dataset.aircraft); return; }
    if (button.dataset.flightPreset) {
      Object.assign(physicsSettings, AIRCRAFT_PRESETS.find(preset => preset.id === button.dataset.flightPreset).physics);
      clearInput(); syncPhysics(true); return;
    }
    switch (button.dataset.action) {
      case 'exit': dispose(); break;
      case 'airport': start(false, true); chooseCamera(2); break;
      case 'recover': recoverAircraftFlight(flight); world.setCameraMode(world.cameraMode); clearInput(); setCameraPanel(false); notify(flight.reason); dirty = true; root.focus({ preventScroll: true }); break;
      case 'pause': case 'resume': pause(); break;
      case 'runway': start(false); break;
      case 'apron': start(false, true); chooseCamera(2); break;
      case 'airborne': start(true); break;
      case 'gear': gear(); break;
      case 'flaps': flaps(); break;
      case 'speed-brake': speedBrake(); break;
      case 'navigation': returning = !returning; updateUI(); break;
      case 'retry': selectAircraft(flight.aircraft.id); break;
      case 'hangar': flight = createFlight(flight.aircraft.id, false, { airport: flight.airport.id, runwayDirection: $('[data-setting="runway"]').value, physics: physicsSettings, systems: systemSettings }); audio.setState('menu'); world.setCameraMode(0); lastExterior = 0; showPanel(); break;
      case 'systems': setSystemPanel(systemPanel.hidden);break;
      case 'systems-close': setSystemPanel(false);break;
      case 'systems-reset': Object.assign(systemSettings, SYSTEM_DEFAULTS);setSystemSettings(flight, systemSettings);syncSystems();dirty = true;break;
      case 'camera': setCameraPanel(cameraPanel.hidden); break;
      case 'camera-close': setCameraPanel(false); break;
      case 'camera-lock': world.toggleCameraLock(); syncCameraUI(); dirty = true; break;
      case 'camera-center': centerCamera(); break;
      case 'view-reset': for (const [key] of viewFields) world.viewSettings[key] = AVIATION_VIEW_DEFAULTS[key];world.viewSettings.speedFov = AVIATION_VIEW_DEFAULTS.speedFov;world.setCameraMode(world.cameraMode);syncViewSettings();dirty = true;break;
      case 'cockpit-reset': for (const [key] of cockpitFields) world.viewSettings[key] = AVIATION_VIEW_DEFAULTS[key];world.setCameraMode(world.cameraMode);syncViewSettings();dirty = true;break;
      case 'environment-reset': world.setEnvironment(AVIATION_ENVIRONMENT_DEFAULTS);syncEnvironmentSettings();dirty = true;break;
      case 'look-left': world.lookTarget = world.viewSettings.lookAngle * Math.PI / 180; dirty = true; break;
      case 'look-center': world.lookTarget = 0; dirty = true; break;
      case 'look-right': world.lookTarget = -world.viewSettings.lookAngle * Math.PI / 180; dirty = true; break;
      case 'precision': togglePrecision(); break;
      case 'sound': onToggleAudio(); updateUI(); break;
      case 'audio-retry': unlockAudio(); break;
      case 'controls-reset': Object.assign(controlSettings, AIRCRAFT_CONTROL_DEFAULTS); touchInput.precision = false; clearInput(); syncControlHelp(); dirty = true; break;
    }
  });
  listen(root, 'pointerdown', event => {
    if (event.pointerType === 'touch' && !event.isPrimary && event.target.closest('[data-action="precision"]:not(:disabled)')) { event.preventDefault(); togglePrecision(); }
    if (!cameraPanel.hidden && !cameraPanel.contains(event.target) && !event.target.closest('[data-action="camera"]')) setCameraPanel(false);
    if (!systemPanel.hidden && !systemPanel.contains(event.target) && !event.target.closest('[data-action="systems"]')) setSystemPanel(false);
  });
  const canvas = world.renderer.domElement;
  listen(canvas, 'contextmenu', event => event.preventDefault());
  listen(canvas, 'pointerdown', event => {
    if (flight.status !== 'running' || graphicsLost || cameraDrag || !(event.button === 2 || event.pointerType === 'touch' && event.isPrimary)) return;
    cameraDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    suppressCockpitClick = false; canvas.setPointerCapture(event.pointerId);
    if (event.button === 2) event.preventDefault();
  });
  listen(canvas, 'pointermove', event => {
    const drag = cameraDrag;
    if (!drag || event.pointerId !== drag.id || flight.status !== 'running') return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
    if (drag.moved) {
      event.preventDefault(); world.orbitCamera(event.clientX - drag.x, event.clientY - drag.y);
      suppressCockpitClick = event.pointerType === 'touch'; syncViewSettings(); dirty = true;
    }
    drag.x = event.clientX; drag.y = event.clientY;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(canvas, name, event => {
    if (!cameraDrag || event.pointerId !== cameraDrag.id) return;
    cameraDrag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    root.focus({ preventScroll: true });
  });
  listen(canvas, 'wheel', event => {
    if (flight.status !== 'running' || graphicsLost) return;
    event.preventDefault(); world.zoomCamera(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1));
    syncViewSettings(); dirty = true;
  }, { passive: false });
  listen($('[data-setting="training"]'), 'change', event => { world.trainingEnabled = event.target.checked; returning = false; dirty = true; });
  listen(systemDetails, 'toggle', () => { if (systemDetails.open && !panel.hidden) syncSystems(); });
  for (const slider of trimControls) listen(slider, 'input', () => { if (!graphicsLost) setAircraftTrim(flight, slider.dataset.trim, Number(slider.value) / 100);syncSystems();dirty = true; });
  for (const field of apTargets) listen(field, 'change', () => {
    if (!graphicsLost) setAutopilotTarget(flight, field.dataset.apTarget, field.valueAsNumber);
    const key = field.dataset.apTarget;field.value = key === 'heading' ? (Math.round(flight.systems.autopilot.heading * 180 / Math.PI) % 360 + 360) % 360 : Math.round(flight.systems.autopilot.altitude);dirty = true;
  });
  for (const field of speedTargets) listen(field, 'change', () => {
    if (!graphicsLost) setAutothrottleTarget(flight, field.valueAsNumber / 3.6);
    field.value = Math.round(flight.systems.autothrottle.target * 3.6);syncSystems();dirty = true;
  });
  for (const { key, scale, slider } of systemFieldsUI) listen(slider, 'input', () => {
    systemSettings[key] = Number(slider.value) / scale;setSystemSettings(flight, systemSettings);syncSystems();dirty = true;
  });
  listen($('[data-control="throttle"]'), 'input', event => {
    setThrottle(Number(event.target.value) / 100);
  });
  listen($('[data-control="throttle"]'), 'pointerup', () => root.focus({ preventScroll: true }));
  for (const bus of ['music', 'sfx']) {
    const slider = $(`[data-volume="${bus}"]`); slider.value = Math.round(audio.volumes[bus] * 100);
    const output = $(`[data-volume-value="${bus}"]`); text(output, `${slider.value}%`);
    listen(slider, 'input', () => { audio.setVolume(bus, Number(slider.value) / 100); text(output, `${slider.value}%`); unlockAudio(); dirty = true; });
  }
  listen($('[data-setting="flight-mode"]'), 'change', event => {
    physicsSettings.mode = event.target.value; physicsSettings.stability = physicsSettings.mode === 'maneuver' ? 0 : 1;
    clearInput(); syncPhysics();
  });
  for (const [key] of physicsFields) {
    listen($(`[data-physics="${key}"]`), 'input', event => {
      physicsSettings[key] = Number(event.target.value) / 100; syncPhysics(true);
    });
    const number = $(`[data-physics-number="${key}"]`);
    listen(number, 'input', () => {
      const value = number.valueAsNumber;
      if (!Number.isInteger(value) || value < Number(number.min) || value > Number(number.max)) { number.setAttribute('aria-invalid', 'true'); return; }
      number.removeAttribute('aria-invalid'); physicsSettings[key] = value / 100; syncPhysics();
    });
    listen(number, 'change', () => {
      if (Number.isFinite(number.valueAsNumber)) physicsSettings[key] = Math.round(number.valueAsNumber) / 100;
      syncPhysics(true);
    });
  }
  const quality = $('[data-setting="quality"]'); quality.value = world.quality < 1 ? '0.75' : '1.25';
  listen(quality, 'change', () => { world.quality = Number(quality.value); world.resize(); dirty = true; });
  listen($('[data-setting="frame-limit"]'), 'change', event => { frameLimit = Number(event.target.value); renderClock.reset(); dirty = true; });
  listen($('[data-setting="display-hz"]'), 'change', event => { world.displayHz = Number(event.target.value); world.displayTime = 1; dirty = true; });
  for (const { key, slider, output } of environmentControls) listen(slider, 'input', () => {
    world.setEnvironment({ [key]: Number(slider.value) * 1000 });text(output, `${slider.value} km`);dirty = true;
  });
  listen($('[data-setting="ground-detail"]'), 'change', event => { world.setEnvironment({ groundDetail: event.target.value });dirty = true; });
  listen($('[data-setting="runway"]'), 'change', event => {
    if (flight.status !== 'ready') return;
    const preflight = flight;
    flight = createFlight(flight.aircraft.id, false, { airport: flight.airport.id, runwayDirection: event.target.value, physics: physicsSettings, systems: systemSettings });
    restoreAircraftPreflight(flight, preflight);world.resetCamera = true;dirty = true;
  });
  listen($('[data-setting="airport"]'), 'change', event => {
    if (flight.status !== 'ready') return;
    const preflight = flight;
    world.setAirport(event.target.value);
    flight = createFlight(flight.aircraft.id, false, { airport: event.target.value, runwayDirection: $('[data-setting="runway"]').value, physics: physicsSettings, systems: systemSettings });
    restoreAircraftPreflight(flight, preflight);dirty = true;
  });
  listen($('[data-setting="runway-strip"]'), 'change', () => {
    if (flight.status !== 'ready') return;
    const preflight = flight;
    flight = createFlight(flight.aircraft.id, false, { airport: flight.airport.id, runwayDirection: $('[data-setting="runway"]').value, physics: physicsSettings, systems: systemSettings });
    restoreAircraftPreflight(flight, preflight); world.resetCamera = true; dirty = true;
  });
  for (const { key, scale, unit, slider, output } of viewControls) listen(slider, 'input', () => {
    world.viewSettings[key] = Number(slider.value) / scale; text(output, `${slider.value}${unit}`);
    world.setCameraMode(world.cameraMode); syncCameraUI(); dirty = true;
  });
  listen($('[data-setting="camera-mode"]'), 'change', event => chooseCamera(Number(event.target.value)));
  listen($('[data-setting="speed-fov"]'), 'change', event => {
    world.viewSettings.speedFov = event.target.value === 'on';
    world.setCameraMode(world.cameraMode); syncCameraUI(); dirty = true;
  });
  for (const name of ['keys', 'pitch', 'lateral']) listen($(`[data-setting="${name}"]`), 'change', event => {
    if (name === 'keys') controlSettings.preset = event.target.value;
    if (name === 'pitch') controlSettings.invertPitch = event.target.value === 'inverted';
    if (name === 'lateral') controlSettings.lateral = event.target.value;
    clearInput(); syncControlHelp(); dirty = true;
  });
  for (const [key, , , , , scale] of controlFields) listen($(`[data-control-setting="${key}"]`), 'input', event => {
    controlSettings[key] = Number(event.target.value) / scale;
    clearInput(); syncControlHelp(); dirty = true;
  });
  listen(window, 'keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === 'Escape' && !systemPanel.hidden && !event.repeat) { event.preventDefault();setSystemPanel(false);return; }
    if (event.code === 'Escape' && !cameraPanel.hidden && !event.repeat) { event.preventDefault(); setCameraPanel(false); return; }
    if (event.code === 'Tab') {
      const focusable = [...root.querySelectorAll('button, input, select, summary, a[href]')].filter(element => !element.disabled && !element.closest('[inert]') && element.checkVisibility());
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root || document.activeElement === $('#av-panel-title'))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      return;
    }
    if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat && ['running', 'paused'].includes(flight.status)) { event.preventDefault(); pause(); return; }
    if (event.target.closest('input, select, textarea, a, summary, [contenteditable="true"]')) return;
    if (event.target.closest('button') && ['Space', 'Enter'].includes(event.code) && !event.target.closest('[data-hold]')) return;
    if (flight.status !== 'running') return;
    const throttle = aircraftThrottleShortcut(event.code);
    if (aircraftKeyBinding(event.code, controlSettings.preset, controlSettings.lateral) || aircraftTrimBinding(event.code) || ['KeyZ', 'KeyX', 'ShiftLeft', 'ShiftRight'].includes(event.code)) { event.preventDefault(); held.add(event.code); syncPrecision(); }
    else if (!event.repeat && throttle !== undefined) { event.preventDefault(); setThrottle(throttle); }
    else if (!event.repeat && event.code === 'KeyG') { event.preventDefault(); gear(); }
    else if (!event.repeat && event.code === 'KeyF') { event.preventDefault(); flaps(); }
    else if (!event.repeat && event.code === 'KeyB') { event.preventDefault(); speedBrake(); }
    else if (!event.repeat && event.code === 'KeyC') { event.preventDefault(); chooseCamera((world.cameraMode + 1) % cameraNames.length); }
    else if (!event.repeat && event.code === 'KeyV') { event.preventDefault(); chooseCamera(world.cameraMode === 2 ? lastExterior : 2); }
    else if (!event.repeat && event.code === 'KeyL') { event.preventDefault(); world.toggleCameraLock(); syncCameraUI(); dirty = true; }
    else if (!event.repeat && event.code === 'KeyR') { event.preventDefault(); centerCamera(); }
    else if (!event.repeat && event.code === 'KeyI') { event.preventDefault();setSystemPanel(systemPanel.hidden); }
    else if (!event.repeat && aircraftSystemShortcut(event.code)) { event.preventDefault();systemAction(aircraftSystemShortcut(event.code)); }
  });
  listen(window, 'keyup', event => {
    held.delete(event.code); syncPrecision();
    for (const control of Object.values(holdControls)) if (control.keys.delete(event.code)) syncHold(control);
  });
  listen(root, 'focusin', event => {
    if (!event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    held.clear(); aircraftTrimInput(held, input); syncPrecision();
  });
  const moveStick = event => {
    const bounds = stick.getBoundingClientRect(), radius = bounds.width * .36;
    let x = (event.clientX - bounds.left - bounds.width / 2) / radius, y = (event.clientY - bounds.top - bounds.height / 2) / radius;
    const magnitude = Math.max(1, Math.hypot(x, y)); x /= magnitude; y /= magnitude;
    stickRoll = x; stickPitch = y;
    knob.style.transform = `translate(calc(-50% + ${x * radius}px), calc(-50% + ${y * radius}px))`;
  };
  listen(stick, 'pointerdown', event => {
    if (flight.status !== 'running' || stickPointer !== null || event.button > 0) return;
    event.preventDefault(); stickPointer = event.pointerId; stick.setPointerCapture(event.pointerId); moveStick(event); unlockAudio();
  });
  listen(stick, 'pointermove', event => { if (event.pointerId === stickPointer) { event.preventDefault(); moveStick(event); } });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(stick, name, event => { if (event.pointerId === stickPointer) releaseStick(); });
  for (const control of Object.values(holdControls)) {
    const button = control.button;
    listen(button, 'pointerdown', event => {
      if (flight.status !== 'running' || control.pointer !== null || event.button > 0) return;
      event.preventDefault(); control.pointer = event.pointerId; button.setPointerCapture(event.pointerId); syncHold(control); unlockAudio();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(button, name, event => { if (event.pointerId === control.pointer) releaseHold(control, false); });
    listen(button, 'keydown', event => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || !['Space', 'Enter'].includes(event.code) || flight.status !== 'running') return;
      event.preventDefault(); event.stopPropagation(); control.keys.add(event.code); syncHold(control); unlockAudio();
    });
    listen(button, 'blur', () => releaseHold(control));
  }
  listen(window, 'blur', () => pause(true));
  listen(window, 'pagehide', () => pause(true));
  listen(document, 'visibilitychange', () => { if (document.hidden) pause(true); accumulator = 0; });
  listen(window, 'resize', () => { world.resize(); dirty = true; clearInput(); });
  listen(window, 'orientationchange', () => pause(true));
  listen(world.renderer.domElement, 'webglcontextlost', event => {
    event.preventDefault(); graphicsLost = true; loaded = false; world.loadController?.abort();
    if (flight.status === 'running') toggleAircraftPause(flight);
    accumulator = 0; audio.setState('paused'); showPanel();
    action('resume').disabled = true; action('runway').disabled = true; action('airborne').disabled = true; action('apron').disabled = true;
  });

  function update(dt) {
    if (disposed) return;
    dt = Math.max(0, Math.min(dt, .1));
    if (!document.hidden) {
      if (flight.status === 'running') {
        touchInput.pitch = stickPitch; touchInput.roll = stickRoll;
        touchInput.yaw = Number(holdControls['yaw-right'].active) - Number(holdControls['yaw-left'].active);
        touchInput.brake = holdControls.brake.active;
        aircraftInput(held, touchInput, controlSettings, targetInput);
        aircraftTrimInput(held, input);
        accumulator += dt;
        while (accumulator >= 1 / 60 && flight.status === 'running') {
          smoothAircraftInput(input, targetInput, controlSettings, 1 / 60);
          updateAircraftFlight(flight, input, 1 / 60); accumulator -= 1 / 60;
          if (flight.events.includes('ap-disconnect') || flight.events.includes('at-disconnect')) {
            const disconnected = [];
            if (flight.events.includes('ap-disconnect')) disconnected.push(`自动驾驶已退出 · ${apDisconnectReasons[flight.systems.autopilot.reason]}`);
            if (flight.events.includes('at-disconnect')) disconnected.push(`自动油门已退出 · ${atReasons[flight.systems.autothrottle.reason]}`);
            audio.event('ap-disconnect');notify(disconnected.join('；'));
          }
          for (const event of flight.events) {
            if (event === 'gate' && world.trainingEnabled) { audio.event('gate'); notify(`通过导航环 ${flight.gates} / 6 · 可继续自由飞行`); }
            if (event === 'takeoff') { audio.event('glide'); notify('已离地 · 按 G 收起起落架'); }
            if (event === 'gear-locked' || event === 'gear-retracted') { audio.event(event);notify(event === 'gear-locked' ? '起落架已放下锁定 · 请保持安全进近速度与下降率' : '起落架已完全收起'); }
            if (event === 'flaps-limit') { audio.event('cockpit-switch');notify('襟翼超过安全速度，已自动收起。'); }
            if (event === 'touchdown') { audio.event('land', flight.touchdownSpeed); notify(`成功接地 · 下降率 ${flight.touchdownSpeed.toFixed(1)} m/s${flight.events.includes('spoilers-deployed') ? ' · 扰流板已自动展开' : ''} · 油门归零，按住制动`); }
            if (event === 'spoilers-deployed' && !flight.events.includes('touchdown')) { audio.event('cockpit-switch');notify('扰流板自动展开 · 已接地且油门低于 15%'); }
            if (event === 'recovery') { audio.event('land', 4); clearInput(); world.setCameraMode(world.cameraMode); notify(flight.reason); dirty = true; }
          }
        }
      } else {
        accumulator = 0;
        if (!graphicsLost && flight.status === 'ready' && flight.systems.apuRpm !== Number(flight.systems.apuOn)) {
          updateAircraftElectrical(flight, dt);if (uiTime > .08) dirty = true;
        }
      }
      uiTime += dt;
      if (dirty || (flight.status === 'running' && uiTime > .08)) { updateUI(); uiTime = 0; }
      audioFrame.status = graphicsLost ? 'paused' : audioStates[flight.status]; audioFrame.speed = flight.speed; audioFrame.mission = flightMusic[flight.aircraft.id];
      audioFrame.aircraft = flight.aircraft; audioFrame.maxSpeed = flight.performance.maxSpeed;
      audioFrame.engineOutput = flight.engineOutput * physicsSettings.thrust; audioFrame.stalling = flight.stalling;
      audio.update(audioFrame);
      syncAudioStatus();
      const look = held.has('KeyZ') || held.has('KeyX') ? (Number(held.has('KeyZ')) - Number(held.has('KeyX'))) * world.viewSettings.lookAngle * Math.PI / 180 : null;
      if (!graphicsLost) {
        const renderDt = renderClock.tick(dt, flight.status === 'running' ? frameLimit : Math.min(frameLimit || 30, 30), dirty);
        if (renderDt !== null) world.render(flight, renderDt, look);
      }
      dirty = false;
    }
  }
  let initialBoarding = !!host.departure?.apron;
  if (host.departure?.airport) { $('[data-setting="airport"]').value = host.departure.airport; world.setAirport(host.departure.airport); }
  syncControlHelp(); syncViewSettings(); syncEnvironmentSettings(); selectAircraft(host.departure?.aircraft ?? host.world.airports.aircraftId);
  return { dispose, update };
}
