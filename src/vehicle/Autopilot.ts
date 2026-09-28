import type { RoadSpine } from '../road/RoadSpine';
import { roadProfile } from '../road/RoadProfile';
import type { WorldOptions } from '../world/WorldOptions';
import type { VehicleInput, VehiclePhysics } from './VehiclePhysics';

export interface AutopilotSettings { mode: 'full' | 'speed' | 'steering'; comfort: number; minKmh: number; maxKmh: number }
export type PilotRoute = { id: string; road: RoadSpine };
export const pilotModes = { full: '速度与方向', speed: '仅控制速度', steering: '仅控制方向' };
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));

export class Autopilot {
  settings: AutopilotSettings = { mode: 'full', comfort: 3, minKmh: 20, maxKmh: 80 };
  active = false;
  targetKmh = 0;
  status = '待机';
  private routeId = '';
  private direction = 1;
  private offset = 0;
  private laneWidth = 4;
  private throttle = 0;

  configure(settings: AutopilotSettings): void {
    if (!Object.hasOwn(pilotModes, settings.mode) || !Number.isInteger(settings.comfort) || settings.comfort < 1 || settings.comfort > 5
      || !Number.isFinite(settings.minKmh) || !Number.isFinite(settings.maxKmh) || settings.minKmh < 0 || settings.maxKmh > 160
      || settings.maxKmh < 10 || settings.minKmh > settings.maxKmh) throw new Error('舒适度为 1–5 档，巡航范围 0–160 km/h，最高速度至少 10 且不能低于最低速度。');
    if (settings.mode !== this.settings.mode) this.cancel('控制模式已改变，请重新开启');
    this.settings = { ...settings };
  }

  cancel(reason = '已退出'): void { this.active = false; this.throttle = 0; this.targetKmh = 0; this.status = reason; }

  engage(car: VehiclePhysics, routes: readonly PilotRoute[], options: Readonly<WorldOptions>): boolean {
    this.cancel();
    if (car.ignition !== 'running' || car.speed < -0.1) { this.status = '请先点火并停止倒车'; return false; }
    if (car.drifting || car.handbrake > 0.05) { this.status = '请先松开手刹并恢复抓地'; return false; }
    const profile = roadProfile(options);
    const candidates = routes.flatMap(route => {
      const sample = route.road.nearest(car.x, car.z);
      return sample ? [{ route, sample, error: Math.hypot(car.x - sample.position.x, car.z - sample.position.z) + Math.abs(car.y - sample.position.y - car.profile.radius - car.profile.rest) * 3 }] : [];
    }).sort((a, b) => a.error - b.error);
    const match = candidates[0]; if (!match) { this.status = '等待道路'; return false; }
    const { route, sample } = match, lateral = (car.x - sample.position.x) * Math.cos(sample.heading) + (car.z - sample.position.z) * Math.sin(sample.heading);
    const direction = Math.cos(car.heading - sample.heading) >= 0 ? 1 : -1;
    const lanes = profile.lanes.filter(l => l.direction === (options.oneWay ? 1 : direction));
    const offsets = lanes.map(l => l.offset * (options.oneWay && route.id === 'back' ? -1 : 1));
    const offset = offsets.sort((a, b) => Math.abs(a - lateral) - Math.abs(b - lateral))[0];
    if (offset === undefined || options.oneWay && direction !== (route.id === 'back' ? -1 : 1)
      || Math.abs(lateral - offset) > profile.laneWidth / 2 || Math.abs(angle(car.heading - sample.heading - (direction < 0 ? Math.PI : 0))) > 0.65
      || match.error > profile.outerHalfWidth + 3 || car.profile.width + 0.15 > profile.laneWidth) {
      this.status = '请驶入足够宽的同向车道并摆正车身'; return false;
    }
    this.routeId = route.id; this.direction = direction; this.offset = offset; this.laneWidth = profile.laneWidth;
    this.active = true; this.status = '沿当前路线巡航'; return true;
  }

