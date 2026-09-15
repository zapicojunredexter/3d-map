import * as THREE from 'three'
import { FEATURE_ID } from './mergeWorld'

// Every building is one triangle range inside a single merged mesh, so there is
// no material to swap for a hover. Instead the shader compares each vertex's
// feature tag against one uniform and lights up the match. That keeps the city
// at one draw call and makes the hover cost a single uniform write.

export const NO_HIGHLIGHT = -1

// One uniform can only name one building, so two cannot glow at once and a
// crossfade is not available. Dimming the old one out before bringing the new
// one up costs a beat either side of a switch, which is what makes the glow
// feel like it is warming up rather than being toggled.
export const HIGHLIGHT_FADE_SECONDS = 0.15

// Marker chunks three has shipped for many versions. Declarations go next to
// <common>, which sits outside main() in both stages.
const COMMON = '#include <common>'
const VERTEX_MAIN = '#include <begin_vertex>'
const EMISSIVE = '#include <emissivemap_fragment>'
const DIFFUSE = '#include <color_fragment>'

// Unindented: three rewrites leading `attribute`/`varying` for WebGL2, and it
// matches at the start of a line.
const VERTEX_PARS = `
attribute float ${FEATURE_ID};
uniform float uHighlightFeature;
uniform float uHighlightLevel;
varying float vFeatureHighlight;
`

// Smoothstepped, so the ramp eases in and out instead of reading as a linear
// dimmer sweep.
const VERTEX_BODY = `
float highlightMatch = step(abs(${FEATURE_ID} - uHighlightFeature), 0.5);
float highlightEased = uHighlightLevel * uHighlightLevel * (3.0 - 2.0 * uHighlightLevel);
vFeatureHighlight = highlightMatch * highlightEased;
`

const FRAGMENT_PARS = `
uniform vec3 uHighlightColor;
uniform float uHighlightStrength;
varying float vFeatureHighlight;
`

// Emissive reads as a genuine glow rather than a brighter surface.
const FRAGMENT_EMISSIVE = `
totalEmissiveRadiance += uHighlightColor * uHighlightStrength * vFeatureHighlight;
`

// MeshBasicMaterial has no emissive channel, so the hologram brightens instead.
const FRAGMENT_DIFFUSE = `
diffuseColor.rgb += uHighlightColor * uHighlightStrength * vFeatureHighlight;
`

// A missing marker means a three version moved the chunk. Skipping the
// injection loses the glow but never breaks the render.
function inject(source, marker, addition) {
  if (!source.includes(marker)) return source
  return source.replace(marker, `${marker}\n${addition}`)
}

export function attachHighlight(material, { color = '#ffd8a0', strength = 0.5 } = {}) {
  if (!material) return material
  if (material.userData.highlight) {
    const { uniforms } = material.userData.highlight
    uniforms.uHighlightColor.value.set(color)
    uniforms.uHighlightStrength.value = strength
    return material
  }

  const uniforms = {
    // What the shader is lighting right now, which lags the aim by a fade.
    uHighlightFeature: { value: NO_HIGHLIGHT },
    uHighlightLevel: { value: 0 },
    uHighlightColor: { value: new THREE.Color(color) },
    uHighlightStrength: { value: strength },
  }
  material.userData.highlight = { uniforms, target: NO_HIGHLIGHT }

  const earlier = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    earlier?.call(material, shader, renderer)
    // The same uniform objects go into every program this material compiles,
    // so mutating value afterwards reaches the GPU.
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = inject(shader.vertexShader, COMMON, VERTEX_PARS)
    shader.vertexShader = inject(shader.vertexShader, VERTEX_MAIN, VERTEX_BODY)
    shader.fragmentShader = inject(shader.fragmentShader, COMMON, FRAGMENT_PARS)
    shader.fragmentShader = shader.fragmentShader.includes(EMISSIVE)
      ? inject(shader.fragmentShader, EMISSIVE, FRAGMENT_EMISSIVE)
      : inject(shader.fragmentShader, DIFFUSE, FRAGMENT_DIFFUSE)
  }

  // Without this, three could hand a patched material a cached program built
  // from an identical unpatched one.
  material.customProgramCacheKey = () => 'featureHighlight'
  material.needsUpdate = true
  return material
}

// Only names where the glow should end up. Nothing changes on screen until
// advanceHighlight walks it there, so aiming can keep reporting at its own rate
// without the look jumping.
export function setHighlight(material, slot) {
  const state = material?.userData?.highlight
  if (!state) return false
  state.target = slot ?? NO_HIGHLIGHT
  return true
}

export function highlightTarget(material) {
  return material?.userData?.highlight?.target ?? null
}

// Returns whether the glow is still moving, so a caller can tell settled from
// animating. Safe to call every frame with nothing aimed.
export function advanceHighlight(
  material,
  delta,
  duration = HIGHLIGHT_FADE_SECONDS,
) {
  const state = material?.userData?.highlight
  if (!state) return false

  const { uniforms } = state
  const level = uniforms.uHighlightLevel
  // Spent on dimming out and then on coming up, so a frame long enough to
  // cover both does both instead of stalling half way.
  let budget = duration > 0 ? Math.abs(delta) / duration : 1

  if (uniforms.uHighlightFeature.value !== state.target) {
    // Hand the uniform over only once the old building is fully dark, or the
    // new one would inherit whatever brightness was left and pop.
    const spent = Math.min(budget, level.value)
    level.value -= spent
    budget -= spent
    if (level.value > 0) return true
    uniforms.uHighlightFeature.value = state.target
  }

  const wanted = state.target === NO_HIGHLIGHT ? 0 : 1
  if (level.value === wanted) return false

  level.value = THREE.MathUtils.clamp(
    level.value + (wanted === 1 ? budget : -budget),
    0,
    1,
  )
  return level.value !== wanted
}
