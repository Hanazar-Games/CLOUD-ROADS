export const HUB_LAYOUT = Object.freeze({ length: 5000, eastRunwayX: 1800, terrainOffsetX: 1050, halfWidth: 2250, halfLength: 4300 });

export function runwayJunctions(airport, runway) {
  return airport.taxiways.filter(taxiway => taxiway.width > taxiway.depth && taxiway.z >= runway.end && taxiway.z <= runway.start).flatMap(taxiway =>
    [-1, 1].filter(side => {
      const edge = runway.x + side * (runway.width / 2 + runway.shoulder);
      return edge > taxiway.x - taxiway.width / 2 && edge < taxiway.x + taxiway.width / 2;
    }).map(side => ({ side, z: taxiway.z, depth: taxiway.depth, holdX: runway.x + side * (runway.width / 2 + runway.shoulder + 45) })));
}
