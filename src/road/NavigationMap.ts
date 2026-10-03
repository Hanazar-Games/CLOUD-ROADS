import { buildRoadbook, travelDirection, type RoadbookSource, type RoutePoint } from './Roadbook';

export function buildNavigation(source: RoadbookSource, current: RoutePoint | undefined,
  car: { x: number; y: number; z: number; heading: number; speed: number }, roadWidth: number) {
  if (!current) return;
  const direction = travelDirection(car.heading + (car.speed < -0.1 ? Math.PI : 0), current.heading);
  const book = buildRoadbook(source, current, direction, 1200);
  if (!book) return;
  const rear = buildRoadbook(source, current, direction === 1 ? -1 : 1, 180);
  const route = [...(rear?.points.slice(1).reverse() ?? []), ...book.points];
  const sin = Math.sin(car.heading), cos = Math.cos(car.heading);
  const local = (p: RoutePoint['position']) => {
    const dx = p.x - car.x, dz = p.z - car.z;
    return { x: dx * cos + dz * sin, y: -dx * sin + dz * cos };
  };
  const positions = route.map(p => local(p.position));
  const position = { x: 192, y: 145 };
  const scale = positions.reduce((scale, p) => Math.min(scale, 176 / Math.max(1, Math.abs(p.x)),
    (p.y < 0 ? 105 : 35) / Math.max(1, Math.abs(p.y))), 0.35);
  const project = (p: { x: number; y: number }) => ({ x: position.x + p.x * scale, y: position.y + p.y * scale });
  const points = positions.map((p, i) => ({ ...project(p), kind: route[i].kind }));
  const events = book.events.map(event => {
    const next = book.points.findIndex(p => p.ahead >= event.ahead);
    const b = book.points[Math.max(0, next)], a = book.points[Math.max(0, next - 1)];
    const t = b.ahead === a.ahead ? 0 : (event.ahead - a.ahead) / (b.ahead - a.ahead);
    const point = local({ x: a.position.x + (b.position.x - a.position.x) * t, y: 0, z: a.position.z + (b.position.z - a.position.z) * t });
    return { ...event, ...project(point) };
  });
  return { book, direction, points, events, position, scale,
    onRoad: Math.hypot(car.x - current.position.x, car.z - current.position.z) < roadWidth / 2 + 5
      && Math.abs(car.y - current.position.y) < 10,
    altitude: Math.round(car.y), grade: current.grade * direction * 100 };
}

export type NavigationMap = NonNullable<ReturnType<typeof buildNavigation>>;
