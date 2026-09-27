import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';

export function roadProfile(options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
  const width = options.roadWidth;
  const halfWidth = width / 2 + 1.2;
  const divided = options.roadType === 'highway' && !options.oneWay;
  const centers = divided ? [-halfWidth - 2, halfWidth + 2] : [0];
  const laneWidth = width / options.roadLanes;
  const lanes = centers.flatMap((center, strip) => Array.from({ length: options.roadLanes }, (_, i) => ({
    offset: center - width / 2 + laneWidth * (i + 0.5),
    direction: options.oneWay ? 1 : divided ? Math.sign(center) : i < options.roadLanes / 2 ? -1 : 1,
    index: strip * options.roadLanes + i,
  })));
  return { width, halfWidth, centers, lanes, laneWidth, outerHalfWidth: centers.at(-1)! + halfWidth };
}

export function roadLayout(options: Readonly<WorldOptions>): string {
  const count = roadProfile(options).lanes.length;
  return `${options.oneWay ? '单向' : '双向'}${['零', '一', '两', '三', '四', '五', '六', '七', '八'][count]}车道`;
}
