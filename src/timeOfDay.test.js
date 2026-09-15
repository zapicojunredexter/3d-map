import { describe, expect, it } from 'vitest'
import {
  atmosphereAt,
  currentDecimalHour,
  formatHour,
  normalizeHour,
} from './timeOfDay'

describe('time helpers', () => {
  it('reads local hours and minutes from a date', () => {
    const date = new Date(2026, 8, 15, 17, 33)
    expect(currentDecimalHour(date)).toBeCloseTo(17.55)
  })

  it('normalizes hours into one day', () => {
    expect(normalizeHour(25)).toBe(1)
    expect(normalizeHour(-1)).toBe(23)
  })

  it('formats time at minute precision', () => {
    expect(formatHour(5.5)).toBe('05:30')
    expect(formatHour(17.55)).toBe('17:33')
    expect(formatHour(24)).toBe('00:00')
  })
})

describe('atmosphereAt', () => {
  it('makes midday brighter than midnight', () => {
    const midnight = atmosphereAt(0)
    const midday = atmosphereAt(12)

    expect(midday.name).toBe('Midday')
    expect(midnight.name).toBe('Night')
    expect(midday.sunIntensity).toBeGreaterThan(midnight.sunIntensity)
    expect(midday.exposure).toBeGreaterThan(midnight.exposure)
    expect(midday.stars).toBe(0)
    expect(midnight.stars).toBeGreaterThan(0.5)
  })

  it('places the daytime sun above the horizon', () => {
    expect(atmosphereAt(6).sunPosition[1]).toBe(12)
    expect(atmosphereAt(12).sunPosition[1]).toBeCloseTo(300)
    expect(atmosphereAt(18).sunPosition[1]).toBeCloseTo(12)
  })

  it('interpolates instead of jumping between moods', () => {
    const before = atmosphereAt(11.99)
    const after = atmosphereAt(12.01)

    expect(Math.abs(before.exposure - after.exposure)).toBeLessThan(0.01)
    expect(Math.abs(before.sunIntensity - after.sunIntensity)).toBeLessThan(0.01)
  })

  it('wraps smoothly at midnight', () => {
    const before = atmosphereAt(23.99)
    const after = atmosphereAt(0.01)

    expect(Math.abs(before.exposure - after.exposure)).toBeLessThan(0.01)
    expect(Math.abs(before.stars - after.stars)).toBeLessThan(0.01)
  })
})
