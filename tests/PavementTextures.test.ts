import { afterEach, expect, it, vi } from 'vitest';
import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from 'three';
import { PavementTextures } from '../src/road/PavementTextures';

afterEach(() => vi.restoreAllMocks());

it('shares maps, switches detail without recompiling and frees high resolution maps on downgrade', () => {
  const requests: { url: string; texture: Texture; complete: () => void }[] = [];
  vi.spyOn(TextureLoader.prototype, 'load').mockImplementation((url, onLoad) => {
    const texture = new Texture<HTMLImageElement>(); requests.push({ url, texture, complete: () => onLoad?.(texture) }); return texture;
  });
  const textures = new PavementTextures(), a = new MeshStandardMaterial(), b = new MeshStandardMaterial();
  textures.attach(a); textures.attach(b);
  textures.configure(2, 4);
  expect(requests).toHaveLength(2);
  requests.forEach(r => r.complete());
  const map = textures.uniforms.pavementAsphalt.value, dispose = vi.spyOn(map, 'dispose');
  expect(map).toBe(requests[0].texture); expect(map.anisotropy).toBe(4);
  expect(map.wrapS).toBe(RepeatWrapping); expect(map.colorSpace).toBe(SRGBColorSpace);
  textures.configure(1, 4); expect(requests).toHaveLength(2);
  textures.configure(0, 4); expect(requests).toHaveLength(4);
  requests.slice(2).forEach(r => r.complete());
  expect(dispose).toHaveBeenCalledOnce(); expect(a.version).toBe(0); expect(b.version).toBe(0);
  expect(requests[2].url).toContain('256');
  const lowDispose = vi.spyOn(textures.uniforms.pavementAsphalt.value, 'dispose');
  a.dispose(); expect(lowDispose).not.toHaveBeenCalled(); b.dispose(); expect(lowDispose).toHaveBeenCalledOnce();
});

it('does not resurrect textures after a world is disposed during loading', () => {
  const pending: (() => void)[] = [], maps: Texture[] = [];
  vi.spyOn(TextureLoader.prototype, 'load').mockImplementation((_url, onLoad) => {
    const map = new Texture<HTMLImageElement>(); maps.push(map); pending.push(() => onLoad?.(map)); return map;
  });
  const textures = new PavementTextures(), material = new MeshStandardMaterial(); textures.attach(material);
  textures.configure(2, 8);
  const dispose = maps.map(map => vi.spyOn(map, 'dispose'));
  material.dispose(); pending.forEach(done => done());
  expect(maps).not.toContain(textures.uniforms.pavementAsphalt.value);
  dispose.forEach(spy => expect(spy).toHaveBeenCalledOnce());
});
