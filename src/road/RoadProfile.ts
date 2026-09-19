import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';

export function roadProfile(options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
  const width = options.roadWidth;
  const halfWidth = width / 2 + 1.2;
  const centers = options.roadType === 'highway' ? [-halfWidth - 2, halfWidth + 2] : [0];
  return { width, halfWidth, centers, outerHalfWidth: centers.at(-1)! + halfWidth };
}
