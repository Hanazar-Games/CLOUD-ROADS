import { DataTexture, DepthTexture, HalfFloatType, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, RepeatWrapping, Scene, UnsignedByteType, WebGLRenderTarget, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { CLOUD_RESOLUTION, CloudField, wrapCloudCoordinate } from './CloudField';
import { CloudMaterial } from './CloudMaterial';
import type { SunSystem } from './SunSystem';
import { weatherProfiles, type WeatherProfile } from './WeatherSystem';
import { InteriorVolume } from '../render/InteriorVolume';

export class CloudSystem {
  readonly fog = { near: 1000, far: 1950 };
  readonly texture: DataTexture;
  readonly target: WebGLRenderTarget;
  readonly material: CloudMaterial;
  readonly quad: Mesh<PlaneGeometry, CloudMaterial>;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private field: CloudField;
  private driftX = 0;
  private driftZ = 0;
  private mistX = 0;
  private mistZ = 0;
  enabled = true;
  sample: ReturnType<CloudField['sample']>;

  constructor(seed: string, private readonly sun: SunSystem, hdr = true, interior = new InteriorVolume()) {
    this.material = new CloudMaterial(sun, interior);
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.field = new CloudField(seed);
    this.sample = this.field.sample(0, 0, 0);
    this.texture = new DataTexture(this.field.data, CLOUD_RESOLUTION, CLOUD_RESOLUTION);
    this.texture.wrapS = this.texture.wrapT = RepeatWrapping;
    this.texture.minFilter = this.texture.magFilter = LinearFilter;
    this.texture.needsUpdate = true;
    this.target = new WebGLRenderTarget(1, 1, {
      type: hdr ? HalfFloatType : UnsignedByteType, samples: 4,
      depthTexture: new DepthTexture(1, 1),
    });
    this.material.uniforms.sceneColor.value = this.target.texture;
    this.material.uniforms.sceneDepth.value = this.target.depthTexture;
    this.material.uniforms.cloudField.value = this.texture;
    this.scene.add(this.quad);
    this.quad.frustumCulled = false;
  }

  setSeed(seed: string): void {
    this.field = new CloudField(seed);
    this.texture.image.data = this.field.data;
    this.texture.needsUpdate = true;
    this.driftX = this.driftZ = 0;
    this.mistX = this.mistZ = 0;
  }

  update(dt: number, camera: PerspectiveCamera, origin: { x: number; z: number }, weather: Readonly<WeatherProfile> = weatherProfiles.clear, shelter = 0, distance = 2048): void {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 1)) : 0;
    this.driftX = wrapCloudCoordinate(this.driftX + dt * 4);
    this.driftZ = wrapCloudCoordinate(this.driftZ + dt * 1.5);
    this.mistX = wrapCloudCoordinate(this.mistX + dt * 0.65);
    this.mistZ = wrapCloudCoordinate(this.mistZ + dt * 0.28);
    const x = wrapCloudCoordinate(camera.position.x + origin.x + this.driftX);
    const z = wrapCloudCoordinate(camera.position.z + origin.z + this.driftZ);
    this.sample = this.field.sample(x, camera.position.y, z);
    const earth = !this.sun.extraterrestrial;
    const density = this.enabled && earth ? this.sample.density : 0;
    const near = 1000 * distance / 2048, far = 1950 * distance / 2048;
    const clarity = Math.max(0, 1 - weather.cover * 4);
    this.fog.near = Math.min(near + (12 - near) * density, weather.near * (1 + (distance / 2048 - 1) * clarity));
    this.fog.far = Math.min(far + (110 - far) * density, weather.far * (1 + (distance / 2048 - 1) * clarity));
    if (weather.near < 1 && earth) { this.fog.near = weather.near; this.fog.far = weather.far; }
    this.fog.near += (near - this.fog.near) * shelter;
    this.fog.far += (far - this.fog.far) * shelter;
    camera.updateMatrixWorld();
    const uniforms = this.material.uniforms;
    uniforms.phase.value.set(x, z);
    uniforms.mistPhase.value.set(wrapCloudCoordinate(camera.position.x + origin.x + this.mistX), wrapCloudCoordinate(camera.position.z + origin.z + this.mistZ));
    uniforms.mistStrength.value = earth ? weather.cover * (1 - shelter) : 0;
    uniforms.altitude.value = camera.position.y;
    uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.cameraWorld.value.copy(camera.matrixWorld);
    uniforms.nearFar.value.set(camera.near, camera.far);
    uniforms.fogRange.value.set(this.fog.near, this.fog.far);
    uniforms.immersion.value = Math.min(1, density / 0.75) * (1 - shelter);
    uniforms.cloudsEnabled.value = this.enabled && earth && shelter < 0.99;
    uniforms.planet.value = this.sun.terrain === 'moon' ? 1 : this.sun.terrain === 'mars' ? 2 : 0;
    uniforms.weatherCover.value = weather.cover;
    uniforms.nightAmount.value = this.sun.night;
  }

  resize(width: number, height: number): void {
    this.target.setSize(width, height);
    this.material.uniforms.pixelSize.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): void {
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.texture.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
    this.scene.clear();
  }
}
