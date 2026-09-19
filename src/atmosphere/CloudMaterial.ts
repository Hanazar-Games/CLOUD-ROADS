import { Matrix4, ShaderMaterial, Vector2 } from 'three';
import { CLOUD_BASE, CLOUD_RELIEF, CLOUD_TILE, CLOUD_TOP } from './CloudField';
import type { SunSystem } from './SunSystem';
import { skyShader } from './SkyShader';

export class CloudMaterial extends ShaderMaterial {
  constructor(sun: SunSystem) {
    super({
      name: 'CloudSea', depthTest: false, depthWrite: false,
      uniforms: {
        sceneColor: { value: null }, sceneDepth: { value: null }, cloudField: { value: null },
        inverseProjection: { value: new Matrix4() }, cameraWorld: { value: new Matrix4() },
        phase: { value: new Vector2() }, altitude: { value: 0 },
        nearFar: { value: new Vector2(0.5, 7000) }, fogRange: { value: new Vector2(1000, 1950) },
        cloudsEnabled: { value: true }, immersion: { value: 0 },
        weatherCover: { value: 0 }, nightAmount: { value: 0 },
        sunDirection: { value: sun.direction }, sunColor: { value: sun.sunColor }, solar: { value: sun.light },
        zenithColor: { value: sun.zenith }, horizonColor: { value: sun.horizon },
        hazeColor: { value: sun.haze }, ambientColor: { value: sun.ambient },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        #include <packing>
        varying vec2 vUv;
        uniform sampler2D sceneColor, sceneDepth, cloudField;
        uniform mat4 inverseProjection, cameraWorld;
        uniform vec2 phase, nearFar, fogRange;
        uniform float altitude;
        uniform bool cloudsEnabled;
        ${skyShader}
        const float cloudBase = ${CLOUD_BASE.toFixed(1)};
        const float cloudTop = ${CLOUD_TOP.toFixed(1)};
        const float cloudTile = ${CLOUD_TILE.toFixed(1)};
        const float cloudRelief = ${CLOUD_RELIEF.toFixed(1)};

        vec3 fieldAt(vec2 point) { return texture2D(cloudField, point / cloudTile).rgb; }

        void main() {
          vec3 scene = texture2D(sceneColor, vUv).rgb;
          vec4 view = inverseProjection * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec3 direction = normalize(view.xyz / view.w);
          vec3 ray = mat3(cameraWorld) * direction;
          float depth = texture2D(sceneDepth, vUv).x;
          float distanceToScene = depth < 1.0
            ? -perspectiveDepthToViewZ(depth, nearFar.x, nearFar.y) / -direction.z : 1e8;
          vec3 haze = airColor(ray);
          scene = depth >= 1.0 ? skyColor(ray)
            : mix(scene, haze, smoothstep(fogRange.x, fogRange.y, distanceToScene * -direction.z));
          vec4 clouds = vec4(0.0);
          if (cloudsEnabled && abs(ray.y) > 0.0001) {
            for (int i = 0; i < 8; i++) {
              float layer = ray.y > 0.0 ? (float(i) + 0.5) / 8.0 : 1.0 - (float(i) + 0.5) / 8.0;
              float height = mix(cloudBase, cloudTop + cloudRelief * 0.5, layer);
              float t = (height - altitude) / ray.y;
              if (t <= 0.0 || t >= min(distanceToScene, 6500.0)) continue;
              vec2 point = phase + ray.xz * t;
              vec3 field = fieldAt(point);
              float detail = fieldAt(point * 3.0).b;
              float top = cloudTop + (field.g - 0.5) * cloudRelief;
              float density = smoothstep(cloudBase, cloudBase + 100.0, height)
                * (1.0 - smoothstep(top - 120.0, top, height)) * (0.85 + field.r * 0.15);
              float thickness = (cloudTop + cloudRelief * 0.5 - cloudBase) / 8.0;
              float opacity = (1.0 - exp(-density * thickness * 0.009 / max(abs(ray.y), 0.12)))
                * smoothstep(0.0, 65.0, t)
                * smoothstep(0.0, 90.0, distanceToScene - t)
                * (1.0 - smoothstep(4000.0, 6500.0, t));
              float slopeX = (fieldAt(point + vec2(64.0, 0.0)).g - fieldAt(point - vec2(64.0, 0.0)).g) * cloudRelief / 128.0;
              float slopeZ = (fieldAt(point + vec2(0.0, 64.0)).g - fieldAt(point - vec2(0.0, 64.0)).g) * cloudRelief / 128.0;
              float light = max(0.0, dot(normalize(vec3(-slopeX, 1.0, -slopeZ)), sunDirection));
              float shade = clamp(field.g * 0.6 + detail * 0.4, 0.0, 1.0);
              float silver = pow(max(dot(ray, sunDirection), 0.0), 16.0) * 0.16;
              vec3 color = ambientColor * mix(0.3, 0.7, shade)
                + sunColor * (light * 0.55 + silver) * solar.x;
              color *= mix(0.65, 1.0, layer);
              // Nearby layers fade into the same fog as the terrain when crossing a cloud.
              float mist = smoothstep(fogRange.x, fogRange.y, t * -direction.z);
              color = mix(color, haze, max(mist, immersion));
              clouds.rgb += (1.0 - clouds.a) * opacity * color;
              clouds.a += (1.0 - clouds.a) * opacity;
            }
          }
          gl_FragColor = vec4(clouds.rgb + scene * (1.0 - clouds.a), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  }
}
