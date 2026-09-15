import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  CURB_HEIGHT,
  ROAD_LAYER,
  ROAD_LIFT,
  applyRoadEdge,
  buildCurbGeometry,
  roadBoundaryEdges,
} from './roadEdges'

function roadStrip() {
  // Two quads side by side in Z-up space: a short pavement with a clear outline.
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array([
    0, 0, 0, 4, 0, 0, 4, 2, 0, 0, 2, 0, 8, 0, 0, 8, 2, 0,
  ])
  // tris: 0-1-2, 0-2-3, 1-4-5, 1-5-2
  const index = new Uint16Array([0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2])
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
  mesh.name = ROAD_LAYER
  return mesh
}

describe('roadBoundaryEdges', () => {
  it('keeps only the outline, not the shared interior edge', () => {
    const edges = roadBoundaryEdges(roadStrip().geometry)
    // Two quads share one interior edge; that one must not become a curb.
    expect(edges.length).toBeGreaterThan(4)
    expect(edges.every((edge) => edge.count === 1)).toBe(true)
  })
})

describe('buildCurbGeometry', () => {
  it('hangs a vertical ribbon under every outline edge', () => {
    const road = roadStrip().geometry
    const curb = buildCurbGeometry(road, { height: 0.1 })
    const box = new THREE.Box3().setFromBufferAttribute(
      curb.getAttribute('position'),
    )

    // Tops sit on the road (z=0), bottoms drop by the curb height.
    expect(box.max.z).toBeCloseTo(0)
    expect(box.min.z).toBeCloseTo(-0.1)
    // Two triangles per outline edge.
    expect(curb.getAttribute('position').count % 6).toBe(0)
  })

  it('faces away from the pavement, not into it', () => {
    const curb = buildCurbGeometry(roadStrip().geometry, { height: 0.1 })
    const normals = curb.getAttribute('normal')
    const positions = curb.getAttribute('position')

    // Sample the first curb face centre and step along its normal: that step
    // must leave the road's bounding box, not walk into the asphalt.
    const roadBox = new THREE.Box3(
      new THREE.Vector3(0, 0, -0.01),
      new THREE.Vector3(8, 2, 0.01),
    )
    const mid = new THREE.Vector3(
      (positions.getX(0) + positions.getX(1) + positions.getX(2)) / 3,
      (positions.getY(0) + positions.getY(1) + positions.getY(2)) / 3,
      0,
    )
    const normal = new THREE.Vector3(
      normals.getX(0),
      normals.getY(0),
      normals.getZ(0),
    )
    mid.addScaledVector(normal, 0.2)
    expect(roadBox.containsPoint(mid)).toBe(false)
  })
})

describe('applyRoadEdge', () => {
  it('lifts the pavement and adds one curb child', () => {
    const mesh = roadStrip()
    const before = mesh.geometry.getAttribute('position').getZ(0)

    applyRoadEdge(mesh)

    expect(mesh.geometry.getAttribute('position').getZ(0)).toBeCloseTo(
      before + ROAD_LIFT,
    )
    expect(mesh.children).toHaveLength(1)
    expect(mesh.children[0].name).toBe('TPX_RoadCurb')
    expect(mesh.children[0].geometry.getAttribute('position').count).toBeGreaterThan(
      0,
    )
  })

  it('does not stack lifts or curbs when applied twice', () => {
    const mesh = roadStrip()
    applyRoadEdge(mesh)
    const lifted = mesh.geometry.getAttribute('position').getZ(0)
    applyRoadEdge(mesh)

    expect(mesh.geometry.getAttribute('position').getZ(0)).toBeCloseTo(lifted)
    expect(mesh.children).toHaveLength(1)
  })

  it('ignores meshes that are not the road surface', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    mesh.name = 'TPX_Ground'
    applyRoadEdge(mesh)
    expect(mesh.children).toHaveLength(0)
  })

  it('uses the shared curb height', () => {
    expect(CURB_HEIGHT).toBeGreaterThan(ROAD_LIFT)
  })
})
