import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { FEATURE_ID } from './mergeWorld'
import {
  HIGHLIGHT_FADE_SECONDS,
  NO_HIGHLIGHT,
  advanceHighlight,
  attachHighlight,
  highlightTarget,
  setHighlight,
} from './featureHighlight'

// Compiling GLSL needs a GPU, so these drive onBeforeCompile with three's own
// shader source and assert on the strings and uniforms it hands back.
function compile(material, type = 'standard') {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib[type].vertexShader,
    fragmentShader: THREE.ShaderLib[type].fragmentShader,
  }
  material.onBeforeCompile(shader, null)
  return shader
}

// Enough frames at 60fps to finish one ramp, with headroom.
function settle(material, seconds = HIGHLIGHT_FADE_SECONDS * 3) {
  const frame = 1 / 60
  for (let elapsed = 0; elapsed < seconds; elapsed += frame) {
    advanceHighlight(material, frame)
  }
}

const level = (material) =>
  material.userData.highlight.uniforms.uHighlightLevel.value

const showing = (material) =>
  material.userData.highlight.uniforms.uHighlightFeature.value

describe('attachHighlight', () => {
  it('reads the feature tag in the vertex stage', () => {
    const shader = compile(attachHighlight(new THREE.MeshStandardMaterial()))

    expect(shader.vertexShader).toContain(`attribute float ${FEATURE_ID};`)
    expect(shader.vertexShader).toContain('vFeatureHighlight = highlightMatch')
    // Unindented, so three's WebGL2 rewrite of `attribute` and `varying` finds
    // them at the start of a line.
    expect(shader.vertexShader).toContain('\nattribute float')
    expect(shader.vertexShader).toContain('\nvarying float vFeatureHighlight;')
  })

  it('scales the glow by the ramp, so the fade reaches the shader', () => {
    const shader = compile(attachHighlight(new THREE.MeshStandardMaterial()))

    expect(shader.vertexShader).toContain('uniform float uHighlightLevel;')
    expect(shader.uniforms.uHighlightLevel.value).toBe(0)
  })

  it('glows lit materials through emissive, not diffuse', () => {
    const shader = compile(attachHighlight(new THREE.MeshStandardMaterial()))

    expect(shader.fragmentShader).toContain('totalEmissiveRadiance +=')
    expect(shader.fragmentShader).not.toContain('diffuseColor.rgb +=')
  })

  it('falls back to diffuse for materials with no emissive channel', () => {
    const shader = compile(attachHighlight(new THREE.MeshBasicMaterial()), 'basic')

    expect(shader.fragmentShader).toContain('diffuseColor.rgb +=')
    expect(shader.fragmentShader).not.toContain('totalEmissiveRadiance +=')
  })

  it('starts with nothing highlighted', () => {
    const shader = compile(attachHighlight(new THREE.MeshStandardMaterial()))

    expect(shader.uniforms.uHighlightFeature.value).toBe(NO_HIGHLIGHT)
  })

  it('shares one uniform object with every program it compiles', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())
    const first = compile(material)
    const second = compile(material)

    // Three recompiles on parameter changes, so the reference the ramp
    // mutates has to be the one every program already holds.
    setHighlight(material, 42)
    settle(material)
    expect(first.uniforms.uHighlightFeature.value).toBe(42)
    expect(first.uniforms.uHighlightLevel.value).toBe(1)
    expect(second.uniforms.uHighlightLevel).toBe(first.uniforms.uHighlightLevel)
  })

  it('takes a colour and strength per style', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial(), {
      color: '#00ff00',
      strength: 6,
    })
    const shader = compile(material)

    expect(shader.uniforms.uHighlightColor.value.getHex()).toBe(0x00ff00)
    expect(shader.uniforms.uHighlightStrength.value).toBe(6)
  })

  it('keeps the ramp out of the uniforms it hands the shader', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())
    const shader = compile(material)

    // target is bookkeeping, not something the GPU should be sent.
    expect(shader.uniforms.target).toBeUndefined()
  })

  it('retunes an already-patched material instead of stacking injections', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())
    attachHighlight(material, { color: '#ff0000', strength: 2 })
    const shader = compile(material)

    expect(shader.uniforms.uHighlightColor.value.getHex()).toBe(0xff0000)
    expect(shader.uniforms.uHighlightStrength.value).toBe(2)
    expect(shader.vertexShader.match(/attribute float featureId;/g)).toHaveLength(1)
  })

  it('keeps a material that already hooked onBeforeCompile', () => {
    const material = new THREE.MeshStandardMaterial()
    const earlier = vi.fn()
    material.onBeforeCompile = earlier
    attachHighlight(material)
    const shader = compile(material)

    expect(earlier).toHaveBeenCalledOnce()
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance +=')
  })

  it('does not let three reuse an unpatched program', () => {
    const plain = new THREE.MeshStandardMaterial()
    const glowing = attachHighlight(new THREE.MeshStandardMaterial())

    expect(glowing.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey())
  })

  it('renders unchanged when a three version moves the marker chunks', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())
    const shader = {
      uniforms: {},
      vertexShader: 'void main() {}',
      fragmentShader: 'void main() {}',
    }

    expect(() => material.onBeforeCompile(shader, null)).not.toThrow()
    expect(shader.vertexShader).toBe('void main() {}')
  })
})

