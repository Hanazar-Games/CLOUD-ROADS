import { MeshStandardMaterial, type Vector2 } from 'three';

export function createTerrainMaterial(origin: Vector2): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  material.onBeforeCompile = shader => {
    shader.uniforms.terrainOrigin = { value: origin };
    shader.vertexShader = `uniform vec2 terrainOrigin; varying vec3 vTerrainPosition; varying float vTerrainSlope;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTerrainPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vTerrainPosition.xz += terrainOrigin;
        vTerrainSlope = normal.y;
      `);
    shader.fragmentShader = `varying vec3 vTerrainPosition; varying float vTerrainSlope;
      float terrainHash(vec2 p) { p = mod(p, 256.0); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float terrainNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), f.x), mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + 1.0), f.x), f.y);
      }
      ${shader.fragmentShader}`.replace('#include <color_fragment>', `
        #include <color_fragment>
        float cliff = 1.0 - smoothstep(0.55, 0.9, vTerrainSlope);
        float terrainPatch = terrainNoise(vTerrainPosition.xz * 0.125);
        float grain = terrainNoise(vTerrainPosition.xz * 2.0);
        float closeDetail = 1.0 - smoothstep(0.15, 0.75, length(fwidth(vTerrainPosition.xz)));
        diffuseColor.rgb *= 0.94 + terrainPatch * 0.12 + (grain - 0.5) * 0.15 * closeDetail;
        diffuseColor.rgb *= 1.0 + sin(vTerrainPosition.y * 0.8 + terrainPatch * 3.0) * cliff * 0.055;
        float surfaceRelief = (terrainPatch * 0.14 + grain * 0.035) * closeDetail * (0.3 + cliff);
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
