import { DirectionalLight, HemisphereLight, Vector3, type PerspectiveCamera, type Scene } from 'three';
import { SunSystem } from './SunSystem';

const SHADOW_RADIUS = 1800;
const up = new Vector3(0, 1, 0);

export class SkySystem {
  readonly sun = new SunSystem();
  readonly light = new DirectionalLight();
  private readonly ambient = new HemisphereLight(0xffffff, 0x514753, 1.45);
  private readonly focus = new Vector3();
  private readonly right = new Vector3();
  private readonly vertical = new Vector3();

  constructor(scene: Scene) {
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.bias = -0.00005;
    this.light.shadow.normalBias = 1.8;
    const camera = this.light.shadow.camera;
    camera.left = camera.bottom = -SHADOW_RADIUS;
    camera.right = camera.top = SHADOW_RADIUS;
    camera.near = 1;
    camera.far = 10000;
    camera.updateProjectionMatrix();
    scene.add(this.light, this.light.target, this.ambient);
  }

  update(camera: PerspectiveCamera, origin: { x: number; z: number }): void {
    this.light.color.copy(this.sun.sunColor);
    this.light.intensity = this.sun.light.x;
    this.ambient.color.copy(this.sun.ambient);
    this.ambient.intensity = 2.4 - this.sun.time * 0.6;
    this.focus.set(camera.position.x + origin.x, camera.position.y - 250, camera.position.z + origin.z);
    this.right.crossVectors(this.sun.direction, up).normalize();
    this.vertical.crossVectors(this.right, this.sun.direction).normalize();
    const texel = SHADOW_RADIUS * 2 / this.light.shadow.mapSize.x;
    // Snap in logical light space so small moves and origin rebases share the same shadow grid.
    for (const axis of [this.right, this.vertical]) {
      const coordinate = this.focus.dot(axis);
      this.focus.addScaledVector(axis, Math.round(coordinate / texel) * texel - coordinate);
    }
    this.focus.x -= origin.x;
    this.focus.z -= origin.z;
    this.light.target.position.copy(this.focus);
    this.light.position.copy(this.focus).addScaledVector(this.sun.direction, 5000);
  }

  dispose(): void {
    this.light.removeFromParent();
    this.light.target.removeFromParent();
    this.ambient.removeFromParent();
    this.light.dispose();
  }
}