  update(dt: number, car: VehiclePhysics, routes: readonly PilotRoute[], obstacles: readonly VehiclePhysics[], manual: VehicleInput, grip: number): VehicleInput {
    if (!this.active) return manual;
    const speedControl = this.settings.mode !== 'steering', steeringControl = this.settings.mode !== 'speed';
    if (manual.handbrake || manual.throttle < 0 || speedControl && manual.throttle > 0 || steeringControl && manual.steer !== 0) {
      this.cancel('驾驶员已接管'); return manual;
    }
    if (car.drifting) { this.cancel('车辆正在侧滑，请接管'); return manual; }
    if (car.ignition !== 'running' || car.speed < -0.2 || car.jackknifed) { this.cancel('车辆状态改变，请接管'); return { ...manual, handbrake: true }; }
    let route = routes.find(r => r.id === this.routeId), near = route?.road.nearest(car.x, car.z);
    if (route && near && this.direction < 0 && near.distance < 8 && ['root', 'back'].includes(route.id)) {
      const next = routes.find(r => r.id === (route!.id === 'root' ? 'back' : 'root'));
      if (next?.road.segments.length) {
        route = next; this.routeId = next.id; this.direction = 1; this.offset *= -1; near = next.road.nearest(car.x, car.z);
      }
    }
    if (!route || !near || Math.abs(car.y - near.position.y - car.profile.radius - car.profile.rest) > 4) {
      this.cancel('路线不可用，请接管'); return { ...manual, handbrake: true };
    }
    const lateral = (car.x - near.position.x) * Math.cos(near.heading) + (car.z - near.position.z) * Math.sin(near.heading);
    if (steeringControl && Math.abs(lateral - this.offset) > this.laneWidth * 0.85) {
      this.cancel('偏离车道，请接管'); return { ...manual, handbrake: true };
    }
    if (!steeringControl) this.offset = lateral;
    const reverse = this.direction < 0 && ['root', 'back'].includes(route.id) ? routes.find(r => r.id === (route!.id === 'root' ? 'back' : 'root')) : undefined;
    const sampleAt = (d: number) => {
      if (d < 0 && reverse) {
        const p = reverse.road.segments.find(s => s.start.distance <= -d && s.end.distance >= -d)?.atDistance(-d);
        return p && { ...p, heading: p.heading + Math.PI, curvature: -p.curvature, grade: -p.grade };
      }
      return route!.road.segments.find(s => s.start.distance <= d && s.end.distance >= d)?.atDistance(d);
    };
    const comfort = this.settings.comfort, decel = Math.max(0.6, Math.min(car.profile.brake * car.brakeScale, 3.5 - comfort * 0.35) * clamp(grip, 0.2, 1));
    const lateralAccel = Math.min(3.2 - comfort * 0.4, 9.81 * car.profile.width / (2 * car.profile.cg) * 0.3) * clamp(grip, 0.2, 1);
    const remaining = this.direction > 0 ? route.road.segments.at(-1)!.end.distance - near.distance
      : near.distance + (reverse?.road.segments.at(-1)?.end.distance ?? -route.road.segments[0].start.distance);
    let target = Math.min(car.maxSpeed, (this.settings.maxKmh - (this.settings.maxKmh - this.settings.minKmh) * (comfort - 1) * 0.06) / 3.6);
    this.status = '沿当前路线巡航';
    for (let d = 0; d < Math.max(100, car.speed ** 2 / (2 * decel) + 40); d += 8) {
      const p = sampleAt(near.distance + d * this.direction); if (!p) break;
      const curvature = Math.abs(p.curvature / Math.max(0.3, 1 - p.curvature * this.offset));
      const corner = Math.sqrt(lateralAccel / Math.max(0.0001, curvature));
      const gradeLimit = 28 / (1 + Math.abs(p.grade) * 8);
      target = Math.min(target, Math.sqrt(Math.min(corner, gradeLimit) ** 2 + 2 * decel * Math.max(0, d - 12)));
    }
    if (remaining < car.speed ** 2 / (2 * decel) + 45) this.status = '道路边界 · 减速等待';
    target = Math.min(target, Math.sqrt(2 * decel * Math.max(0, remaining - car.profile.length - 12)));
    let gap = Infinity, leadSpeed = 0;
    for (const other of obstacles) {
      if (other === car || Math.hypot(other.x - car.x, other.z - car.z) > 300) continue;
      for (const body of other.bodies()) {
        const center = (body.front + body.rear) / 2, x = body.x + Math.sin(body.heading) * center, z = body.z - Math.cos(body.heading) * center;
        const p = route.road.nearest(x, z); if (!p || Math.abs(body.y - p.position.y - other.profile.radius - other.profile.rest) > 4) continue;
        const side = (x - p.position.x) * Math.cos(p.heading) + (z - p.position.z) * Math.sin(p.heading);
        const heading = p.heading + (this.direction < 0 ? Math.PI : 0), turn = body.heading - heading;
        const half = (body.front - body.rear) / 2;
        if (Math.abs(side - this.offset) > car.profile.width / 2 + Math.abs(Math.cos(turn)) * other.profile.width / 2 + Math.abs(Math.sin(turn)) * half + 0.4) continue;
        const distance = (p.distance - near.distance) * this.direction;
        if (distance <= 0) continue;
        const clearance = distance - car.profile.chassisLength / 2 - Math.abs(Math.cos(turn)) * half - Math.abs(Math.sin(turn)) * other.profile.width / 2 - 4;
        if (clearance < gap) { gap = clearance; leadSpeed = Math.max(0, other.speed * Math.cos(turn)); }
      }
    }
    if (gap < Infinity) {
      target = Math.min(target, Math.max(0, gap / (1.2 + comfort * 0.35)), Math.sqrt(leadSpeed ** 2 + 2 * decel * Math.max(0, gap)));
      if (gap < car.speed * (2 + comfort * 0.4) + 15) this.status = '前方车辆 · 跟随 / 停车';
      if (gap < 3 && leadSpeed < 0.5) target = 0;
    }
    this.targetKmh = target * 3.6;
    if (target * 3.6 < this.settings.minKmh && this.status === '沿当前路线巡航') this.status = '弯道 / 坡道 · 低于最低巡航偏好';
    const look = clamp(5 + car.speed * (0.45 + comfort * 0.04) + car.wheelbase * 0.3, 6, 25);
    const point = sampleAt(near.distance + this.direction * Math.min(look, Math.max(0, remaining - 0.1))) ?? near;
    const dx = point.position.x + Math.cos(point.heading) * this.offset - car.x, dz = point.position.z + Math.sin(point.heading) * this.offset - car.z;
    const cross = dx * Math.cos(car.heading) + dz * Math.sin(car.heading);
    const steer = clamp(Math.atan(2 * car.wheelbase * cross / Math.max(4, dx * dx + dz * dz)) / car.steeringLock, -1, 1);
    const desired = clamp((target - car.speed) * 0.65 + Math.max(0, near.grade * this.direction) * 2.5, -1, 1);
    this.throttle += clamp(desired - this.throttle, -dt * 3, dt * (1.6 - comfort * 0.22));
    if (gap < Math.max(2, car.speed ** 2 / Math.max(1, car.profile.brake * car.brakeScale * grip * 1.5))) this.throttle = -1;
    return { throttle: speedControl ? car.speed < 0.1 && this.throttle < 0 ? 0 : this.throttle : manual.throttle,
      steer: steeringControl ? steer : manual.steer, handbrake: speedControl && target < 0.25 && car.speed < 0.5 };
  }
}
