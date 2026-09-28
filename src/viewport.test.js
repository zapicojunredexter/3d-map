import { describe, expect, it } from 'vitest'
import { MOBILE_VIEWPORT_QUERY, isMobileViewport } from './viewport'

describe('isMobileViewport', () => {
  it('uses the shared media query', () => {
    expect(MOBILE_VIEWPORT_QUERY).toContain('max-width')
    expect(MOBILE_VIEWPORT_QUERY).toContain('pointer: coarse')
  })

  it('follows matchMedia for the current viewpoint', () => {
    expect(isMobileViewport(() => ({ matches: true }))).toBe(true)
    expect(isMobileViewport(() => ({ matches: false }))).toBe(false)
    expect(isMobileViewport(null)).toBe(false)
  })
})
