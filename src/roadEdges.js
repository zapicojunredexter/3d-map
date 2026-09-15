import * as THREE from 'three'

// The survey puts pavement and dirt on almost the same plane, so the join
// reads as a flat wallpaper seam. A small lift plus a vertical curb along the
// road outline is enough to sell a real kerb without new art.

export const ROAD_LAYER = 'TPX_RoadsOutlines'
export const ROAD_LIFT = 0.07
export const CURB_HEIGHT = 0.11
export const CURB_COLOR = '#4a4742'

function edgeKey(a, b) {
  return a < b ? `${a},${b}` : `${b},${a}`
}

// Edges that belong to exactly one triangle are the outline of the pavement.
export function roadBoundaryEdges(geometry) {
  const index = geometry.index
  const position = geometry.getAttribute('position')
  if (!index || !position) return []

  const uses = new Map()
  const triCount = index.count / 3

  for (let tri = 0; tri < triCount; tri += 1) {
    const i0 = index.getX(tri * 3)
    const i1 = index.getX(tri * 3 + 1)
    const i2 = index.getX(tri * 3 + 2)
    for (const [a, b, c] of [
      [i0, i1, i2],
      [i1, i2, i0],
      [i2, i0, i1],
    ]) {
      const key = edgeKey(a, b)
      const entry = uses.get(key)
      if (entry) entry.count += 1
      else uses.set(key, { a, b, other: c, count: 1 })
    }
  }

  const edges = []
  for (const entry of uses.values()) {
    if (entry.count !== 1) continue
    edges.push(entry)
  }
  return edges
}

// The merged road is still Z-up (z = height). The curb is a vertical ribbon
// hanging off each outline edge, facing away from the pavement.
export function buildCurbGeometry(geometry, { height = CURB_HEIGHT } = {}) {
  const position = geometry.getAttribute('position')
  const edges = roadBoundaryEdges(geometry)
  if (!edges.length || height <= 0) {
    return new THREE.BufferGeometry()
  }

  const positions = new Float32Array(edges.length * 6 * 3)
  const normals = new Float32Array(edges.length * 6 * 3)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const other = new THREE.Vector3()
  const along = new THREE.Vector3()
  const outward = new THREE.Vector3()
  const up = new THREE.Vector3(0, 0, 1)

  let cursor = 0
  const write = (point, normal) => {
    positions[cursor] = point.x
    positions[cursor + 1] = point.y
    positions[cursor + 2] = point.z
    normals[cursor] = normal.x
    normals[cursor + 1] = normal.y
    normals[cursor + 2] = normal.z
    cursor += 3
  }

  for (const edge of edges) {
    a.fromBufferAttribute(position, edge.a)
    b.fromBufferAttribute(position, edge.b)
    other.fromBufferAttribute(position, edge.other)

    along.subVectors(b, a)
    // Cross of up × along points left of the directed edge. Flip it so the
    // normal points away from the third vertex (the road interior).
    outward.crossVectors(up, along).normalize()
    const toInteriorX = other.x - a.x
    const toInteriorY = other.y - a.y
    if (outward.x * toInteriorX + outward.y * toInteriorY > 0) {
      outward.negate()
    }

    const aTop = a
    const bTop = b
    const aBot = a.clone()
    const bBot = b.clone()
    aBot.z -= height
    bBot.z -= height

    // Two triangles, both facing outward.
    write(aBot, outward)
    write(bBot, outward)
    write(bTop, outward)
    write(aBot, outward)
    write(bTop, outward)
    write(aTop, outward)
  }

  const curb = new THREE.BufferGeometry()
  curb.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  curb.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  curb.computeBoundingSphere()
  return curb
}

export function createCurbMaterial() {
  return new THREE.MeshStandardMaterial({
    color: CURB_COLOR,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.25,
  })
}

// Lift the pavement and hang a curb under its outline. Safe to call more than
// once: a previous curb is replaced rather than stacked.
export function applyRoadEdge(mesh, {
  lift = ROAD_LIFT,
  height = CURB_HEIGHT,
} = {}) {
  if (!mesh?.isMesh || mesh.name !== ROAD_LAYER) return mesh

  const existing = mesh.children.find((child) => child.name === 'TPX_RoadCurb')
  if (existing) {
    mesh.remove(existing)
    existing.geometry.dispose()
    existing.material.dispose()
  }

  if (!mesh.userData.roadLifted) {
    mesh.geometry.translate(0, 0, lift)
    mesh.userData.roadLifted = true
  }

  const curb = new THREE.Mesh(buildCurbGeometry(mesh.geometry, { height }), createCurbMaterial())
  curb.name = 'TPX_RoadCurb'
  curb.castShadow = true
  curb.receiveShadow = true
  mesh.add(curb)
  return mesh
}

export function applyRoadEdges(group, options = {}) {
  for (const child of group?.children ?? []) {
    if (child.isMesh && child.name === ROAD_LAYER) applyRoadEdge(child, options)
  }
  return group
}
