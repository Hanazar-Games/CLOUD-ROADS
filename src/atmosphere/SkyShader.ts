export const skyShader = /* glsl */`
  uniform vec3 sunDirection, sunColor, zenithColor, horizonColor, hazeColor, ambientColor;
  uniform vec2 solar;
  uniform float immersion;

  vec3 skyGradient(vec3 ray) {
    float height = max(ray.y, 0.0);
    float facing = pow(max(0.0, dot(ray, sunDirection)), 4.0);
    vec3 horizon = mix(hazeColor, horizonColor, 0.25 + facing * 0.75);
    return mix(horizon, zenithColor, 1.0 - exp(-height * 6.5));
  }

  vec3 airColor(vec3 ray) {
    return mix(skyGradient(ray), ambientColor * 0.7 + sunColor * 0.14, immersion);
  }

  vec3 skyColor(vec3 ray) {
    vec3 sky = skyGradient(ray);
    float alignment = clamp(dot(ray, sunDirection), -1.0, 1.0);
    float radius = 0.008;
    float disc = smoothstep(cos(radius * 1.2), cos(radius * 0.85), alignment);
    float halo = pow(max(alignment, 0.0), 320.0) * 0.3 + pow(max(alignment, 0.0), 24.0) * 0.08;
    float aboveHorizon = smoothstep(-0.005, 0.005, ray.y);
    sky += sunColor * (disc * 8.0 * aboveHorizon + halo);
    return mix(sky, airColor(ray), immersion);
  }
`;
