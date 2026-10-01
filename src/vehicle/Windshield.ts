import { BoxGeometry, CylinderGeometry, DataTexture, DoubleSide, Group, LinearFilter, Mesh, MeshStandardMaterial, PlaneGeometry, RedFormat, ShaderMaterial, type BufferGeometry } from 'three';
import type { VehicleSystems } from './VehicleSystems';
import { GLASS_COLUMNS, GLASS_ROWS, WindshieldRain } from './WindshieldRain';
import { wiperLayout } from './WiperLayout';
import { mergeVehicleParts } from './VehicleGeometry';

export class Windshield {
  readonly root = new Group();
  readonly rain: WindshieldRain;
  private readonly rubber = new MeshStandardMaterial({ color: 0x172022, roughness: 0.85 });
  private readonly armMaterial = new MeshStandardMaterial({ color: 0x3b494f, roughness: 0.42, metalness: 0.65 });
  private readonly box = new BoxGeometry();
  private readonly joint = new CylinderGeometry(1, 1, 1, 10);
  private readonly blades: Group[] = [];
  private readonly texture: DataTexture;
  private readonly film: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly layout;
  private readonly merged: BufferGeometry[] = [];

  constructor(window: Mesh, width: number, height: number) {
    this.root.position.copy(window.position); this.root.quaternion.copy(window.quaternion);
    window.parent!.add(this.root);
    const { radius, pivots, y } = this.layout = wiperLayout(width, height);
    for (const x of pivots) {
      const pivot = new Group(); pivot.name = 'wiper-pivot'; pivot.position.set(x, y, -0.033); this.root.add(pivot);
      const block = (length: number, width: number, depth: number, x: number, z: number, material = this.armMaterial) => {
        const mesh = new Mesh(this.box, material); mesh.scale.set(length, width, depth); mesh.position.set(x, 0, z); pivot.add(mesh); return mesh;
      };
      const bar = (ax: number, az: number, bx: number, bz: number, width: number, depth: number) => {
        const mesh = block(Math.hypot(bx - ax, bz - az), width, depth, (ax + bx) / 2, (az + bz) / 2);
        mesh.rotation.y = -Math.atan2(bz - az, bx - ax);
      };
      for (const [r, depth, z, material] of [[0.03, 0.028, -0.006, this.rubber], [0.023, 0.024, -0.027, this.armMaterial]] as const) {
        const joint = new Mesh(this.joint, material); joint.scale.set(r, depth, r); joint.rotation.x = Math.PI / 2;
        joint.position.z = z; pivot.add(joint);
      }
      bar(0, -0.025, radius * 0.18, -0.045, 0.024, 0.018);
      bar(radius * 0.18, -0.045, radius * 0.71, -0.057, 0.015, 0.014);
      block(radius * 0.58, 0.024, 0.012, radius * 0.71, 0, this.rubber);
      for (const t of [0.435, 0.985]) block(radius * 0.03, 0.028, 0.024, radius * t, -0.006, this.rubber);
      for (let i = 0; i < 8; i++) {
        const a = i / 8, b = (i + 1) / 8;
        bar(radius * (0.44 + a * 0.54), -0.015 - Math.sin(a * Math.PI) * 0.04,
          radius * (0.44 + b * 0.54), -0.015 - Math.sin(b * Math.PI) * 0.04, 0.018, 0.012);
      }
      for (const t of [0.5, 0.71, 0.92]) block(radius * 0.026, 0.034, t === 0.71 ? 0.046 : 0.025, radius * t, t === 0.71 ? -0.032 : -0.017);
      this.blades.push(pivot);
      pivot.rotation.z = this.layout.start;
      this.merged.push(...mergeVehicleParts(pivot));
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
    this.film.name = 'windshield-water';
    this.film.position.z = -0.02; this.film.visible = false; this.film.renderOrder = 2;
    this.root.add(this.film);
  }

  update(dt: number, systems: VehicleSystems, speed: number): void {
    for (const blade of this.blades) blade.rotation.z = this.layout.start + systems.sweep * this.layout.arc;
    if (!this.rain.update(dt, systems.rain, systems.sweepFrom, systems.sweepTo, speed, systems.washerSpray)) return;
    this.texture.needsUpdate = true;
    this.film.material.uniforms.time.value = this.rain.time;
    this.film.visible = this.rain.coverage > 0.002;
  }

  dispose(): void {
    this.root.removeFromParent(); this.film.geometry.dispose(); this.film.material.dispose(); this.texture.dispose(); this.box.dispose(); this.joint.dispose(); this.rubber.dispose(); this.armMaterial.dispose();
    this.merged.forEach(geometry => geometry.dispose());
  }
}
