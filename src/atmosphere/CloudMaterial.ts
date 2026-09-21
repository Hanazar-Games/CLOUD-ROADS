import { Matrix4, ShaderMaterial, Vector2 } from 'three';
import { CLOUD_BASE, CLOUD_RELIEF, CLOUD_TILE, CLOUD_TOP } from './CloudField';
import type { SunSystem } from './SunSystem';
import { skyShader } from './SkyShader';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const fxaa = FXAAShader.fragmentShader.slice(FXAAShader.fragmentShader.indexOf('#define EDGE_STEP_COUNT'), FXAAShader.fragmentShader.lastIndexOf('void main()'));

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
        antialias: { value: true }, pixelSize: { value: new Vector2(1, 1) }, cloudSteps: { value: 20 },
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
        uniform bool antialias;
        uniform vec2 pixelSize;
        uniform float cloudSteps;
        ${fxaa}
        ${skyShader}
        const float cloudBase = ${CLOUD_BASE.toFixed(1)};
        const float cloudTop = ${CLOUD_TOP.toFixed(1)};
        const float cloudTile = ${CLOUD_TILE.toFixed(1)};
        const float cloudRelief = ${CLOUD_RELIEF.toFixed(1)};

        vec3 fieldAt(vec2 point) { return texture2D(cloudField, point / cloudTile).rgb; }

        float densityAt(vec2 point, float height) {
          vec3 field = fieldAt(point);
          float top = cloudTop + (field.g - 0.5) * cloudRelief + (field.b - 0.5) * 48.0;
          return smoothstep(cloudBase, cloudBase + 100.0, height)
            * (1.0 - smoothstep(top - 90.0, top, height)) * (0.85 + field.r * 0.15);
        }

        float fogAmount(float distance, vec3 ray) {
          float base = smoothstep(fogRange.x, fogRange.y, distance);
          float falloff = clamp(ray.y * min(distance, fogRange.y) * 0.003, -1.2, 1.2);
          float layer = abs(falloff) < 0.01 ? 1.0 : (1.0 - exp(-falloff)) / falloff;
          return 1.0 - pow(max(0.0, 1.0 - base), mix(1.0, layer, weatherCover));
        }

        void main() {
          vec3 scene = antialias ? ApplyFXAA(sceneColor, pixelSize, vUv).rgb : texture2D(sceneColor, vUv).rgb;
          vec4 view = inverseProjection * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec3 direction = normalize(view.xyz / view.w);
          vec3 ray = mat3(cameraWorld) * direction;
          float depth = texture2D(sceneDepth, vUv).x;
          float distanceToScene = depth < 1.0
            ? -perspectiveDepthToViewZ(depth, nearFar.x, nearFar.y) / -direction.z : 1e8;
          vec3 haze = airColor(ray);
          scene = depth >= 1.0 ? skyColor(ray)
            : mix(scene, haze, fogAmount(distanceToScene, ray));
          vec4 clouds = vec4(0.0);
          if (cloudsEnabled && immersion < 0.995) {
            float start = 0.0, end = min(distanceToScene, mix(6500.0, min(6500.0, fogRange.y), weatherCover));
            if (abs(ray.y) > 0.0001) {
              float baseHit = (cloudBase - altitude) / ray.y;
              float topHit = (cloudTop + cloudRelief * 0.5 + 24.0 - altitude) / ray.y;
              start = max(0.0, min(baseHit, topHit));
              end = min(end, max(baseHit, topHit));
            } else if (altitude < cloudBase || altitude > cloudTop + cloudRelief * 0.5 + 24.0) end = 0.0;
            float stepSize = max(0.0, end - start) / cloudSteps;
            for (int i = 0; i < 28; i++) {
              if (float(i) >= cloudSteps || stepSize <= 0.0 || clouds.a > 0.995) break;
              float t = start + (float(i) + 0.5) * stepSize;
              float height = altitude + ray.y * t;
              vec2 point = phase + ray.xz * t;
              float density = densityAt(point, height);
              if (density < 0.001) continue;
              float opacity = (1.0 - exp(-density * stepSize * 0.009))
                * smoothstep(0.0, 35.0, t)
                * (1.0 - smoothstep(4000.0, 6500.0, t));
              float shadow = densityAt(point + sunDirection.xz * 60.0, height + sunDirection.y * 60.0)
                + densityAt(point + sunDirection.xz * 180.0, height + sunDirection.y * 180.0) * 1.4;
              float light = exp(-shadow * 1.65);
              float layer = clamp((height - cloudBase) / (cloudTop - cloudBase), 0.0, 1.0);
              float silver = pow(max(dot(ray, sunDirection), 0.0), 12.0) * (1.0 - density * 0.6);
              vec3 color = ambientColor * mix(0.24, 0.46, layer)
                + sunColor * (light * 0.8 + silver * 0.22) * solar.x * (1.0 - weatherCover * 0.75);
              float mist = fogAmount(t, ray);
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
