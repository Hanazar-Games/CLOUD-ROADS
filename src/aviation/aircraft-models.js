import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const AIRCRAFT_MODEL_URLS = {
  a380: new URL('../../assets/aircraft/a380.glb', import.meta.url).href,
  su30: new URL('../../assets/aircraft/su30.glb', import.meta.url).href,
  t6: new URL('../../assets/aircraft/t6.glb', import.meta.url).href,
  b62: new URL('../../assets/aircraft/b62.glb', import.meta.url).href,
  c24: new URL('../../assets/aircraft/c24.glb', import.meta.url).href,
  d9: new URL('../../assets/aircraft/d9.glb', import.meta.url).href,
  r220: new URL('../../assets/aircraft/r220.glb', import.meta.url).href,
  w350: new URL('../../assets/aircraft/w350.glb', import.meta.url).href,
  p72: new URL('../../assets/aircraft/p72.glb', import.meta.url).href,
  f26: new URL('../../assets/aircraft/f26.glb', import.meta.url).href,
  j90: new URL('../../assets/aircraft/j90.glb', import.meta.url).href,
  l440: new URL('../../assets/aircraft/l440.glb', import.meta.url).href,
};

export function disposeAircraftObject(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
  root.traverse(object => {
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    if (texture.source?.data) images.add(texture.source.data);
    texture.dispose();
  }
  for (const bitmap of images) bitmap.close?.();
  root.removeFromParent();
}

export function normalizeAircraftModel(scene, aircraft) {
  const model = new THREE.Group();
  if (aircraft.id === 'a380') scene.rotation.y += Math.PI;
  model.add(scene);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  if (!(size.z > 0 && Number.isFinite(size.z))) throw new Error('Invalid aircraft bounds');
  const scale = aircraft.length / size.z;
  scene.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= bounds.min.y + aircraft.gearHeight;
  const gear = [], propellers = [];
  scene.traverse(object => {
    if (object.name === 'gears' || object.name === 'landing-gear') gear.push(object);
    if (object.name.startsWith('propeller-')) propellers.push(object);
    if (object.isMesh) { object.castShadow = false; object.receiveShadow = false; }
  });
  model.updateMatrixWorld(true);
  for (const part of gear) {
    const localBounds = new THREE.Box3().setFromObject(part).applyMatrix4(part.matrixWorld.clone().invert());
    part.userData.retraction = { position: part.position.clone(), scale: part.scale.clone(), top: localBounds.max.y };
  }
  model.userData.gear = gear; model.userData.propellers = propellers;
  return model;
}

export function updateAircraftGearModel(model, position) {
  const extension = Math.max(0, Math.min(1, position)), factor = .04 + .96 * extension;
  for (const gear of model.userData.gear) {
    gear.visible = extension > .001;
    const rest = gear.userData.retraction;
    if (!rest) continue;
    gear.scale.y = rest.scale.y * factor;
    gear.position.y = rest.position.y + rest.top * rest.scale.y * (1 - factor);
  }
}

export async function loadAircraftModel(aircraft, signal) {
  const response = await fetch(AIRCRAFT_MODEL_URLS[aircraft.id], { signal });
  if (!response.ok) throw new Error(`Aircraft request failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  if (signal?.aborted) {
    disposeAircraftObject(gltf.scene);
    throw new DOMException('Aborted', 'AbortError');
  }
  try { return normalizeAircraftModel(gltf.scene, aircraft); }
  catch (error) { disposeAircraftObject(gltf.scene); throw error; }
}
