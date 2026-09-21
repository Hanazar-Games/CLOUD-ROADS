import { MeshStandardMaterial, type Vector2 } from 'three';

export function createTerrainMaterial(origin: Vector2): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  material.onBeforeCompile = shader => {
    shader.uniforms.terrainOrigin = { value: origin };
    shader.vertexShader = `uniform vec2 terrainOrigin; varying vec3 vTerrainPosition; varying vec3 vTerrainNormal;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTerrainPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vTerrainPosition.xz += terrainOrigin;
        vTerrainNormal = normal;
      `);
    shader.fragmentShader = `varying vec3 vTerrainPosition; varying vec3 vTerrainNormal;
      float terrainHash(vec2 p) { p = mod(p, 256.0); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float terrainNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), f.x), mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + 1.0), f.x), f.y);
      }
      float terrainSurfaceNoise(vec3 p, vec3 weights) {
        return terrainNoise(p.yz) * weights.x + terrainNoise(p.xz) * weights.y + terrainNoise(p.xy) * weights.z;
      }
      ${shader.fragmentShader}`.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 weights = pow(abs(normalize(vTerrainNormal)), vec3(4.0));
        weights /= max(dot(weights, vec3(1.0)), 0.0001);
        float cliff = 1.0 - smoothstep(0.55, 0.9, vTerrainNormal.y);
        float terrainPatch = terrainSurfaceNoise(vTerrainPosition * 0.0625, weights);
        float rock = terrainSurfaceNoise(vTerrainPosition * 0.25, weights);
        float grain = terrainSurfaceNoise(vTerrainPosition * 2.0, weights);
        float footprint = length(fwidth(vTerrainPosition));
        float closeDetail = 1.0 - smoothstep(0.15, 0.75, footprint);
        float rockDetail = 1.0 - smoothstep(1.0, 5.0, footprint);
        diffuseColor.rgb *= 0.96 + terrainPatch * 0.08 + (rock - 0.5) * cliff * 0.13 * rockDetail + (grain - 0.5) * 0.09 * closeDetail;
        float strata = sin(vTerrainPosition.y * 0.18 + terrainPatch * 5.0 + rock * 0.8);
        diffuseColor.rgb *= 1.0 + strata * cliff * 0.025 * rockDetail;
        float veinPhase = vTerrainPosition.y * 0.7 + rock * 5.0 + terrainPatch * 3.0;
        float veinWidth = max(0.06, fwidth(veinPhase));
        float vein = 1.0 - smoothstep(0.04, 0.04 + veinWidth, abs(sin(veinPhase)));
        float soil = smoothstep(0.54, 0.76, terrainPatch * 0.6 + rock * 0.4) * (1.0 - cliff);
        diffuseColor.rgb *= 1.0 - vein * cliff * 0.12 * rockDetail - soil * 0.09;
        float surfaceRelief = (rock * 0.11 * rockDetail + grain * 0.025 * closeDetail - vein * cliff * 0.018 * rockDetail) * (0.25 + cliff);
      `).replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
        vec3 rx = cross(sy, normal), ry = cross(normal, sx);
        float det = dot(sx, rx);
        vec3 perturbed = abs(det) * normal - sign(det) * (dFdx(surfaceRelief) * rx + dFdy(surfaceRelief) * ry);
        if (dot(perturbed, perturbed) > 0.0000000001) normal = normalize(perturbed);
      `);
  };
  material.customProgramCacheKey = () => 'cloud-roads-terrain-detail';
  return material;
}
