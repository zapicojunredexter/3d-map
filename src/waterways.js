import * as THREE from 'three'
import { createWaterMaterial, WATER_LAYER } from './waterMaps'

// TopoExport draws waterways as polylines (and a tiny mesh patch). The minimap
// strokes those same lines thick; in 3D a one-pixel line is invisible against
// the ground, so the strips are expanded into flat ribbons.

export const WATERWAY_WIDTH = 6
// Sit a touch above the terrain so the ribbon wins the depth test.
export const WATERWAY_LIFT = 0.04

// LineSegments store discrete pairs. Each pair becomes a quad in the export's
// XY ground plane (Z-up), wide enough to read as a creek from street level.
export function lineSegmentsToRibbon(
  geometry,
  { width = WATERWAY_WIDTH, lift = WATERWAY_LIFT } = {},
) {
  const position = geometry.getAttribute('position')
  if (!position || position.count < 2) {
    return new THREE.BufferGeometry()
  }

  const half = width / 2
  const segmentCount = Math.floor(position.count / 2)
  const positions = new Float32Array(segmentCount * 4 * 3)
  const normals = new Float32Array(segmentCount * 4 * 3)
  const uvs = new Float32Array(segmentCount * 4 * 2)
  const indices = new Uint32Array(segmentCount * 6)

  let p = 0
  let n = 0
  let u = 0
  let t = 0

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const i = segment * 2
    const ax = position.getX(i)
    const ay = position.getY(i)
    const az = position.getZ(i) + lift
    const bx = position.getX(i + 1)
    const by = position.getY(i + 1)
    const bz = position.getZ(i + 1) + lift

    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    const px = (-dy / len) * half
    const py = (dx / len) * half

    const base = segment * 4
    const write = (x, y, z, uu, vv) => {
      positions[p] = x
      positions[p + 1] = y
      positions[p + 2] = z
      p += 3
      normals[n] = 0
      normals[n + 1] = 0
      normals[n + 2] = 1
      n += 3
      uvs[u] = uu
      uvs[u + 1] = vv
      u += 2
    }

    write(ax + px, ay + py, az, 0, 0)
    write(ax - px, ay - py, az, 1, 0)
    write(bx - px, by - py, bz, 1, 1)
    write(bx + px, by + py, bz, 0, 1)

    indices[t] = base
    indices[t + 1] = base + 1
    indices[t + 2] = base + 2
    indices[t + 3] = base
    indices[t + 4] = base + 2
    indices[t + 5] = base + 3
    t += 6
  }

  const ribbon = new THREE.BufferGeometry()
  ribbon.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  ribbon.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  ribbon.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  ribbon.setAttribute('uv2', ribbon.getAttribute('uv'))
  ribbon.setIndex(new THREE.BufferAttribute(indices, 1))
  ribbon.computeBoundingBox()
  ribbon.computeBoundingSphere()
  return ribbon
}

export function expandWaterwayLines(
  group,
  {
    width = WATERWAY_WIDTH,
    lift = WATERWAY_LIFT,
    makeWaterMaterial = createWaterMaterial,
  } = {},
) {
  const lines = group.children.filter(
    (child) => child.name === WATER_LAYER && child.isLineSegments,
  )

  for (const line of lines) {
    const geometry = lineSegmentsToRibbon(line.geometry, { width, lift })
    if (!geometry.getAttribute('position')?.count) {
      geometry.dispose()
      continue
    }

    const mesh = new THREE.Mesh(
      geometry,
      makeWaterMaterial(THREE.DoubleSide),
    )
    mesh.name = WATER_LAYER
    mesh.receiveShadow = true
    mesh.castShadow = false
    mesh.renderOrder = 1
    // Depth bias against the coplanar ground the export put the stroke on.
    mesh.material.polygonOffset = true
    mesh.material.polygonOffsetFactor = -1
    mesh.material.polygonOffsetUnits = -1

    group.add(mesh)
    group.remove(line)
    line.geometry?.dispose()
    line.material?.dispose?.()
  }

  return group
}
