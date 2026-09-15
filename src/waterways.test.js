import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  WATERWAY_WIDTH,
  expandWaterwayLines,
  lineSegmentsToRibbon,
} from './waterways'
import { WATER_LAYER } from './waterMaps'

describe('lineSegmentsToRibbon', () => {
  it('turns each segment into a ground-plane quad', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 5, 10, 0, 5], 3),
    )

    const ribbon = lineSegmentsToRibbon(geometry, { width: 4, lift: 0.1 })
    const position = ribbon.getAttribute('position')
    const index = ribbon.getIndex()

    expect(position.count).toBe(4)
    expect(index.count).toBe(6)
    // Width is across Y for an X-going segment in the Z-up export.
    expect(position.getY(0) - position.getY(1)).toBeCloseTo(4)
    expect(position.getZ(0)).toBeCloseTo(5.1)
  })
})

describe('expandWaterwayLines', () => {
  it('replaces waterway strokes with a wet ribbon mesh', () => {
    const group = new THREE.Group()
    const line = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute([0, 0, 2, 8, 0, 2, 8, 0, 2, 16, 4, 2], 3),
      ),
      new THREE.LineBasicMaterial(),
    )
    line.name = WATER_LAYER
    group.add(line)

    expandWaterwayLines(group, {
      width: WATERWAY_WIDTH,
      makeWaterMaterial: (side) =>
        new THREE.MeshPhysicalMaterial({ color: '#1f6f8f', side }),
    })

    expect(group.children).toHaveLength(1)
    const [mesh] = group.children
    expect(mesh.isMesh).toBe(true)
    expect(mesh.name).toBe(WATER_LAYER)
    expect(mesh.material.isMeshPhysicalMaterial).toBe(true)
    expect(mesh.geometry.getAttribute('position').count).toBe(8)
  })

  it('leaves non-water lines alone', () => {
    const group = new THREE.Group()
    const line = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3),
      ),
      new THREE.LineBasicMaterial(),
    )
    line.name = 'TPX_Contours'
    group.add(line)

    expandWaterwayLines(group)
    expect(group.children[0]).toBe(line)
  })
})
