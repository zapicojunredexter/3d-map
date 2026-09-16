// Soft night dots around the explorer — no assets, just a Points cloud.
import * as THREE from 'three'

export const FIREFLY_COUNT = 1000
export const FIREFLY_RADIUS = 48
export const FIREFLY_HEIGHT_MIN = 0.05
export const FIREFLY_HEIGHT_MAX = 10
export const FIREFLY_SIZE = 0.25
// Edit this list — each bug slowly lerps through the palette.
export const FIREFLY_COLORS = [
  '#FFE066', // Bright Canary
  '#FFC033', // Warm Marigold
  '#FFA420', // Vibrant Amber
  '#FF8811', // Fiery Coral
  '#E67300' // Deep Ochre

  // 'yellow',
  // '#FF9F1C', // orange
  // // '#e8ff9a', // green
  // // '#A2E8DD', // teal
  // // '#4DE64D', // neon green
  // '#FFB347', // golden amber
]
export const FIREFLY_COLOR = FIREFLY_COLORS[0]
// How fast they walk the palette (cycles per second across the whole list).
export const FIREFLY_COLOR_SHIFT_SPEED = 0.08
export const FIREFLY_GLOW_SIZE = 64
// Dim floor so bugs never vanish mid-pulse (relative brightness).
export const FIREFLY_PULSE_MIN = 0.28
// Angular speed range → roughly 2.5–6s glow cycles.
export const FIREFLY_PULSE_SPEED_MIN = 1.05
export const FIREFLY_PULSE_SPEED_MAX = 2.4

// A few real point lights ride nearby bugs so grass/walls pick up their glow
// (hundreds of PointLights would melt the GPU).
export const FIREFLY_LIGHT_COUNT = FIREFLY_COUNT * 0
export const FIREFLY_LIGHT_BRIGHTNESS = 20
export const FIREFLY_LIGHT_DISTANCE = 14
export const FIREFLY_LIGHT_DECAY = 2
export const FIREFLY_LIGHT_COLOR = FIREFLY_COLORS[0]

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
  // Neutral white halo so vertex colors tint cleanly.
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.12, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.12)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
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

// Precompute RGB triples (0–1) from the editable hex list.
export function parseFireflyPalette(colors = FIREFLY_COLORS) {
  const list = colors?.length ? colors : [FIREFLY_COLOR]
  return list.map((hex) => {
    const color = new THREE.Color(hex)
    return [color.r, color.g, color.b]
  })
}

// Walk the palette with a staggered phase; writes into `out` [r,g,b].
export function fireflyColorAt(
  time,
  phase,
  palette,
  speed = FIREFLY_COLOR_SHIFT_SPEED,
  out = [0, 0, 0],
) {
  const n = palette.length
  if (n === 0) {
    out[0] = 1
    out[1] = 1
    out[2] = 1
    return out
  }
  if (n === 1) {
    out[0] = palette[0][0]
    out[1] = palette[0][1]
    out[2] = palette[0][2]
    return out
  }

  const cycle = ((time * speed + phase / (Math.PI * 2)) % 1 + 1) % 1
  const scaled = cycle * n
  const i0 = Math.floor(scaled) % n
  const i1 = (i0 + 1) % n
  const mix = scaled - Math.floor(scaled)
  const a = palette[i0]
  const b = palette[i1]
  out[0] = a[0] + (b[0] - a[0]) * mix
  out[1] = a[1] + (b[1] - a[1]) * mix
  out[2] = a[2] + (b[2] - a[2]) * mix
  return out
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
