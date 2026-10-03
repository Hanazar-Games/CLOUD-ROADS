import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, TextureLoader, type MeshStandardMaterial, type Texture } from 'three';

const urls = {
  low: [new URL('./textures/asphalt-256.webp', import.meta.url).href, new URL('./textures/concrete-256.webp', import.meta.url).href],
  high: [new URL('./textures/asphalt-2048.webp', import.meta.url).href, new URL('./textures/concrete-2048.webp', import.meta.url).href],
};
const placeholder = (value: number) => {
  const texture = new DataTexture(new Uint8Array([value, value, value, 128]), 1, 1);
  texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true; return texture;
};

export class PavementTextures {
  readonly uniforms = {
    pavementAsphalt: { value: placeholder(79) as Texture }, pavementConcrete: { value: placeholder(137) as Texture },
    pavementDetail: { value: 0 },
  };
  private users = 0;
  private quality = '';
  private pending: Texture[] = [];
  private generation = 0;
  private anisotropy = 1;

  attach(material: MeshStandardMaterial): void {
    this.users++;
    const release = () => {
      material.removeEventListener('dispose', release);
      if (--this.users) return;
      this.generation++; this.quality = '';
      for (const texture of [...this.pending, this.uniforms.pavementAsphalt.value, this.uniforms.pavementConcrete.value]) texture.dispose();
      this.pending = [];
    };
    material.addEventListener('dispose', release);
  }

  configure(detail: number, maxAnisotropy: number, relief = detail, filtering = detail > 0 ? 8 : 2): void {
    this.uniforms.pavementDetail.value = Math.max(0, Math.min(2, Number.isFinite(relief) ? relief : 0));
    this.anisotropy = Math.max(1, Math.min(Number.isFinite(filtering) ? filtering : 1, maxAnisotropy));
    for (const texture of [...this.pending, this.uniforms.pavementAsphalt.value, this.uniforms.pavementConcrete.value]) {
      if (texture.anisotropy !== this.anisotropy) { texture.anisotropy = this.anisotropy; texture.needsUpdate = true; }
    }
    const quality = detail > 0 ? 'high' : 'low';
    if (quality === this.quality) return;
    this.quality = quality;
    const generation = ++this.generation;
    for (const texture of this.pending) texture.dispose();
    this.pending = [];
    let ready = 0;
    const complete = () => {
      if (generation !== this.generation || ++ready !== 2) return;
      this.uniforms.pavementAsphalt.value.dispose(); this.uniforms.pavementConcrete.value.dispose();
      [this.uniforms.pavementAsphalt.value, this.uniforms.pavementConcrete.value] = this.pending;
      this.pending = [];
    };
    const failed = () => {
      if (generation !== this.generation) return;
      this.generation++; this.quality = '';
      for (const texture of this.pending) texture.dispose();
      this.pending = [];
    };
    this.pending = urls[quality].map(url => {
      const texture = new TextureLoader().load(url, complete, undefined, failed);
      texture.colorSpace = SRGBColorSpace; texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter;
      texture.anisotropy = this.anisotropy; texture.generateMipmaps = true;
      return texture;
    });
  }
}

export const pavementPars = `
  uniform sampler2D pavementAsphalt;
  uniform sampler2D pavementConcrete;
  uniform float pavementDetail;
  float pavementRelief(vec4 texel, vec2 uv) {
    return (texel.a - 0.5) * 0.004 * (1.0 - smoothstep(0.008, mix(0.035, 0.09, step(1.5, pavementDetail)), length(fwidth(uv))));
  }
`;

export const pavementNormal = `
  #include <normal_fragment_maps>
  if (pavementDetail > 0.5) {
    vec3 px = dFdx(-vViewPosition), py = dFdy(-vViewPosition);
    vec3 rx = cross(py, normal), ry = cross(normal, px);
    float det = dot(px, rx);
    vec3 reliefNormal = abs(det) * normal - sign(det) * (dFdx(surfaceRelief) * rx + dFdy(surfaceRelief) * ry);
    if (dot(reliefNormal, reliefNormal) > 1e-12) normal = normalize(reliefNormal);
  }
`;

export const pavementRoughness = `
  #include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor * mix(0.91, 1.04, surfaceTexel.a), 0.12, 1.0);
`;
