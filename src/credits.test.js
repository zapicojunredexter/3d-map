import { describe, expect, it } from 'vitest'
import {
  CREDIT_SECTIONS,
  creditEntryCount,
  formatCreditLine,
  formatSketchfabCredit,
} from './credits'

describe('credits', () => {
  it('lists every section with titled entries', () => {
    expect(CREDIT_SECTIONS.length).toBeGreaterThan(2)
    expect(creditEntryCount()).toBeGreaterThan(30)
    for (const section of CREDIT_SECTIONS) {
      expect(section.title).toBeTruthy()
      expect(section.entries.length).toBeGreaterThan(0)
      for (const entry of section.entries) {
        expect(entry.title).toBeTruthy()
        expect(formatCreditLine(entry)).toContain(entry.title)
      }
    }
  })

  it('formats Sketchfab models like the download Copy credits text', () => {
    const house = CREDIT_SECTIONS.flatMap((section) => section.entries).find(
      (entry) => entry.title === 'House-ver2-small',
    )
    expect(formatSketchfabCredit(house)).toBe(
      '"House-ver2-small" (https://sketchfab.com/3d-models/house-ver2-small-55f61b0d95834f5eaa8cb4065710ff73) by Pixel is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).',
    )
  })

  it('gives CC-BY Sketchfab models a source and license link', () => {
    const models = CREDIT_SECTIONS.flatMap((section) => section.entries).filter(
      (entry) => entry.via === 'Sketchfab',
    )
    expect(models.length).toBeGreaterThan(20)
    for (const entry of models) {
      expect(entry.source).toMatch(/^https:\/\/sketchfab\.com\//)
      expect(entry.license?.url).toMatch(/^https?:\/\/creativecommons\.org\//)
      expect(entry.author).toBeTruthy()
      expect(formatSketchfabCredit(entry)).toMatch(
        /^".+" \(https:\/\/sketchfab\.com\/.+\) by .+ is licensed under .+ \(https?:\/\/creativecommons\.org\/.+\)\.$/,
      )
    }
  })

  it('flags non-commercial assets', () => {
    const nc = CREDIT_SECTIONS.flatMap((section) => section.entries).filter(
      (entry) => entry.license?.id === 'CC-BY-NC-4.0',
    )
    expect(nc.map((entry) => entry.title)).toEqual(
      expect.arrayContaining([
        'Birch Tree - Low Poly',
        'Medieval House 2x3',
      ]),
    )
  })
})
