export const bankLoad = flight => flight.onGround ? 1 : 1 / Math.max(.25, Math.abs(Math.cos(flight.roll)));
export const flightPathAngle = flight => Math.asin(Math.max(-1, Math.min(1, flight.verticalSpeed / Math.max(flight.speed, .01))));

export function aircraftDensity(flight) {
  const effect = flight.physics.airDensity;
  return effect > 0 ? Math.exp(-Math.min(20000, Math.max(0, flight.y)) / 9300 * effect) : 1;
}

export const equivalentAirspeed = (flight, density = aircraftDensity(flight)) => flight.speed * Math.sqrt(density);
export const availableAcceleration = (flight, density) => flight.performance.acceleration * (1 - (1 - density) * flight.physics.thrustLapse);

export function aircraftAirflow(flight, result = {}) {
  const path = flightPathAngle(flight);
  const drift = (flight.trackHeading ?? flight.heading) - flight.heading;
  const horizontal = Math.cos(path), vertical = Math.sin(path);
  const ahead = Math.cos(drift) * horizontal, lateral = Math.sin(drift) * horizontal;
  const pitchSin = Math.sin(flight.pitch), pitchCos = Math.cos(flight.pitch);
  const chord = ahead * pitchCos + vertical * pitchSin;
  const wingNormal = (vertical * pitchCos - ahead * pitchSin) * Math.cos(flight.roll) + lateral * Math.sin(flight.roll);
  const angle = Math.atan2(-wingNormal, chord);
  const limit = angle < 0 ? flight.performance.negativeStallAngle : flight.performance.stallAngle;
  const excess = Math.max(0, Math.min(1, (Math.abs(angle) / limit - 1) / .75));
  result.angle = angle;
  result.separation = excess * excess * (3 - 2 * excess);
  result.highAngle = Math.abs(angle) > limit;
  return result;
}

export function aircraftEnvelope(flight) {
  const performance = flight.performance;
  return { stall: performance.stall * (1 - flight.flaps * .1) * Math.sqrt(bankLoad(flight)), takeoff: performance.takeoff * (1 - flight.flaps * .07), landing: performance.landingSpeed, maxSpeed: performance.maxSpeed };
}
