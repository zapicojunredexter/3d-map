import { describe, expect, it } from 'vitest'
import {
  buildFeatureIndex,
  featureBounds,
  queryFeatureIndex,
} from './minimapIndex'

const square = (x, y) => ({
  id: `${x}:${y}`,
  points: [
    [x, y],
    [x + 4, y],
    [x + 4, y + 4],
    [x, y + 4],
  ],
})

describe('featureBounds', () => {
  it('wraps every point', () => {
    expect(featureBounds(square(10, 20).points)).toEqual({
      minX: 10,
      minY: 20,
      maxX: 14,
      maxY: 24,
    })
  })
})

describe('queryFeatureIndex', () => {
  it('returns only features near the player', () => {
    const near = square(100, 100)
    const far = square(600, 600)
    const index = buildFeatureIndex([near, far])

    const found = queryFeatureIndex(index, 102, 102, 40)

    expect(found).toEqual([near])
  })

  it('finds features that straddle a cell boundary', () => {
    const straddling = { id: 'long', points: [[60, 60], [200, 60]] }
    const index = buildFeatureIndex([straddling], 64)

    expect(queryFeatureIndex(index, 150, 60, 5)).toEqual([straddling])
  })

  it('never repeats a feature spanning several cells', () => {
    const wide = { id: 'wide', points: [[0, 0], [300, 300]] }
    const index = buildFeatureIndex([wide], 64)

    expect(queryFeatureIndex(index, 150, 150, 150)).toHaveLength(1)
  })

  it('skips empty features', () => {
    const index = buildFeatureIndex([{ id: 'empty', points: [] }])

    expect(queryFeatureIndex(index, 0, 0, 500)).toEqual([])
  })
})
