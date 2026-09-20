import { ExtrudeGeometry, Shape } from 'three';

function profile(points: number[][]): ExtrudeGeometry {
  const shape = new Shape();
  points.forEach(([x, y], i) => { if (i) shape.lineTo(x, y); else shape.moveTo(x, y); });
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 }).translate(0, 0, -0.5);
}

export const barrierGeometry = () => profile([
  [-0.5, -0.5], [0.5, -0.5], [0.5, -0.32], [0.26, -0.1], [0.2, 0.5], [-0.2, 0.5], [-0.26, -0.1], [-0.5, -0.32],
]);

export const guardrailGeometry = () => profile([
  [-0.4, -0.5], [-0.4, -0.4], [0.4, -0.2], [-0.25, 0], [0.4, 0.2], [-0.4, 0.4], [-0.4, 0.5],
  [-0.5, 0.5], [-0.5, 0.33], [0.2, 0.2], [-0.45, 0], [0.2, -0.2], [-0.5, -0.33], [-0.5, -0.5],
]);
