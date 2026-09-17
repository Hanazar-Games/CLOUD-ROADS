import type { RoadSample } from './RoadSegment';

export function roadFrame(sample: RoadSample) {
  const cos = Math.cos(sample.heading), sin = Math.sin(sample.heading);
  const scale = 1 / Math.sqrt(1 + sample.grade ** 2);
  const up = { x: -sin * sample.grade * scale, y: scale, z: cos * sample.grade * scale };
  const c = Math.cos(sample.bank), s = Math.sin(sample.bank);
  return {
    right: { x: cos * c + up.x * s, y: up.y * s, z: sin * c + up.z * s },
    normal: { x: up.x * c - cos * s, y: up.y * c, z: up.z * c - sin * s },
  };
}
