import * as THREE from 'three'
import { createRandom } from './surfaces'
import {
  GROUND_LAYER,
  GREEN_LAYER,
  ROAD_LAYER,
  buildRoadMask,
} from './grassInstances'
import { placementMatrix, chunkPlacements } from './treeInstances'
import {
  ANIMAL_CATALOG,
  ANIMAL_COUNTS,
  animalIdsForKind,
  expandAnimalKinds,
} from './animalCatalog'

export const ANIMAL_SEED = 20260916
export const ANIMAL_CELL_SIZE = 120
export const ANIMAL_LAYERS = [GREEN_LAYER, GROUND_LAYER]

// Soft scale jitter so a herd of the same variant still varies a little.
export const ANIMAL_SCALE = { min: 0.92, max: 1.12 }

const UP = new THREE.Vector3(0, 1, 0)

function triangleAreaXZ(a, b, c) {
  return Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2
}

function shuffleInPlace(list, random) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const tmp = list[i]
    list[i] = list[j]
    list[j] = tmp
  }
  return list
}

// Area-weighted triangles from parks + open ground, already in world space.
function collectSurfaceTriangles(group, placement) {
  const toWorld = placementMatrix(placement)
  const triangles = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()

  for (const layer of ANIMAL_LAYERS) {
    const mesh = group?.children?.find(
      (child) => child.isMesh && child.name === layer,
    )
    const geometry = mesh?.geometry
    const position = geometry?.getAttribute?.('position')
    if (!position) continue

    const index = geometry.index
    const triCount = index ? index.count / 3 : position.count / 3
    const at = (slot) => (index ? index.getX(slot) : slot)

    for (let tri = 0; tri < triCount; tri += 1) {
      const base = tri * 3
      a.fromBufferAttribute(position, at(base)).applyMatrix4(toWorld)
      b.fromBufferAttribute(position, at(base + 1)).applyMatrix4(toWorld)
      c.fromBufferAttribute(position, at(base + 2)).applyMatrix4(toWorld)
      const area = triangleAreaXZ(a, b, c)
      if (area <= 0) continue
      triangles.push({
        ax: a.x,
        ay: a.y,
        az: a.z,
        bx: b.x,
        by: b.y,
        bz: b.z,
        cx: c.x,
        cy: c.y,
        cz: c.z,
        area,
      })
    }
  }

  return triangles
}

function pickWeightedTriangle(triangles, totalArea, random) {
  let ticket = random() * totalArea
  for (const tri of triangles) {
    ticket -= tri.area
    if (ticket <= 0) return tri
  }
  return triangles[triangles.length - 1]
}

function sampleStoredTriangle(tri, random, target) {
  let u = random()
  let v = random()
  if (u + v > 1) {
    u = 1 - u
    v = 1 - v
  }
  const w = 1 - u - v
  return target.set(
    tri.ax * w + tri.bx * u + tri.cx * v,
    tri.ay * w + tri.by * u + tri.cy * v,
    tri.az * w + tri.bz * u + tri.cz * v,
  )
}

// Scatter exact herd sizes onto soft ground, never on roads. Deterministic.
export function animalPlacements(
  group,
  placement,
  {
    counts = ANIMAL_COUNTS,
    catalog = ANIMAL_CATALOG,
    seed = ANIMAL_SEED,
    random = createRandom(seed),
    maxAttemptsPerAnimal = 40,
  } = {},
) {
  const kinds = expandAnimalKinds(counts)
  if (!kinds.length) return []

  shuffleInPlace(kinds, random)

  const triangles = collectSurfaceTriangles(group, placement)
  if (!triangles.length) return []

  const totalArea = triangles.reduce((sum, tri) => sum + tri.area, 0)
  if (totalArea <= 0) return []

  const roads = group?.children?.find(
    (child) => child.isMesh && child.name === ROAD_LAYER,
  )
  const blocked = roads ? buildRoadMask(roads, placement) : null
  const point = new THREE.Vector3()
  const byKind = new Map()
  for (const entry of catalog) {
    let list = byKind.get(entry.kind)
    if (!list) {
      list = []
      byKind.set(entry.kind, list)
    }
    list.push(entry.id)
  }

  const placements = []
  for (const kind of kinds) {
    const variants = byKind.get(kind) ?? animalIdsForKind(kind, catalog)
    if (!variants.length) continue

    let chosen = null
    for (let attempt = 0; attempt < maxAttemptsPerAnimal; attempt += 1) {
      const tri = pickWeightedTriangle(triangles, totalArea, random)
      sampleStoredTriangle(tri, random, point)
      if (blocked?.(point.x, point.z)) continue
      chosen = { x: point.x, y: point.y, z: point.z }
      break
    }
    if (!chosen) continue

    placements.push({
      ...chosen,
      kind,
      modelId: variants[Math.floor(random() * variants.length)],
      yaw: random() * Math.PI * 2,
      scale:
        ANIMAL_SCALE.min + random() * (ANIMAL_SCALE.max - ANIMAL_SCALE.min),
    })
  }

  return placements
}

// Feet on y=0, centred on XZ, natural metre size kept (instances only yaw/scale).
export function normalizeAnimalModel(scene, catalogEntry = null) {
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

  if (parts.length === 0) throw new Error('Animal model has no meshes')

  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  if (size.y <= 0) throw new Error('Animal model has no height')

  const rebase = new THREE.Matrix4().makeTranslation(
    -center.x,
    -bounds.min.y,
    -center.z,
  )

  for (const part of parts) {
    part.geometry.applyMatrix4(rebase)
    part.geometry.computeBoundingBox()
    part.geometry.computeBoundingSphere()
  }

  return {
    id: catalogEntry?.id ?? parts[0]?.name ?? 'animal',
    kind: catalogEntry?.kind ?? 'animal',
    parts,
    height: size.y,
    width: size.x,
    depth: size.z,
  }
}

export function animalMaterial(source) {
  const material = source.clone()
  material.envMapIntensity = 0.65
  return material
}

export function instanceMatrices(placements) {
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()

  return placements.map((placement) => {
    position.set(placement.x, placement.y, placement.z)
    quaternion.setFromAxisAngle(UP, placement.yaw ?? 0)
    const s = placement.scale ?? 1
    scale.set(s, s, s)
    return new THREE.Matrix4().compose(position, quaternion, scale)
  })
}

export function buildAnimals(
  models,
  placements,
  { cellSize = ANIMAL_CELL_SIZE } = {},
) {
  const group = new THREE.Group()
  group.name = 'TPX_Animals'
  if (!models?.length || !placements?.length) return group

  const byId = new Map(models.map((model) => [model.id, model]))
  const assigned = new Map()

  for (const placement of placements) {
    const model = byId.get(placement.modelId)
    if (!model) continue
    let list = assigned.get(model.id)
    if (!list) {
      list = []
      assigned.set(model.id, list)
    }
    list.push(placement)
  }

  for (const model of models) {
    const plots = assigned.get(model.id)
    if (!plots?.length) continue

    const materials = model.parts.map((part) => animalMaterial(part.material))

    for (const cell of chunkPlacements(plots, cellSize)) {
      const matrices = instanceMatrices(cell)
      model.parts.forEach((part, partIndex) => {
        const mesh = new THREE.InstancedMesh(
          part.geometry,
          materials[partIndex],
          matrices.length,
        )
        mesh.name = `TPX_Animals_${model.id}_${part.name || partIndex}`
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.frustumCulled = true
        matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
        mesh.instanceMatrix.needsUpdate = true
        group.add(mesh)
      })
    }
  }

  return group
}
