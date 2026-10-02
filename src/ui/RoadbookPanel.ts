import { element } from '../debug/DebugUI';
import { buildRoadbook, travelDirection, type Roadbook, type RoadbookEvent, type RoadbookSource, type RoutePoint } from '../road/Roadbook';

interface RoadbookContext { source: RoadbookSource; revision: number; current?: RoutePoint; heading: number; context: string; location: string }
const names = { bridge: '桥梁', tunnel: '隧道', service: '服务区', pass: '山间垭口', junction: '道路互通' };
const symbols = { bridge: '桥', tunnel: '隧', service: '休', pass: '垭', junction: '岔' };
const distanceLabel = (distance: number) => distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(2)} km`;
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
};

export class RoadbookPanel {
  private readonly dialog = element<HTMLDialogElement>('roadbook-dialog');
  private readonly events = new AbortController();
  private nextUpdate = 0;
  private range = 3000;
  private reverse = false;
  private last = '';
  private samples?: readonly RoutePoint[];

  constructor(private readonly snapshot: () => RoadbookContext) {
    const options = { signal: this.events.signal };
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-roadbook-range]').forEach(button => {
      button.addEventListener('click', () => {
        this.range = Number(button.dataset.roadbookRange);
        this.dialog.querySelectorAll('[data-roadbook-range]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        this.update(true);
      }, options);
    });
    element('roadbook-reverse').addEventListener('click', () => {
      this.reverse = !this.reverse; element('roadbook-reverse').setAttribute('aria-pressed', String(this.reverse)); this.update(true);
    }, options);
  }

  update(force = false): void {
    if (!force && (!this.dialog.open || performance.now() < this.nextUpdate)) return;
    this.nextUpdate = performance.now() + 750;
    const state = this.snapshot(), { current } = state;
    const direction = current ? travelDirection(state.heading, current.heading) * (this.reverse ? -1 : 1) as 1 | -1 : 1;
    const signature = JSON.stringify([state.revision, state.context, state.location, current?.distance, current?.position, current?.grade, current?.heading, direction, this.range]);
    if (!force && this.samples === state.source.samples && this.last === signature) return;
    this.samples = state.source.samples; this.last = signature;
    const book = current && buildRoadbook(state.source, current, direction, this.range);
    element('roadbook-context').textContent = state.context;
    element('roadbook-empty').hidden = !!book;
    element('roadbook-content').hidden = !book;
    element('roadbook-status').textContent = !book ? '路线正在加载，路书会在道路就绪后出现。'
      : `${this.reverse ? '反向查看' : '沿当前行进方向'} · ${state.location} · ${book.partial ? `本段已加载 ${distanceLabel(book.length)}，边界外暂未预览` : `前方 ${distanceLabel(book.length)}`}`;
    if (!book || !current) return;
    element('roadbook-altitude').textContent = `${Math.round(current.position.y)} m`;
    element('roadbook-grade').textContent = `${current.grade * direction >= 0 ? '+' : ''}${(current.grade * direction * 100).toFixed(1)}%`;
    element('roadbook-climb').textContent = `↑ ${Math.round(book.ascent)} / ↓ ${Math.round(book.descent)} m`;
    element('roadbook-steepest').textContent = `${book.maxGrade.toFixed(1)}%`;
    element('roadbook-chainage').textContent = `当前支路里程 ${(current.distance / 1000).toFixed(2)} km`;
    this.draw(book, current.heading + (direction < 0 ? Math.PI : 0));
    element('roadbook-places').replaceChildren(...book.events.map(event => this.place(event)));
    element('roadbook-no-places').hidden = !!book.events.length;
    element('roadbook-profile-summary').textContent = `海拔 ${Math.floor(book.minElevation)}–${Math.ceil(book.maxElevation)} m · 横轴为沿路距离 · 高度独立缩放`;
  }

  private place(event: RoadbookEvent): HTMLLIElement {
    const li = document.createElement('li'), icon = document.createElement('span'), text = document.createElement('div');
    li.dataset.kind = event.kind; icon.className = 'roadbook-icon'; icon.textContent = symbols[event.kind]; icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('strong'), detail = document.createElement('small'), distance = document.createElement('b');
    name.textContent = names[event.kind]; distance.textContent = event.inside ? '当前位置' : distanceLabel(event.ahead);
    detail.textContent = event.kind === 'bridge' || event.kind === 'tunnel'
      ? !event.endKnown ? '连续路段 · 出口尚未探明' : `${event.inside ? '距出口' : '路段长'} ${distanceLabel(event.remaining!)}`
      : event.kind === 'service' ? '沿线设施 · 请按实际标线驶入' : event.kind === 'pass' ? '翻越山脊 · 留意下坡' : '沿线分流 · 驶入后更新路线';
    text.append(name, detail); li.append(icon, text, distance); return li;
  }

  private draw(book: Roadbook, heading: number): void {
    const start = book.points[0].position, sin = Math.sin(heading), cos = Math.cos(heading);
    const local = book.points.map(p => {
      const dx = p.position.x - start.x, dz = p.position.z - start.z;
      return [dx * cos + dz * sin, -dx * sin + dz * cos];
    });
    const xs = local.map(p => p[0]), ys = local.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(388 / Math.max(100, maxX - minX), 240 / Math.max(100, maxY - minY));
    const map = local.map(([x, y]) => [240 + (x - (minX + maxX) / 2) * scale, 156 + (y - (minY + maxY) / 2) * scale]);
    const low = Math.floor(book.minElevation / 10) * 10 - 10, high = Math.max(low + 40, Math.ceil(book.maxElevation / 10) * 10 + 10);
    const profile = book.points.map(p => [52 + p.ahead / Math.max(1, book.length) * 840, 108 - (p.position.y - low) / (high - low) * 82]);
    const path = (points: number[][]) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const strokes = (points: number[][]) => book.points.slice(1).map((p, i) => svg('path', { d: path([points[i], points[i + 1]]), class: `roadbook-line ${p.kind}` }));
    const mapLayer = element('roadbook-map-route'); mapLayer.replaceChildren(svg('path', { d: path(map), class: 'roadbook-halo' }), ...strokes(map));
    const profileLayer = element('roadbook-profile-route');
    profileLayer.replaceChildren(svg('path', { d: `${path(profile)} L${profile.at(-1)![0]},108 L52,108 Z`, class: 'roadbook-area' }), ...strokes(profile));
    const occupied = [map[0], map.at(-1)!];
    for (const event of book.events) {
      const index = book.points.reduce((best, p, i) => Math.abs(p.ahead - event.ahead) < Math.abs(book.points[best].ahead - event.ahead) ? i : best, 0);
      const [anchorX, y] = map[index];
      const x = [0, 30, -30, 60, -60, 90, -90, 120, -120].map(offset => anchorX + offset)
        .find(x => x >= 18 && x <= 462 && occupied.every(([ox, oy]) => Math.hypot(x - ox, y - oy) >= 28)) ?? anchorX;
      occupied.push([x, y]);
      const marker = svg('g', { class: `roadbook-marker ${event.kind}` }), title = svg('title', {});
      title.textContent = `${names[event.kind]} · ${event.inside ? '当前位置' : distanceLabel(event.ahead)}`;
      const text = svg('text', { x, y: y + 4, 'text-anchor': 'middle' }); text.textContent = symbols[event.kind];
      marker.append(title, svg('path', { d: `M${anchorX},${y} H${x}`, class: 'roadbook-leader' }), svg('circle', { cx: x, cy: y, r: 12 }), text); mapLayer.append(marker);
      profileLayer.append(svg('circle', { cx: profile[index][0], cy: profile[index][1], r: 4, class: `roadbook-dot ${event.kind}` }));
    }
    const [x, y] = map[0];
    mapLayer.append(svg('path', { d: `M${x},${y - 10} l-7,17 7,-4 7,4 Z`, class: 'roadbook-position' }));
    const [endX, endY] = map.at(-1)!;
    if (book.length > 0) mapLayer.append(svg('circle', { cx: endX, cy: endY, r: 5, class: 'roadbook-end' }));
    element('roadbook-profile-high').textContent = `${high} m`; element('roadbook-profile-low').textContent = `${low} m`;
    element('roadbook-profile-end').textContent = distanceLabel(book.length);
    element('roadbook-profile-mid').textContent = distanceLabel(book.length / 2);
    element('roadbook-map').setAttribute('aria-label', `当前方向朝上的路线图，预览 ${distanceLabel(book.length)}，${book.events.length} 处沿线地标`);
    element('roadbook-profile').setAttribute('aria-label', `海拔剖面，累计上升 ${Math.round(book.ascent)} 米，下降 ${Math.round(book.descent)} 米，最大坡度 ${book.maxGrade.toFixed(1)}%`);
  }

  dispose(): void { this.events.abort(); }
}
