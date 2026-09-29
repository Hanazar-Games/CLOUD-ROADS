import { MeshStandardMaterial } from 'three';

export function addRetroreflection(material: MeshStandardMaterial, attribute = false): void {
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    if (attribute) {
      shader.vertexShader = `attribute float retroMask; varying float vRetroMask;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRetroMask = retroMask;');
      shader.fragmentShader = `varying float vRetroMask;\n${shader.fragmentShader}`;
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `
      #include <lights_fragment_end>
      float retroLight = max(max(reflectedLight.directDiffuse.r, reflectedLight.directDiffuse.g), reflectedLight.directDiffuse.b);
      float retroFacing = 0.25 + 0.75 * pow(abs(dot(normal, normalize(vViewPosition))), 0.5);
      totalEmissiveRadiance += diffuseColor.rgb * min(3.0, retroLight * 8.0) * retroFacing * ${attribute ? 'vRetroMask' : '1.0'};
    `);
  };
  material.customProgramCacheKey = () => `${key}:retro:${attribute}`;
}

export function reflectiveMaterial(color = 0xffffff): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.08 });
  material.name = 'retro-reflector'; addRetroreflection(material); return material;
}
