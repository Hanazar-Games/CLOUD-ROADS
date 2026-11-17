export const bankLoad = flight => flight.onGround ? 1 : 1 / Math.max(.25, Math.abs(Math.cos(flight.roll)));

export function aircraftAirflow(flight) {
  const path = Math.asin(Math.max(-1, Math.min(1, flight.verticalSpeed / Math.max(flight.speed, .01))));
  const difference = flight.pitch - path;
  const angle = Math.atan2(Math.sin(difference) * Math.cos(flight.roll), Math.cos(difference));
  const excess = Math.max(0, Math.min(1, (Math.abs(angle) / flight.performance.stallAngle - 1) / .75));
  return { angle, separation: excess * excess * (3 - 2 * excess), highAngle: Math.abs(angle) > flight.performance.stallAngle };
}

export function aircraftEnvelope(flight) {
  const performance = flight.performance;
  return { stall: performance.stall * (1 - flight.flaps * .1) * Math.sqrt(bankLoad(flight)), takeoff: performance.takeoff * (1 - flight.flaps * .07), landing: performance.landingSpeed, maxSpeed: performance.maxSpeed };
}
