import { MeshStandardMaterial } from 'three';

export function createRoadMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec2 vRoadUv;\n${shader.vertexShader}`.replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoadUv = uv;');
    shader.fragmentShader = `varying vec2 vRoadUv;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `
      #include <color_fragment>
      float lateral = abs(vRoadUv.x);
      float aa = max(fwidth(vRoadUv.x), 0.015);
      float shoulder = smoothstep(4.0 - aa, 4.0 + aa, lateral);
      vec3 surface = mix(vec3(0.065, 0.073, 0.078), vec3(0.24, 0.225, 0.19), shoulder);
      float edge = 1.0 - smoothstep(0.065 - aa, 0.065 + aa, abs(lateral - 3.65));
      float center = 1.0 - smoothstep(0.075 - aa, 0.075 + aa, lateral);
      float along = abs(mod(vRoadUv.y, 12.0) - 6.0);
      float dash = 1.0 - smoothstep(2.0 - fwidth(vRoadUv.y), 2.0 + fwidth(vRoadUv.y), along);
      diffuseColor.rgb = mix(surface, vec3(0.83, 0.82, 0.72), max(edge, center * dash));
    `);
  };
  material.customProgramCacheKey = () => 'cloud-roads-asphalt';
  return material;
}
