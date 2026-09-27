export const chargingBays = [-72, -64, -56] as const;
export const chargingPosts = [-78, -50] as const;
export const chargingPostColumns = [-62, -51.5] as const;
export const serviceObstacles: readonly (readonly [number, number, number, number, number])[] = [
  [15, 28, 22, 30, 5], [53, 30, 27, 36, 7], [57, 74, 24, 20, 4],
  [7, 84, 2.8, 1.2, 2.6],
  ...chargingBays.map(along => [-62, along, 0.8, 0.75, 2.25] as const),
  ...chargingPosts.flatMap(along => chargingPostColumns.map(x => [x, along, 0.22, 0.22, 4.5] as const)),
];
