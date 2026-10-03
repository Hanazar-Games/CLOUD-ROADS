import { DisplaySurface } from './DisplaySurface';
import type { NavigationMap } from '../road/NavigationMap';

const colors = { road: [95, 228, 216], bridge: [182, 174, 255], tunnel: [248, 192, 110] };
const names = { bridge: 'BRIDGE', tunnel: 'TUNNEL', service: 'REST AREA', pass: 'PASS', junction: 'JUNCTION' };
const cyan = [140, 239, 232], muted = [109, 157, 179];

export class NavigationDisplay extends DisplaySurface {
  private last = '';
  constructor() { super('vehicle-navigation'); this.update(undefined); }
  update(map: NavigationMap | undefined): void {
    const signature = map ? JSON.stringify([map.points.map(p => [Math.round(p.x), Math.round(p.y), p.kind]),
      map.events.map(p => [p.kind, Math.round(p.ahead / 10), Math.round(p.x), Math.round(p.y)]),
      map.onRoad, map.book.partial, Math.round(map.book.length / 10), map.altitude, map.grade.toFixed(1)]) : 'loading';
    if (signature === this.last) return;
    this.last = signature;
    this.rect(0, 0, 384, 224, [5, 15, 23]);
    this.rect(0, 0, 384, 28, [16, 35, 47]);
    this.text('CLOUD / NAV', 12, 9, 2, cyan);
    this.text('HEADING UP', 306, 13, 1, muted);
    for (let x = 0; x < 384; x += 24) this.line(x, 30, x, 183, [13, 33, 45]);
    for (let y = 38; y < 184; y += 24) this.line(0, y, 384, y, [13, 33, 45]);
    if (map) {
      for (let i = 1; i < map.points.length; i++) {
        const a = map.points[i - 1], b = map.points[i];
        this.line(a.x, a.y, b.x, b.y, [28, 60, 74], 9);
        this.line(a.x, a.y, b.x, b.y, colors[b.kind], 3);
      }
      for (const event of map.events) {
        this.ring(event.x, event.y, 5, event.kind === 'service' ? [130, 238, 174] : cyan, 2);
      }
      const { x, y } = map.position;
      this.ring(x, y, 14, [34, 93, 111], 2);
      for (let row = 0; row < 13; row++) this.rect(x - row * 0.6, y - 10 + row, row * 1.2 + 1, 1, [235, 252, 255]);
      this.text(map.onRoad ? 'LIVE ROUTE' : 'NEARBY ROAD', 12, 34, 1, map.onRoad ? cyan : colors.tunnel);
      this.text(`${map.altitude} M`, 12, 169, 1, muted);
      const event = map.events[0];
      this.rect(0, 188, 384, 36, [14, 34, 45]);
      this.text(event ? `${names[event.kind]}  ${(event.ahead / 1000).toFixed(2)} KM` : `ROUTE  ${(map.book.length / 1000).toFixed(2)} KM`, 12, 194, 2, cyan);
      this.text(map.book.partial ? 'LOADED SECTION / MORE AHEAD' : 'BRIDGE / TUNNEL / REST AREA', 12, 213, 1, muted);
    } else this.text('ACQUIRING ROUTE', 108, 102, 2, muted);
    this.root.userData.navigation = map ? { status: map.onRoad ? 'route' : 'nearby', points: map.points.length,
      distance: map.book.length, direction: map.direction } : { status: 'loading', points: 0 };
    this.texture.needsUpdate = true;
  }
}
