import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// TopoExport emits one object per map feature, which costs thousands of draw
// calls for only a few hundred thousand triangles. Merging per layer keeps the
// layer names the rest of the app relies on while drawing the city in a
// handful of calls.

// Layers the player stands on or bumps into. Roads and contours arrive as line
// strips, so the drivable surface is the RoadsOutlines triangles; trees and
// contour lines stay out of the raycast target.
export const COLLIDABLE_LAYERS = [
  'TPX_Ground',
  'TPX_RoadsOutlines',
  'TPX_Buildings',
  'TPX_GreenAreas',
  'TPX_Waterways',
]

export function layerFromName(name) {
  const base = String(name ?? '')
    // GLTFLoader appends this when one glTF mesh is reused by several nodes.
    .replace(/_instance_\d+$/, '')
    .replace(/(_\d+)+$/, '')
    .replace(/_[a-z][A-Za-z0-9]*$/, '')
  return base.startsWith('TPX_') ? base : ''
}

export function layerOf(object) {
  for (let node = object; node; node = node.parent) {
    const layer = layerFromName(node.name)
    if (layer) return layer
  }
  return 'TPX_Unnamed'
}

export function isCollidableLayer(name) {
  return COLLIDABLE_LAYERS.includes(layerFromName(name) || name)
}

// A LINE_STRIP cannot simply be concatenated with the next strip, or the two
// would be joined by a stray segment. Expanding to discrete pairs lets every
// line in a layer share one draw call.
export function stripToSegments(geometry) {
  const position = geometry.getAttribute('position')
  const index = geometry.index
  const count = index ? index.count : position.count
  const at = (slot) => (index ? index.getX(slot) : slot)
  const segments = new Float32Array(Math.max(0, count - 1) * 6)

  let cursor = 0
  for (let slot = 0; slot < count - 1; slot += 1) {
    for (const vertex of [at(slot), at(slot + 1)]) {
      segments[cursor] = position.getX(vertex)
      segments[cursor + 1] = position.getY(vertex)
      segments[cursor + 2] = position.getZ(vertex)
      cursor += 3
    }
  }

  const expanded = new THREE.BufferGeometry()
  expanded.setAttribute('position', new THREE.BufferAttribute(segments, 3))
  return expanded
}

function keepOnly(geometry, attributes) {
  for (const attribute of Object.keys(geometry.attributes)) {
    if (!attributes.includes(attribute)) geometry.deleteAttribute(attribute)
  }
  geometry.morphAttributes = {}
  return geometry
}

function bakedGeometry(object, toRootMatrix) {
  const isStrip = object.isLine && !object.isLineSegments
  const geometry = isStrip
    ? stripToSegments(object.geometry)
    : keepOnly(object.geometry.clone(), ['position', 'normal'])

  if (object.isLine) keepOnly(geometry, ['position'])
  geometry.applyMatrix4(toRootMatrix)
  return geometry
}

// mergeGeometries needs every input to agree on indexing.
function normalizeIndexing(geometries) {
  if (geometries.every((geometry) => geometry.index)) return geometries
  return geometries.map((geometry) =>
    geometry.index ? geometry.toNonIndexed() : geometry,
  )
}

function mergedObject(group) {
  const sources = normalizeIndexing(group.geometries)
  const geometry =
    sources.length === 1 ? sources[0] : mergeGeometries(sources, false)
  if (!geometry) return null

  if (sources.length > 1) {
    for (const source of sources) source.dispose()
  }
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const object = group.isLine
    ? new THREE.LineSegments(geometry, group.material)
    : new THREE.Mesh(geometry, group.material)
  object.name = group.layer
  object.castShadow = !group.isLine
  object.receiveShadow = !group.isLine
  return object
}

export function mergeWorldByLayer(root) {
  root.updateMatrixWorld(true)
  const rootInverse = root.matrixWorld.clone().invert()
  const toRoot = new THREE.Matrix4()
  const groups = new Map()

  root.traverse((object) => {
    const isLine = Boolean(object.isLine)
    if ((!object.isMesh && !isLine) || !object.geometry) return

    const layer = layerOf(object)
    const material = Array.isArray(object.material)
      ? object.material[0]
      : object.material
    const key = `${layer}|${isLine ? 'line' : 'mesh'}|${material?.uuid ?? 'none'}`

    let group = groups.get(key)
    if (!group) {
      group = { layer, material, isLine, geometries: [], sources: [] }
      groups.set(key, group)
    }

    toRoot.multiplyMatrices(rootInverse, object.matrixWorld)
    group.geometries.push(bakedGeometry(object, toRoot))
    group.sources.push(object)
  })

  const merged = new THREE.Group()
  merged.name = 'MergedWorld'

  for (const group of groups.values()) {
    const object = mergedObject(group)
    // Never silently drop a layer: fall back to the unmerged originals.
    if (object) merged.add(object)
    else for (const source of group.sources) merged.add(source.clone())
  }

  return merged
}

export function collidableMeshes(root) {
  const meshes = []
  root.traverse((object) => {
    if (object.isMesh && isCollidableLayer(object.name)) meshes.push(object)
  })
  return meshes
}

// Everything solid, including decoration, for checking what is overhead.
export function solidMeshes(root) {
  const meshes = []
  root.traverse((object) => {
    if (object.isMesh) meshes.push(object)
  })
  return meshes
}
