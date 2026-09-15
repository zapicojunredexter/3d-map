import { describe, expect, it } from 'vitest'
import { headingFromForward, minimapScale, worldToPlan } from './minimapMath'

describe('worldToPlan', () => {
  it('undoes the GLB placement so DXF XY matches the 3D world', () => {
    const placement = { position: { x: -492, y: 0, z: 454 } }

    expect(worldToPlan(10, -20, placement)).toEqual({
      x: 502,
      y: 474,
    })
  })
})

describe('headingFromForward', () => {
  it('is zero when looking north along -Z', () => {
    expect(headingFromForward(0, -1)).toBeCloseTo(0)
  })

  it('turns positive when looking east along +X', () => {
    expect(headingFromForward(1, 0)).toBeCloseTo(Math.PI / 2)
  })
})

describe('minimapScale', () => {
  it('fits the full range across the disk', () => {
    expect(minimapScale(100, 200)).toBe(1)
    expect(minimapScale(95, 176)).toBeCloseTo(0.926)
  })
})
