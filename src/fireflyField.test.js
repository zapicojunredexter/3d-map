import { describe, expect, it } from 'vitest'
import {
  FIREFLY_COUNT,
  FIREFLY_LIGHT_BRIGHTNESS,
  FIREFLY_LIGHT_COUNT,
  FIREFLY_PULSE_MIN,
  applyFireflyPulseShader,
  createFireflyField,
  createFireflyGlowTexture,
  fireflyLightIndices,
  fireflyLightIntensity,
  fireflyPulse,
} from './fireflyField'

describe('createFireflyField', () => {
  it('seeds a stable cloud of local offsets', () => {
    const a = createFireflyField(100)
    const b = createFireflyField(100)
    expect(a.count).toBe(100)
    expect(a.positions).toHaveLength(300)
    expect(a.phases).toHaveLength(500)
    expect([...a.positions]).toEqual([...b.positions])
  })

  it('defaults to the configured firefly count', () => {
    expect(FIREFLY_COUNT).toBeGreaterThan(0)
    const field = createFireflyField()
    expect(field.count).toBe(FIREFLY_COUNT)
  })
})

describe('createFireflyGlowTexture', () => {
  it('builds a round sprite texture', () => {
    const texture = createFireflyGlowTexture(16)
    expect(texture).toBeTruthy()
    expect(texture.image?.width ?? texture.image).toBeTruthy()
  })
})

describe('fireflyPulse', () => {
  it('stays between the dim floor and full brightness', () => {
    for (let t = 0; t < 20; t += 0.37) {
      const value = fireflyPulse(t, 1.2, 1.7)
      expect(value).toBeGreaterThanOrEqual(FIREFLY_PULSE_MIN - 1e-6)
      expect(value).toBeLessThanOrEqual(1 + 1e-6)
    }
  })

  it('phases stagger so bugs are not locked in sync', () => {
    expect(fireflyPulse(0, 0, 1)).not.toBeCloseTo(
      fireflyPulse(0, Math.PI / 2, 1),
      3,
    )
  })
})

describe('applyFireflyPulseShader', () => {
  it('wires aPulse into size and opacity', () => {
    const material = {
      onBeforeCompile: null,
      needsUpdate: false,
    }
    applyFireflyPulseShader(material)
    const shader = {
      vertexShader: 'void main() {\ngl_PointSize = size;\n}',
      fragmentShader:
        'void main() {\nvec4 diffuseColor = vec4( diffuse, opacity );\n}',
    }
    material.onBeforeCompile(shader, null)
    expect(shader.vertexShader).toContain('attribute float aPulse')
    expect(shader.vertexShader).toContain('gl_PointSize = size * aPulse')
    expect(shader.fragmentShader).toContain('opacity * vPulse')
    expect(material.customProgramCacheKey()).toBe('fireflyPulse')
  })
})

describe('firefly lights', () => {
  it('spreads light hosts across the cloud', () => {
    const indices = fireflyLightIndices(100, FIREFLY_LIGHT_COUNT)
    expect(indices).toHaveLength(FIREFLY_LIGHT_COUNT)
    expect(new Set(indices).size).toBe(FIREFLY_LIGHT_COUNT)
    expect(Math.min(...indices)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...indices)).toBeLessThan(100)
  })

  it('scales intensity with strength and pulse', () => {
    expect(fireflyLightIntensity(0, 1)).toBe(0)
    expect(fireflyLightIntensity(1, 1)).toBe(FIREFLY_LIGHT_BRIGHTNESS)
    expect(fireflyLightIntensity(0.5, 0.5)).toBeCloseTo(
      FIREFLY_LIGHT_BRIGHTNESS * 0.25,
    )
  })
})
