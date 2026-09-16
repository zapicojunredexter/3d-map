// Soft night dots around the explorer — no assets, just a Points cloud.
import * as THREE from 'three'

export const FIREFLY_COUNT = 1000
export const FIREFLY_RADIUS = 48
export const FIREFLY_HEIGHT_MIN = 0.35
export const FIREFLY_HEIGHT_MAX = 7.5
export const FIREFLY_SIZE = 0.25
// orange: #FF9F1C green: #e8ff9a
export const FIREFLY_COLOR = '#FFAA00'
export const FIREFLY_GLOW_SIZE = 64
// Dim floor so bugs never vanish mid-pulse (relative brightness).
export const FIREFLY_PULSE_MIN = 0.28
// Angular speed range → roughly 2.5–6s glow cycles.
export const FIREFLY_PULSE_SPEED_MIN = 1.05
export const FIREFLY_PULSE_SPEED_MAX = 2.4

// A few real point lights ride nearby bugs so grass/walls pick up their glow
// (hundreds of PointLights would melt the GPU).
export const FIREFLY_LIGHT_COUNT = FIREFLY_COUNT * 0.01
export const FIREFLY_LIGHT_BRIGHTNESS = 20
export const FIREFLY_LIGHT_DISTANCE = 14
export const FIREFLY_LIGHT_DECAY = 2
export const FIREFLY_LIGHT_COLOR = '#FFAA00'

// Soft round sprite: hot core + torch-like halo (additive).
export function createFireflyGlowTexture(size = FIREFLY_GLOW_SIZE) {
  if (typeof document === 'undefined') {
    const data = new Uint8Array([255, 255, 220, 255])
    const texture = new THREE.DataTexture(data, 1, 1)
    texture.needsUpdate = true
    return texture
  }

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const data = new Uint8Array([255, 255, 220, 255])
    const texture = new THREE.DataTexture(data, 1, 1)
    texture.needsUpdate = true
    return texture
  }
  const mid = size / 2
  const gradient = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid)
  gradient.addColorStop(0, 'rgba(255,255,230,1)')
  gradient.addColorStop(0.12, 'rgba(255,240,140,0.95)')
  gradient.addColorStop(0.35, 'rgba(210,255,120,0.45)')
  gradient.addColorStop(0.65, 'rgba(160,255,90,0.12)')
  gradient.addColorStop(1, 'rgba(120,255,80,0)')
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

// Seeded layout so the cloud is stable across reloads.
export function createFireflyField(
  count = FIREFLY_COUNT,
  {
    radius = FIREFLY_RADIUS,
    heightMin = FIREFLY_HEIGHT_MIN,
    heightMax = FIREFLY_HEIGHT_MAX,
  } = {},
) {
  const positions = new Float32Array(count * 3)
  // phase, drift speed, bob amplitude, twinkle speed, glow pulse speed
  const phases = new Float32Array(count * 5)
  let seed = 20260916
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2
    const dist = Math.sqrt(random()) * radius
    positions[i * 3] = Math.cos(angle) * dist
    positions[i * 3 + 1] = heightMin + random() * (heightMax - heightMin)
    positions[i * 3 + 2] = Math.sin(angle) * dist

    const i5 = i * 5
    phases[i5] = random() * Math.PI * 2
    phases[i5 + 1] = 0.15 + random() * 0.55
    phases[i5 + 2] = 0.12 + random() * 0.45
    phases[i5 + 3] = 0.6 + random() * 1.2
    phases[i5 + 4] =
      FIREFLY_PULSE_SPEED_MIN +
      random() * (FIREFLY_PULSE_SPEED_MAX - FIREFLY_PULSE_SPEED_MIN)
  }

  return { positions, phases, count, radius, heightMin, heightMax }
}

// Soft sine glow: staggered so the cloud breathes, not flashes in sync.
export function fireflyPulse(time, phase, pulseSpeed) {
  const wave = 0.5 + 0.5 * Math.sin(time * pulseSpeed + phase)
  return FIREFLY_PULSE_MIN + (1 - FIREFLY_PULSE_MIN) * wave
}

// Spread light hosts across the cloud so pools don't all stack on one bug.
export function fireflyLightIndices(
  count,
  lightCount = FIREFLY_LIGHT_COUNT,
) {
  const n = Math.max(0, Math.min(lightCount, count))
  const indices = new Array(n)
  for (let i = 0; i < n; i += 1) {
    indices[i] = Math.floor(((i + 0.5) * count) / n) % count
  }
  return indices
}

export function fireflyLightIntensity(strength, pulse) {
  return Math.max(0, strength) * FIREFLY_LIGHT_BRIGHTNESS * pulse
}

// Patch PointsMaterial so each bug can scale size + alpha independently.
export function applyFireflyPulseShader(material) {
  const earlier = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    earlier?.call(material, shader, renderer)
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'attribute float aPulse;\nvarying float vPulse;\nvoid main() {',
    )
    shader.vertexShader = shader.vertexShader.replace(
      'gl_PointSize = size;',
      'vPulse = aPulse;\ngl_PointSize = size * aPulse;',
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'varying float vPulse;\nvoid main() {',
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      'vec4 diffuseColor = vec4( diffuse, opacity * vPulse );',
    )
  }
  material.customProgramCacheKey = () => 'fireflyPulse'
  material.needsUpdate = true
  return material
}
