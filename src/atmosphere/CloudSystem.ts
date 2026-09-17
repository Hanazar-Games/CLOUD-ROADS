import { Color, DataTexture, DepthTexture, Fog, HalfFloatType, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, RepeatWrapping, Scene, UnsignedByteType, WebGLRenderTarget, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { CLOUD_RESOLUTION, CloudField, wrapCloudCoordinate } from './CloudField';
import { CloudMaterial } from './CloudMaterial';

export class CloudSystem {
  readonly background = new Color(0xa5bec9);
  readonly fog = new Fog(this.background, 1000, 1950);
  readonly texture: DataTexture;
  readonly target: WebGLRenderTarget;
  readonly material = new CloudMaterial();
  readonly quad = new Mesh(new PlaneGeometry(2, 2), this.material);
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly clearColor = new Color(0xa5bec9);
  private readonly mistColor = new Color(0xc2cdd0);
  private field: CloudField;
  private driftX = 0;
  private driftZ = 0;
  enabled = true;
  sample: ReturnType<CloudField['sample']>;

  constructor(seed: string, hdr = true) {
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
  }

  update(dt: number, camera: PerspectiveCamera, origin: { x: number; z: number }): void {
    this.driftX = wrapCloudCoordinate(this.driftX + dt * 4);
    this.driftZ = wrapCloudCoordinate(this.driftZ + dt * 1.5);
    const x = wrapCloudCoordinate(camera.position.x + origin.x + this.driftX);
    const z = wrapCloudCoordinate(camera.position.z + origin.z + this.driftZ);
    this.sample = this.field.sample(x, camera.position.y, z);
    const density = this.enabled ? this.sample.density : 0;
    this.background.copy(this.clearColor).lerp(this.mistColor, density);
    this.fog.color.copy(this.background);
    this.fog.near = this.enabled ? this.sample.fogNear : 1000;
    this.fog.far = this.enabled ? this.sample.fogFar : 1950;
    camera.updateMatrixWorld();
    const uniforms = this.material.uniforms;
    uniforms.phase.value.set(x, z);
    uniforms.altitude.value = camera.position.y;
    uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.cameraWorld.value.copy(camera.matrixWorld);
    uniforms.nearFar.value.set(camera.near, camera.far);
    uniforms.fogRange.value.set(this.fog.near, this.fog.far);
    uniforms.haze.value.copy(this.background);
    uniforms.cloudsEnabled.value = this.enabled;
  }

  resize(width: number, height: number): void { this.target.setSize(width, height); }

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