describe('setHighlight', () => {
  it('asks for a building without lighting it yet', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())
    setHighlight(material, 3)

    // The whole point of the fade: aiming records the destination only.
    expect(highlightTarget(material)).toBe(3)
    expect(level(material)).toBe(0)
  })

  it('clears on null', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())

    setHighlight(material, 3)
    settle(material)
    setHighlight(material, null)
    settle(material)

    expect(showing(material)).toBe(NO_HIGHLIGHT)
    expect(level(material)).toBe(0)
  })

  it('highlights slot zero rather than treating it as empty', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())

    setHighlight(material, 0)
    settle(material)
    expect(showing(material)).toBe(0)
    expect(level(material)).toBe(1)
  })

  it('reports when a material cannot glow', () => {
    expect(setHighlight(new THREE.MeshStandardMaterial(), 1)).toBe(false)
    expect(setHighlight(undefined, 1)).toBe(false)
    expect(setHighlight(attachHighlight(new THREE.MeshStandardMaterial()), 1)).toBe(true)
  })
})

describe('advanceHighlight', () => {
  it('ramps up over the fade rather than switching on', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())
    setHighlight(material, 5)

    const seen = []
    for (let frame = 0; frame < 6; frame += 1) {
      advanceHighlight(material, HIGHLIGHT_FADE_SECONDS / 6)
      seen.push(level(material))
    }

    // Climbing, and not there on the first frame.
    expect(seen[0]).toBeGreaterThan(0)
    expect(seen[0]).toBeLessThan(0.5)
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
    }
    expect(seen.at(-1)).toBeCloseTo(1)
  })

  it('takes about the fade duration to come up', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())
    setHighlight(material, 5)

    // One frame short, so rounding cannot make this pass by accident.
    advanceHighlight(material, HIGHLIGHT_FADE_SECONDS * 0.9)
    expect(level(material)).toBeLessThan(1)

    advanceHighlight(material, HIGHLIGHT_FADE_SECONDS * 0.2)
    expect(level(material)).toBe(1)
  })

  it('dims the old building fully before the new one lights up', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())
    setHighlight(material, 1)
    settle(material)

    setHighlight(material, 2)
    // Mid-handover the shader must still be on the old building, part dimmed.
    advanceHighlight(material, HIGHLIGHT_FADE_SECONDS / 2)
    expect(showing(material)).toBe(1)
    expect(level(material)).toBeLessThan(1)
    expect(level(material)).toBeGreaterThan(0)

    settle(material)
    expect(showing(material)).toBe(2)
    expect(level(material)).toBe(1)
  })

  it('never hands over a half-lit building, however fast the aim flicks', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())
    setHighlight(material, 1)
    settle(material)

    // Switch targets every frame; the level must never jump upward while the
    // shader is still showing the outgoing building.
    let previous = level(material)
    for (let slot = 2; slot < 12; slot += 1) {
      const wasShowing = showing(material)
      setHighlight(material, slot)
      advanceHighlight(material, HIGHLIGHT_FADE_SECONDS / 4)
      if (showing(material) === wasShowing) {
        expect(level(material)).toBeLessThanOrEqual(previous)
      }
      previous = level(material)
    }
  })

  it('goes straight up when nothing was lit, with no wasted fade out', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())
    setHighlight(material, 4)

    advanceHighlight(material, HIGHLIGHT_FADE_SECONDS / 10)
    // Not stuck dimming an empty slot first.
    expect(showing(material)).toBe(4)
    expect(level(material)).toBeGreaterThan(0)
  })

  it('reports settled once the ramp finishes, so it can idle', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())

    expect(advanceHighlight(material, 0.016)).toBe(false)

    setHighlight(material, 9)
    expect(advanceHighlight(material, 0.016)).toBe(true)

    settle(material)
    expect(advanceHighlight(material, 0.016)).toBe(false)
  })

  it('survives a long frame without overshooting the ramp', () => {
    const material = attachHighlight(new THREE.MeshStandardMaterial())
    setHighlight(material, 3)
    // A backgrounded tab hands back a delta of seconds.
    advanceHighlight(material, 12)

    expect(level(material)).toBe(1)

    setHighlight(material, null)
    advanceHighlight(material, 12)
    expect(level(material)).toBe(0)
    expect(showing(material)).toBe(NO_HIGHLIGHT)
  })

  it('does nothing to a material that cannot glow', () => {
    expect(advanceHighlight(new THREE.MeshStandardMaterial(), 0.016)).toBe(false)
    expect(advanceHighlight(undefined, 0.016)).toBe(false)
  })
})
