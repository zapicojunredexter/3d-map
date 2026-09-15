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

// Merging a layer throws away the per-feature node names, which is exactly what
// picking needs. Tagging every vertex with its feature's slot carries that
// identity inside the merged geometry, so a raycast can name what it hit
// without giving up the single draw call.
export const FEATURE_ID = 'featureId'

function tagFeature(geometry, slot) {
  const { count } = geometry.getAttribute('position')
  const slots = new Float32Array(count).fill(slot)
  geometry.setAttribute(FEATURE_ID, new THREE.BufferAttribute(slots, 1))
  return geometry
}

// The name of the feature a raycast hit, or null when that surface carries no
// identity. The tag is per-vertex, so the hit triangle answers for it.
export function featureAt(intersection) {
  const names = intersection?.object?.userData?.featureNames
  const slots = intersection?.object?.geometry?.getAttribute?.(FEATURE_ID)
  const vertex = intersection?.face?.a
  if (!names || !slots || vertex == null) return null
  return names[slots.getX(vertex)] ?? null
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
  if (group.names) object.userData.featureNames = group.names
  return object
}

// Pass skip for layers something else draws, so their geometry is not merged
// into the city only to be hidden again, and identify for layers whose
// individual features have to stay nameable after the merge.
export function mergeWorldByLayer(root, { skip = [], identify = [] } = {}) {
  root.updateMatrixWorld(true)
  const rootInverse = root.matrixWorld.clone().invert()
  const toRoot = new THREE.Matrix4()
  const groups = new Map()

  root.traverse((object) => {
    const isLine = Boolean(object.isLine)
    if ((!object.isMesh && !isLine) || !object.geometry) return

    const layer = layerOf(object)
    if (skip.includes(layer)) return

    const material = Array.isArray(object.material)
      ? object.material[0]
      : object.material
    const key = `${layer}|${isLine ? 'line' : 'mesh'}|${material?.uuid ?? 'none'}`

    let group = groups.get(key)
    if (!group) {
      group = {
        layer,
        material,
        isLine,
        geometries: [],
        sources: [],
        names: identify.includes(layer) ? [] : null,
      }
      groups.set(key, group)
    }

    toRoot.multiplyMatrices(rootInverse, object.matrixWorld)
    const geometry = bakedGeometry(object, toRoot)
    if (group.names) {
      tagFeature(geometry, group.names.length)
      group.names.push(object.name)
    }
    group.geometries.push(geometry)
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
