import { MeshStandardMaterial, Vector4 } from 'three';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { roadProfile } from './RoadProfile';

export function createRoadMaterial(options: Readonly<WorldOptions> = DEFAULT_OPTIONS,
  access = Array.from({ length: 4 }, () => new Vector4(-1, -1, -1, -1))): MeshStandardMaterial {
  const profile = roadProfile(options);
  const material = new MeshStandardMaterial({ roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.roadHalfWidth = { value: profile.width / 2 };
    shader.uniforms.roadCenter = { value: profile.centers.at(-1)! };
    shader.uniforms.serviceAccess = { value: access };
    shader.vertexShader = `varying vec2 vRoadUv;\n${shader.vertexShader}`.replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoadUv = uv;');
    shader.fragmentShader = `varying vec2 vRoadUv;\nuniform float roadHalfWidth;\nuniform float roadCenter;\nuniform vec4 serviceAccess[4];\n${shader.fragmentShader}`.replace('#include <color_fragment>', `
      #include <color_fragment>
      float lateral = abs(abs(vRoadUv.x) - roadCenter);
      float aa = max(fwidth(vRoadUv.x), 0.015);
      float shoulder = smoothstep(roadHalfWidth - aa, roadHalfWidth + aa, lateral);
      vec3 surface = mix(vec3(0.065, 0.073, 0.078), vec3(0.24, 0.225, 0.19), shoulder);
      float grain = fract(sin(dot(floor(vRoadUv * 28.0), vec2(127.1, 311.7))) * 43758.5453);
      surface *= 1.0 + (grain - 0.5) * 0.18 * (1.0 - smoothstep(0.015, 0.15, length(fwidth(vRoadUv))));
      float edge = 1.0 - smoothstep(0.065 - aa, 0.065 + aa, abs(lateral - roadHalfWidth + 0.35));
      float opening = 0.0;
      for (int i = 0; i < 4; i++) {
        vec4 access = serviceAccess[i];
        opening = max(opening, max(step(access.x, vRoadUv.y) * step(vRoadUv.y, access.y), step(access.z, vRoadUv.y) * step(vRoadUv.y, access.w)));
      }
      edge *= 1.0 - opening * (roadCenter > 0.01 ? step(roadCenter, abs(vRoadUv.x)) : step(0.0, vRoadUv.x));
      float center = 1.0 - smoothstep(0.075 - aa, 0.075 + aa, lateral);
      float along = abs(mod(vRoadUv.y, 12.0) - 6.0);
      float dash = 1.0 - smoothstep(2.0 - fwidth(vRoadUv.y), 2.0 + fwidth(vRoadUv.y), along);
      float yellow = roadCenter > 0.01 ? step(abs(vRoadUv.x), roadCenter) * edge : center * dash;
      vec3 marking = mix(vec3(0.83, 0.82, 0.72), vec3(0.95, 0.61, 0.12), yellow);
      diffuseColor.rgb = mix(surface, marking, max(edge, center * dash));
      float lane = abs(lateral - roadHalfWidth * 0.5);
      float arrowY = (mod(vRoadUv.y + 60.0, 120.0) - 60.0) * sign(vRoadUv.x);
      float shaft = (1.0 - smoothstep(0.11, 0.11 + aa, lane)) * step(-3.0, arrowY) * step(0.5, 2.0 - arrowY);
      float head = (1.0 - smoothstep(max(0.0, (2.8 - arrowY) * 0.5), max(0.0, (2.8 - arrowY) * 0.5) + aa, lane)) * step(0.2, arrowY) * step(arrowY, 2.8);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.83, 0.82, 0.72), max(shaft, head));
      float rumble = step(roadHalfWidth + 0.25, lateral) * step(lateral, roadHalfWidth + 0.8) * step(mod(vRoadUv.y, 1.3), 0.15);
      diffuseColor.rgb *= 1.0 - rumble * 0.3 * (1.0 - smoothstep(0.2, 1.0, fwidth(vRoadUv.y)));
    `);
  };
  material.customProgramCacheKey = () => 'cloud-roads-asphalt';
  return material;
}
