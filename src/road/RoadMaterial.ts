import { MeshStandardMaterial } from 'three';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { roadProfile } from './RoadProfile';

export function createRoadMaterial(options: Readonly<WorldOptions> = DEFAULT_OPTIONS): MeshStandardMaterial {
  const profile = roadProfile(options);
  const material = new MeshStandardMaterial({ roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.roadHalfWidth = { value: profile.width / 2 };
    shader.uniforms.roadCenter = { value: profile.centers.at(-1)! };
    shader.vertexShader = `varying vec2 vRoadUv;\n${shader.vertexShader}`.replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoadUv = uv;');
    shader.fragmentShader = `varying vec2 vRoadUv;\nuniform float roadHalfWidth;\nuniform float roadCenter;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `
      #include <color_fragment>
      float lateral = abs(abs(vRoadUv.x) - roadCenter);
      float aa = max(fwidth(vRoadUv.x), 0.015);
      float shoulder = smoothstep(roadHalfWidth - aa, roadHalfWidth + aa, lateral);
      vec3 surface = mix(vec3(0.065, 0.073, 0.078), vec3(0.24, 0.225, 0.19), shoulder);
      float edge = 1.0 - smoothstep(0.065 - aa, 0.065 + aa, abs(lateral - roadHalfWidth + 0.35));
      float center = 1.0 - smoothstep(0.075 - aa, 0.075 + aa, lateral);
      float along = abs(mod(vRoadUv.y, 12.0) - 6.0);
      float dash = 1.0 - smoothstep(2.0 - fwidth(vRoadUv.y), 2.0 + fwidth(vRoadUv.y), along);
      vec3 marking = mix(vec3(0.83, 0.82, 0.72), vec3(0.95, 0.61, 0.12), step(abs(vRoadUv.x), roadCenter) * edge);
      diffuseColor.rgb = mix(surface, marking, max(edge, center * dash));
    `);
  };
  material.customProgramCacheKey = () => 'cloud-roads-asphalt';
  return material;
}
