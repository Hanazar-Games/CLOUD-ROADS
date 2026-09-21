import type { MeshStandardMaterial } from 'three';
import type { SeasonState } from './SeasonState';

type Surface = 'terrain' | 'road' | 'pavement' | 'structure' | 'foliage' | 'evergreen' | 'grass';

export function seasonMaterial(material: MeshStandardMaterial, season: SeasonState, surface: Surface): void {
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.seasonPhase = season.phase;
    shader.uniforms.seasonClimate = season.climate;
    shader.uniforms.seasonOrigin = season.origin;
    shader.vertexShader = `uniform vec2 seasonOrigin; varying vec3 vSeasonPosition; varying float vSeasonUp;
      ${surface === 'road' ? 'attribute float seasonExposure; varying float vSeasonExposure;' : ''}
      ${shader.vertexShader}`.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 seasonPosition = vec4(transformed, 1.0);
      vec3 seasonNormal = normal;
      #ifdef USE_INSTANCING
        seasonPosition = instanceMatrix * seasonPosition;
        mat3 seasonMatrix = mat3(instanceMatrix);
        seasonNormal /= vec3(dot(seasonMatrix[0], seasonMatrix[0]), dot(seasonMatrix[1], seasonMatrix[1]), dot(seasonMatrix[2], seasonMatrix[2]));
        seasonNormal = seasonMatrix * seasonNormal;
      #endif
      vSeasonPosition = (modelMatrix * seasonPosition).xyz;
      vSeasonPosition.xz += seasonOrigin;
      vSeasonUp = normalize(mat3(modelMatrix) * seasonNormal).y;
      ${surface === 'road' ? 'vSeasonExposure = seasonExposure;' : ''}
    `);
    shader.fragmentShader = `uniform vec4 seasonPhase; uniform vec2 seasonClimate;
      varying vec3 vSeasonPosition; varying float vSeasonUp;
      ${surface === 'road' ? 'varying float vSeasonExposure;' : ''}
      float seasonHash(vec2 p) { return fract(sin(dot(mod(p, 4096.0), vec2(127.1, 311.7))) * 43758.5453); }
      ${shader.fragmentShader}`.replace('#include <roughnessmap_fragment>', `
      float seasonalCold = clamp((2.0 - seasonClimate.x - seasonPhase.w + vSeasonPosition.y * 0.006) / 8.0, 0.0, 1.0);
      float seasonalSnow = seasonalCold * seasonalCold * (3.0 - 2.0 * seasonalCold) * seasonPhase.z * seasonClimate.y;
      vec2 seasonalPosition = mod(vSeasonPosition.xz, 4096.0);
      float seasonalPatch = seasonHash(floor(seasonalPosition * 0.5));
      float seasonalFine = 1.0 - smoothstep(0.15, 1.5, length(fwidth(vSeasonPosition)));
      ${surface === 'foliage' || surface === 'grass' || surface === 'terrain' ? `
        float seasonalGreen = smoothstep(0.0, 0.08, diffuseColor.g - diffuseColor.r * 1.04);
        vec3 springTint = diffuseColor.rgb * vec3(1.07, 1.2, 0.91);
        vec3 autumnTint = mix(vec3(0.46, 0.23, 0.025), vec3(0.42, 0.085, 0.035), seasonalPatch) * (0.8 + seasonalPatch * 0.3);
        diffuseColor.rgb = mix(diffuseColor.rgb, springTint, seasonPhase.x * seasonalGreen);
        diffuseColor.rgb = mix(diffuseColor.rgb, autumnTint, seasonPhase.y * seasonalGreen * ${surface === 'terrain' ? '0.45' : '0.9'});
        ${surface === 'grass' ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.2, 0.12), seasonPhase.z * 0.65);' : ''}
      ` : ''}
      ${surface === 'terrain' ? `
        float leaf = step(0.92, seasonHash(floor(seasonalPosition * 10.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.44, 0.2, 0.04), leaf * seasonPhase.y * seasonalFine * smoothstep(0.6, 0.95, vSeasonUp) * seasonalGreen);
      ` : ''}
      ${surface === 'road' ? `
        float leaf = step(0.9, seasonHash(floor(seasonalPosition * 8.0)));
        float roadside = smoothstep(roadHalfWidth * 0.68, roadHalfWidth, lateral);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.4, 0.15, 0.025), leaf * roadside * seasonPhase.y * seasonalFine * vSeasonExposure * seasonClimate.y);
        seasonalSnow *= vSeasonExposure * mix(0.65 - wheelTrack * 0.5, 0.98, shoulder);
      ` : ''}
      ${surface === 'pavement' ? 'seasonalSnow *= 0.68;' : ''}
      float seasonalCover = smoothstep(${surface === 'foliage' || surface === 'evergreen' ? '0.1, 0.6' : '0.35, 0.85'}, vSeasonUp);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.86, 0.9) * (0.97 + seasonalPatch * 0.03), seasonalSnow * seasonalCover);
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.94, seasonalSnow * seasonalCover);
    `);
  };
  material.customProgramCacheKey = () => `${key}:season:${surface}`;
  material.needsUpdate = true;
}
