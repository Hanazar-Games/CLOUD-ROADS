import { Matrix4, Vector3, type Box3 } from 'three';

export interface InteriorBounds { bounds: Box3; matrixWorld: Matrix4 }

export class InteriorVolume {
  readonly uniforms = {
    interiorActive: { value: false }, interiorInverse: { value: new Matrix4() },
    interiorMin: { value: new Vector3() }, interiorMax: { value: new Vector3() },
  };
  private readonly position = new Vector3();
  update(volume: InteriorBounds | undefined, camera: Vector3): void {
    const u = this.uniforms;
    u.interiorActive.value = false;
    if (!volume) return;
    u.interiorInverse.value.copy(volume.matrixWorld).invert();
    this.position.copy(camera).applyMatrix4(u.interiorInverse.value);
    if (!volume.bounds.containsPoint(this.position)) return;
    u.interiorMin.value.copy(volume.bounds.min); u.interiorMax.value.copy(volume.bounds.max);
    u.interiorActive.value = true;
  }
}

export const interiorShader = /* glsl */`
  uniform bool interiorActive;
  uniform mat4 interiorInverse;
  uniform vec3 interiorMin, interiorMax;
  float indoorDistance(vec3 origin, vec3 ray) {
    if (!interiorActive) return 0.0;
    vec3 p = (interiorInverse * vec4(origin, 1.0)).xyz;
    vec3 d = mat3(interiorInverse) * ray;
    vec3 safeD = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), d)) * max(abs(d), vec3(0.00001));
    vec3 limits = mix(interiorMin, interiorMax, step(vec3(0.0), d));
    vec3 exitAt = (limits - p) / safeD;
    return max(0.0, min(exitAt.x, min(exitAt.y, exitAt.z)));
  }
`;
