import { describe, expect, it } from 'vitest'
import {
  MOBILE_PITCH_MAX,
  MOBILE_PITCH_MIN,
  applyMobileLook,
  clampStick,
  consumeMobileLook,
  createMobileInput,
  pressVirtualKey,
} from './mobileInput'

describe('mobileInput', () => {
  it('clamps stick vectors to the unit circle', () => {
    expect(clampStick(0.5, 0)).toEqual({ x: 0.5, y: 0 })
    const corner = clampStick(1, 1)
    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(1)
  })

  it('consumes look deltas once per frame', () => {
    const input = createMobileInput()
    input.lookDx = 12
    input.lookDy = -4
    expect(consumeMobileLook(input)).toEqual({ dx: 12, dy: -4 })
    expect(consumeMobileLook(input)).toEqual({ dx: 0, dy: 0 })
  })

  it('yaws and clamps pitch for touch look', () => {
    const euler = { x: 0, y: 0 }
    applyMobileLook(euler, 10, 0, 0.01)
    expect(euler.y).toBeCloseTo(-0.1)
    applyMobileLook(euler, 0, 1000, 0.01)
    expect(euler.x).toBe(MOBILE_PITCH_MIN)
    euler.x = 0
    applyMobileLook(euler, 0, -1000, 0.01)
    expect(euler.x).toBe(MOBILE_PITCH_MAX)
  })

  it('emits virtual key presses for torch / reset', () => {
    const seen = []
    const onKey = (event) => seen.push(event.type, event.code)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    pressVirtualKey('KeyF')
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('keyup', onKey)
    expect(seen).toEqual(['keydown', 'KeyF', 'keyup', 'KeyF'])
  })
})
