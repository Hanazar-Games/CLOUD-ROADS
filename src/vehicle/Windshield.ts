import { BoxGeometry, DataTexture, DoubleSide, Group, LinearFilter, Mesh, MeshStandardMaterial, PlaneGeometry, RedFormat, ShaderMaterial } from 'three';
import type { VehicleSystems } from './VehicleSystems';
import { GLASS_COLUMNS, GLASS_ROWS, WindshieldRain } from './WindshieldRain';

export class Windshield {
  readonly root = new Group();
  readonly rain: WindshieldRain;
  private readonly rubber = new MeshStandardMaterial({ color: 0x172022, roughness: 0.85 });
  private readonly box = new BoxGeometry();
  private readonly blades: Group[] = [];
  private readonly texture: DataTexture;
  private readonly film: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor(window: Mesh, width: number, height: number) {
    this.root.position.copy(window.position); this.root.quaternion.copy(window.quaternion);
    window.parent!.add(this.root);
    const radius = Math.min(height * 0.93, width * 0.44);
    for (const x of [-0.46, 0.04]) {
      const pivot = new Group(); pivot.position.set(x * width, -height * 0.44, -0.03); this.root.add(pivot);
      const arm = new Mesh(this.box, this.rubber); arm.scale.set(radius * 0.6, 0.013, 0.015); arm.position.x = radius * 0.3;
      const blade = new Mesh(this.box, this.rubber); blade.scale.set(radius * 0.58, 0.024, 0.018);
      blade.position.set(radius * 0.71, 0, -0.009); pivot.add(arm, blade); this.blades.push(pivot);
      pivot.rotation.z = 0.08;
    }
    this.rain = new WindshieldRain(width, height);
    this.texture = new DataTexture(this.rain.data, GLASS_COLUMNS, GLASS_ROWS, RedFormat);
    this.texture.minFilter = this.texture.magFilter = LinearFilter; this.texture.needsUpdate = true;
    const material = new ShaderMaterial({
      transparent: true, depthWrite: false, side: DoubleSide,
      uniforms: { wetness: { value: this.texture }, time: { value: 0 } },
      vertexShader: `varying vec2 glassUv;
        void main() { glassUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 glassUv;
        uniform sampler2D wetness;
        uniform float time;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          float wet = texture2D(wetness, glassUv).r;
          vec2 cell = glassUv * vec2(68.0, 38.0), id = floor(cell);
          vec2 center = vec2(0.25 + hash(id) * 0.5, 0.25 + hash(id + 17.0) * 0.5);
          vec2 p = (fract(cell) - center) * vec2(1.0, mix(0.65, 1.0, hash(id + 29.0)));
          float radius = max(0.001, mix(0.065, 0.25, hash(id + 51.0)) * sqrt(wet));
          float d = length(p), aa = max(fwidth(d), 0.012);
          float drop = 1.0 - smoothstep(radius - aa, radius + aa, d);
          float rim = smoothstep(radius * 0.55, radius, d) * drop;
          float light = rim * smoothstep(0.1, 0.8, dot(p / max(d, 0.001), vec2(-0.6, 0.8)));
          float streak = pow(max(0.0, sin(glassUv.x * 370.0 + sin(glassUv.y * 9.0 + time * 0.12))), 24.0)
            * smoothstep(0.45, 1.0, wet) * (0.5 + sin(glassUv.y * 32.0 + time * 0.35) * 0.5);
          vec3 color = mix(vec3(0.035, 0.065, 0.08), vec3(0.65, 0.8, 0.85), light * 0.8);
          gl_FragColor = vec4(color, wet * (0.045 + drop * 0.12 + rim * 0.1 + light * 0.3 + streak * 0.14));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.film = new Mesh(new PlaneGeometry(width, height), material);
    this.film.position.z = -0.02; this.film.visible = false; this.film.renderOrder = 2;
    this.root.add(this.film);
  }

  update(dt: number, systems: VehicleSystems, speed: number): void {
    for (const blade of this.blades) blade.rotation.z = 0.08 + systems.sweep * 1.56;
    if (!this.rain.update(dt, systems.rain, systems.sweepFrom, systems.sweepTo, speed, systems.washerSpray)) return;
    this.texture.needsUpdate = true;
    this.film.material.uniforms.time.value = this.rain.time;
    this.film.visible = this.rain.coverage > 0.002;
  }

  dispose(): void {
    this.root.removeFromParent(); this.film.geometry.dispose(); this.film.material.dispose(); this.texture.dispose(); this.box.dispose(); this.rubber.dispose();
  }
}
