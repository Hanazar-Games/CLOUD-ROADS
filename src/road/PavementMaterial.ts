import { MeshStandardMaterial, type Vector2 } from 'three';
import { PavementTextures, pavementNormal, pavementPars, pavementRoughness } from './PavementTextures';

export function createPavementMaterial(origin: Vector2, textures = new PavementTextures()): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  textures.attach(material);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, textures.uniforms, { pavementOrigin: { value: origin } });
    shader.vertexShader = `uniform vec2 pavementOrigin; varying vec2 vPavementUv;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vPavementUv = position.xz + pavementOrigin;
    `);
    shader.fragmentShader = `varying vec2 vPavementUv;\n${pavementPars}\n${shader.fragmentShader}`.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec4 surfaceTexel = texture2D(pavementAsphalt, vPavementUv * 0.5);
      diffuseColor.rgb = surfaceTexel.rgb;
      float surfaceRelief = pavementRelief(surfaceTexel, vPavementUv);
    `).replace('#include <roughnessmap_fragment>', pavementRoughness).replace('#include <normal_fragment_maps>', pavementNormal);
  };
  material.customProgramCacheKey = () => 'cloud-roads-pavement';
  return material;
}
