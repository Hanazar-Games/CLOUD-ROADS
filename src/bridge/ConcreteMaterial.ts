import { MeshStandardMaterial, type Vector2 } from 'three';

export function createConcreteMaterial(origin: Vector2): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: 0xbfc2c1, roughness: 0.94 });
  material.onBeforeCompile = shader => {
    shader.uniforms.concreteOrigin = { value: origin };
    shader.vertexShader = `uniform vec2 concreteOrigin; varying vec3 vConcretePosition;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec4 concretePoint = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        concretePoint = instanceMatrix * concretePoint;
      #endif
      vConcretePosition = (modelMatrix * concretePoint).xyz;
      vConcretePosition.xz += concreteOrigin;
    `);
    shader.fragmentShader = `varying vec3 vConcretePosition;
      float concreteHash(vec2 p) { return fract(sin(dot(mod(p, 256.0), vec2(127.1, 311.7))) * 43758.5453); }
      float concreteNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(concreteHash(i), concreteHash(i + vec2(1.0, 0.0)), f.x), mix(concreteHash(i + vec2(0.0, 1.0)), concreteHash(i + 1.0), f.x), f.y);
      }
      float concreteTexture(vec3 p, vec3 w) {
        return concreteNoise(p.yz) * w.x + concreteNoise(p.xz) * w.y + concreteNoise(p.xy) * w.z;
      }
      ${shader.fragmentShader}`.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 concreteWeights = pow(abs(normalize(cross(dFdx(vConcretePosition), dFdy(vConcretePosition)))), vec3(4.0));
        concreteWeights /= max(dot(concreteWeights, vec3(1.0)), 0.0001);
        float concreteFootprint = length(fwidth(vConcretePosition));
        float concreteNear = 1.0 - smoothstep(0.08, 0.5, concreteFootprint);
        float concretePatch = concreteTexture(vConcretePosition * 0.0625, concreteWeights);
        float concreteGrain = concreteTexture(vConcretePosition * 4.0, concreteWeights);
        float concretePores = smoothstep(0.7, 0.85, concreteGrain) * concreteNear;
        vec3 formDistance = abs(fract(vConcretePosition * 0.25) - 0.5) * 4.0;
        vec3 formLine = 1.0 - smoothstep(vec3(0.012), vec3(0.028) + fwidth(vConcretePosition), formDistance);
        float forms = dot(vec3(max(formLine.y, formLine.z), max(formLine.x, formLine.z), max(formLine.x, formLine.y)), concreteWeights);
        float streak = concreteNoise(vec2(vConcretePosition.x + vConcretePosition.z, vConcretePosition.y * 0.0625));
        diffuseColor.rgb *= 0.96 + concretePatch * 0.07 + (concreteGrain - 0.5) * 0.035 * concreteNear
          - concretePores * 0.045 - forms * 0.035 - streak * (1.0 - concreteWeights.y) * 0.018;
        float concreteRelief = (concreteGrain - concretePores) * 0.006 * concreteNear;
      `).replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        vec3 cx = dFdx(-vViewPosition), cy = dFdy(-vViewPosition);
        vec3 crx = cross(cy, normal), cry = cross(normal, cx);
        float cdet = dot(cx, crx);
        vec3 concreteNormal = abs(cdet) * normal - sign(cdet) * (dFdx(concreteRelief) * crx + dFdy(concreteRelief) * cry);
        if (dot(concreteNormal, concreteNormal) > 0.0000000001) normal = normalize(concreteNormal);
      `);
  };
  material.customProgramCacheKey = () => 'cloud-roads-concrete';
  return material;
}
