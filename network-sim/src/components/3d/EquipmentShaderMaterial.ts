import * as THREE from 'three';

/**
 * EquipmentShaderMaterial – Analytical CAD Mode
 *
 * Lightweight flat-shaded material for instanced equipment slots.
 * Purely procedural patterns, no heavy PBR / emissive animations.
 * Designed for hyperscale performance: < 150 draw calls.
 */
export const EquipmentShaderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uLOD: { value: 2.0 },
    uGlobalIntensity: { value: 1.0 }
  },
  vertexShader: `
    attribute float instPatternType;   // 0:Lines, 1:Grid, 2:Slits, 3:Solid, 4:Hollow
    attribute float instActivityState; // 0:Idle, 1:Active, 2:Overloaded, 3:Failing, 4:Dead
    attribute float instDensity;
    attribute float instEmissiveIntensity;
    attribute float instHovered;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying float vPatternType;
    varying float vActivityState;
    varying float vDensity;
    varying float vEmissiveIntensity;
    varying float vHovered;

    void main() {
      vUv = uv;
      vPatternType = instPatternType;
      vActivityState = instActivityState;
      vDensity = instDensity;
      vEmissiveIntensity = instEmissiveIntensity;
      vHovered = instHovered;

      vec4 worldPos = instanceMatrix * vec4(position, 1.0);
      vNormal = normalize(mat3(instanceMatrix) * normal);

      gl_Position = projectionMatrix * modelViewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uLOD;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying float vPatternType;
    varying float vActivityState;
    varying float vDensity;
    varying float vEmissiveIntensity;
    varying float vHovered;

    float horizontal_lines(vec2 uv, float density) {
      return step(0.45, fract(uv.y * density * 18.0));
    }

    float grid_vents(vec2 uv, float density) {
      vec2 g = fract(uv * density * 14.0);
      return step(0.25, g.x) * step(0.25, g.y);
    }

    float vertical_slits(vec2 uv, float density) {
      return step(0.4, fract(uv.x * density * 28.0)) * step(0.1, uv.y) * step(uv.y, 0.9);
    }

    void main() {
      vec3 normal = normalize(vNormal);

      // Light grey CAD base – clearly visible on dark bg
      vec3 color = vec3(0.72, 0.76, 0.82);

      // Pattern modulation
      if (vPatternType < 0.5) {
        float p = horizontal_lines(vUv, vDensity);
        color = mix(color * 0.78, color, p);
      } else if (vPatternType < 1.5) {
        float p = grid_vents(vUv, vDensity);
        color = mix(color * 0.65, color, p);
      } else if (vPatternType < 2.5) {
        float p = vertical_slits(vUv, vDensity);
        color = mix(color * 0.6, color, p);
      } else if (vPatternType > 3.5) {
        discard; // Hollow slot – empty rack space
      }

      // Activity State: simple tint only, no animation
      vec3 tint = vec3(0.0);
      if (vActivityState > 2.5 && vActivityState < 3.5) {
        tint = vec3(0.9, 0.2, 0.1) * 0.25; // Failing – red cast
      } else if (vActivityState > 1.5) {
        tint = vec3(1.0, 0.7, 0.1) * 0.15; // Overloaded – amber
      }

      // Hover outline
      if (vHovered > 0.5) {
        float onEdge = 1.0 - step(0.03, vUv.x) * step(vUv.x, 0.97)
                              * step(0.03, vUv.y) * step(vUv.y, 0.97);
        tint += vec3(0.0, 0.6, 1.0) * onEdge * 1.8;
      }

      // Flat analytical diffuse: single fixed light direction
      float nDotL = max(dot(normal, normalize(vec3(0.5, 1.0, 0.3))), 0.0);
      float lit = 0.5 + 0.5 * nDotL;

      gl_FragColor = vec4(color * lit + tint, 1.0);
    }
  `,
  transparent: false,
  lights: false,
});
