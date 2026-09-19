export const skyShader = /* glsl */`
  uniform vec3 sunDirection, sunColor, zenithColor, horizonColor, hazeColor, ambientColor;
  uniform vec2 solar;
  uniform float immersion, weatherCover, nightAmount;

  vec3 skyGradient(vec3 ray) {
    float height = max(ray.y, 0.0);
    float facing = pow(max(0.0, dot(ray, sunDirection)), 4.0);
    vec3 horizon = mix(hazeColor, horizonColor, 0.25 + facing * 0.75);
    vec3 clearSky = mix(horizon, zenithColor, 1.0 - exp(-height * 6.5));
    float bands = sin(ray.x * 12.0 + sin(ray.z * 9.0)) * sin(ray.z * 7.0 - ray.y * 6.0) * 0.07;
    return mix(clearSky, (hazeColor * 0.65 + ambientColor * 0.3) * (0.75 + bands), weatherCover);
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
    sky += sunColor * (disc * 8.0 * aboveHorizon + halo) * (1.0 - weatherCover) * (1.0 - nightAmount);
    vec3 starCell = floor(ray * 650.0);
    float star = fract(sin(dot(starCell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float stars = smoothstep(0.9985, 1.0, star) * smoothstep(0.0, 0.25, ray.y);
    float moon = smoothstep(0.99982, 0.9999, dot(ray, normalize(vec3(0.45, 0.55, -0.7))));
    sky += (vec3(0.42, 0.5, 0.65) * stars + vec3(0.7, 0.8, 1.0) * moon) * nightAmount * (1.0 - weatherCover);
    return mix(sky, airColor(ray), immersion);
  }
`;
