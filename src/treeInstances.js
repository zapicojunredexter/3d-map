import * as THREE from 'three'
import { createRandom } from './surfaces'

// TopoExport models every tree as a trunk cylinder and a crown blob wrapped in
// one container node. The containers carry the survey's planting positions and
// heights, so they can drive instances of a real tree model and then be left
// out of the render entirely.
export const TREE_CONTAINER = /^TPX_Trees_tree(_\d+)+$/

// One InstancedMesh covering the whole city can never be frustum culled, so the
// trees are grouped into square cells instead. Smaller cells cull more and cost
// more draw calls; this is about a dozen visible cells at street level.
export const TREE_CELL_SIZE = 150

// The replacement crown is as wide as it is tall, where the blobs it stands in
// for are noticeably narrower. Left alone, crowns swallow the pavements, so
// they get pulled in to sit between the two.
export const CANOPY_SQUEEZE = 0.85

const UP = new THREE.Vector3(0, 1, 0)

// The tree model's own space, mapped to world space by the same transform the
// city group uses.
export function placementMatrix({ position, rotation }) {
  return new THREE.Matrix4()
    .makeTranslation(position.x, position.y, position.z)
    .multiply(
      new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)),
    )
}

// Bounding boxes rather than node origins: the containers sit a metre above the
// trunk base, and a box survives the Z-up correction without any axis juggling.
export function treePlacements(scene, placement) {
  scene.updateMatrixWorld(true)
  const toWorld = placementMatrix(placement)
  const box = new THREE.Box3()
  const placements = []

  scene.traverse((object) => {
    if (!TREE_CONTAINER.test(object.name ?? '')) return
    box.setFromObject(object)
    if (box.isEmpty()) return

    box.applyMatrix4(toWorld)
    const height = box.max.y - box.min.y
    if (height <= 0) return

    placements.push({
      x: (box.min.x + box.max.x) / 2,
      y: box.min.y,
      z: (box.min.z + box.max.z) / 2,
      height,
      radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2,
    })
  })

  return placements
}

// The source tree is off-centre, dips below its own origin and stands 33 units
// tall. Rebasing it to one unit tall on y=0 lets an instance matrix carry
// nothing but position, yaw and the height it has to match.
export function normalizeTreeModel(scene) {
  scene.updateMatrixWorld(true)
  const bounds = new THREE.Box3()
  const parts = []

  scene.traverse((object) => {
    if (!object.isMesh || !object.geometry) return
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld)
    geometry.computeBoundingBox()
    bounds.union(geometry.boundingBox)
    parts.push({ name: object.name, geometry, material: object.material })
  })

  if (parts.length === 0) throw new Error('Tree model has no meshes')

  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const rebase = new THREE.Matrix4()
    .makeScale(1 / size.y, 1 / size.y, 1 / size.y)
    .multiply(
      new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z),
    )

  for (const part of parts) {
    part.geometry.applyMatrix4(rebase)
    part.geometry.computeBoundingBox()
    part.geometry.computeBoundingSphere()
  }

  return { parts, spread: Math.max(size.x, size.z) / size.y }
}

export function chunkPlacements(placements, cellSize = TREE_CELL_SIZE) {
  const cells = new Map()

  for (const placement of placements) {
    const key = `${Math.floor(placement.x / cellSize)},${Math.floor(placement.z / cellSize)}`
    let cell = cells.get(key)
    if (!cell) {
      cell = []
      cells.set(key, cell)
    }
    cell.push(placement)
  }

  return [...cells.values()]
}

export const TREE_SEED = 20260915

// Identical copies of one tree read as wallpaper, so each instance gets its own
// yaw and a little width jitter. Seeded, so the city looks the same every load.
// The generator is shared across cells, or every cell would repeat the same
// handful of variations.
export function instanceMatrices(placements, random = createRandom(TREE_SEED)) {
  return placements.map((placement) => {
    const width = placement.height * CANOPY_SQUEEZE * (0.92 + random() * 0.16)
    return new THREE.Matrix4().compose(
      new THREE.Vector3(placement.x, placement.y, placement.z),
      new THREE.Quaternion().setFromAxisAngle(UP, random() * Math.PI * 2),
      new THREE.Vector3(width, placement.height, width),
    )
  })
}

// Leaf atlases are cut-outs, and blending thousands of instanced cards has no
// correct draw order anyway, so the alpha is tested rather than blended. That
// also restores depth writes, which the shadow pass needs.
export function treeMaterial(source) {
  const material = source.clone()
  material.envMapIntensity = 0.65

  if (material.transparent) {
    material.transparent = false
    material.alphaTest = 0.5
    material.depthWrite = true
  }

  return material
}

export function buildTrees({ parts }, placements, cellSize = TREE_CELL_SIZE) {
  const group = new THREE.Group()
  group.name = 'TPX_Trees'
  const materials = parts.map((part) => treeMaterial(part.material))
  const random = createRandom(TREE_SEED)

  for (const cell of chunkPlacements(placements, cellSize)) {
    const matrices = instanceMatrices(cell, random)

    parts.forEach((part, index) => {
      const mesh = new THREE.InstancedMesh(
        part.geometry,
        materials[index],
        cell.length,
      )
      matrices.forEach((matrix, slot) => mesh.setMatrixAt(slot, matrix))
      mesh.instanceMatrix.needsUpdate = true
      // Without this the cell keeps the single tree's bounds and is culled the
      // moment the origin leaves the screen.
      mesh.computeBoundingSphere()
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.name = part.name
      group.add(mesh)
    })
  }

  return group
}

// Spawning used to raycast upwards against the merged crowns to avoid starting
// inside a tree. The crowns are no longer in the scene, so the planting points
// answer the same question directly, and faster.
export function canopyTest(placements) {
  return (x, z) =>
    placements.some((placement) => {
      const dx = x - placement.x
      const dz = z - placement.z
      return dx * dx + dz * dz < placement.radius * placement.radius
    })
}
