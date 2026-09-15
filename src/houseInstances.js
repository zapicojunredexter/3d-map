import * as THREE from 'three'
import {
  advanceHighlight,
  attachHighlight,
  setHighlight,
} from './featureHighlight'
import { FEATURE_ID } from './mergeWorld'
import { createRandom } from './surfaces'
import { chunkPlacements, placementMatrix } from './treeInstances'
import { HOUSE_CATALOG, WINDMILL_ID, pickHouseModel, windmillPlots } from './houseCatalog'

// The export's buildings are white extrusions, but they are correctly placed
// and sized, so they work as plots: house models are chosen per footprint and
// scaled to fill that plot (matching the invisible collider). The blocks stay
// in the scene as colliders, which keeps walls solid and keeps the crosshair
// able to name what it is pointing at.

export const HOUSE_CELL_SIZE = 120
export const HOUSE_SEED = 20260916

// Houses that exactly fill their plot meet their neighbours with no seam, and
// roofs interpenetrate along shared walls. A little inset keeps a gap so shared
// walls do not z-fight, while still matching the invisible collider closely.
export const FOOTPRINT_INSET = 0.98

export const HOUSE_HIGHLIGHT = { color: '#ffd08a', strength: 0.55 }

const UP = new THREE.Vector3(0, 1, 0)

// Reading the plots back out of the merged mesh rather than the source nodes is
// what guarantees a placement's slot is the same slot the picking and the glow
// use: both come from the one featureId attribute the merge wrote.
export function buildingPlacements(mesh, placement) {
  const geometry = mesh?.geometry
  const slots = geometry?.getAttribute?.(FEATURE_ID)
  const position = geometry?.getAttribute?.('position')
  const names = mesh?.userData?.featureNames
  if (!slots || !position || !names) return []

  const count = names.length
  const min = new Float64Array(count * 3).fill(Infinity)
  const max = new Float64Array(count * 3).fill(-Infinity)

  for (let vertex = 0; vertex < slots.count; vertex += 1) {
    const slot = slots.getX(vertex)
    if (slot < 0 || slot >= count) continue
    for (let axis = 0; axis < 3; axis += 1) {
      const value = position.getComponent(vertex, axis)
      const at = slot * 3 + axis
      if (value < min[at]) min[at] = value
      if (value > max[at]) max[at] = value
    }
  }

  const toWorld = placementMatrix(placement)
  const box = new THREE.Box3()
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  const placements = []

  for (let slot = 0; slot < count; slot += 1) {
    const at = slot * 3
    if (!Number.isFinite(min[at])) continue

    box.min.set(min[at], min[at + 1], min[at + 2])
    box.max.set(max[at], max[at + 1], max[at + 2])
    // The city group's z-up correction, so a placement is already world space.
    box.applyMatrix4(toWorld)
    box.getSize(size)
    box.getCenter(center)
    if (size.y <= 0) continue

    placements.push({
      slot,
      name: names[slot],
      x: center.x,
      y: box.min.y,
      z: center.z,
      width: size.x,
      depth: size.z,
      height: size.y,
    })
  }

  return placements
}

// Rebase to height=1 on y=0, keeping the asset's footprint ratios. Instance
// matrices then scale uniformly, so a cottage does not get stretched into a hall.
export function normalizeHouseModel(scene, catalogEntry = null) {
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

  if (parts.length === 0) throw new Error('House model has no meshes')

  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  if (size.y <= 0) throw new Error('House model has no height')

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

  return {
    id: catalogEntry?.id ?? parts[0]?.name ?? 'house',
    catalogEntry,
    parts,
    ridgeAlongX: size.x >= size.z,
    width: size.x / size.y,
    depth: size.z / size.y,
    height: 1,
    native: catalogEntry?.native ?? { x: size.x, y: size.y, z: size.z },
  }
}

export function instanceMatrices(
  placements,
  model,
  random = createRandom(HOUSE_SEED),
  inset = FOOTPRINT_INSET,
) {
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const modelAlong = model.ridgeAlongX ? model.width : model.depth
  const modelAcross = model.ridgeAlongX ? model.depth : model.width

  return placements.map((placement) => {
    // The model's ridge runs along its own x. Turning it on the deeper plots
    // means the roof follows the long side instead of stretching across it.
    const turned = placement.depth > placement.width
    // A half-turn keeps that alignment but points the front the other way, or
    // every house on a street would face identically.
    const yaw = (turned ? Math.PI / 2 : 0) + (random() < 0.5 ? Math.PI : 0)
    const along = turned ? placement.depth : placement.width
    const across = turned ? placement.width : placement.depth

    // Fill the plot (same volume the invisible block collides with). Model
    // picking keeps the stretch mild; leaving empty margin made "ghost walls".
    position.set(placement.x, placement.y, placement.z)
    quaternion.setFromAxisAngle(UP, yaw)
    scale.set(
      (along * inset) / modelAlong,
      placement.height / model.height,
      (across * inset) / modelAcross,
    )
    return new THREE.Matrix4().compose(position, quaternion, scale)
  })
}

export function houseMaterial(source) {
  const material = source.clone()
  material.envMapIntensity = 0.65
  // The blocks are hidden in this look, so the hover glow has to live here
  // instead. The same shader patch works because three binds a per-instance
  // featureId to the same attribute name.
  return attachHighlight(material, HOUSE_HIGHLIGHT)
}

// A new geometry sharing the source's attribute objects: the per-cell instance
// data has to hang off its own geometry, but the 800 triangles behind it should
// still be one buffer on the GPU.
function cellGeometry(source, featureIds) {
  const geometry = new THREE.BufferGeometry()
  for (const [name, attribute] of Object.entries(source.attributes)) {
    geometry.setAttribute(name, attribute)
  }
  if (source.index) geometry.setIndex(source.index)
  geometry.setAttribute(FEATURE_ID, featureIds)
  geometry.boundingBox = source.boundingBox
  geometry.boundingSphere = source.boundingSphere
  return geometry
}

function asModelList(modelOrModels) {
  return Array.isArray(modelOrModels) ? modelOrModels : [modelOrModels]
}

export function assignHouseModels(
  placements,
  models,
  catalog = HOUSE_CATALOG,
  random = createRandom(HOUSE_SEED),
) {
  const byId = new Map(models.map((model) => [model.id, model]))
  const grouped = new Map()
  const windmill = byId.get(WINDMILL_ID)
  const windmillSlots = new Set(
    windmill ? windmillPlots(placements).map((plot) => plot.slot) : [],
  )

  const push = (model, placement) => {
    let list = grouped.get(model.id)
    if (!list) {
      list = []
      grouped.set(model.id, list)
    }
    list.push(placement)
  }

  for (const placement of placements) {
    if (windmill && windmillSlots.has(placement.slot)) {
      push(windmill, placement)
      continue
    }

    const pick =
      models.length === 1
        ? models[0]
        : byId.get(pickHouseModel(placement, catalog, random).id) ?? models[0]
    // Never fall back onto the landmark windmill for ordinary plots.
    push(pick.id === WINDMILL_ID ? models.find((m) => m.id !== WINDMILL_ID) ?? pick : pick, placement)
  }

  return grouped
}

export function buildHouses(
  modelOrModels,
  placements,
  cellSize = HOUSE_CELL_SIZE,
) {
  const models = asModelList(modelOrModels)
  const group = new THREE.Group()
  group.name = 'TPX_Houses'
  const materials = []
  group.userData.materials = materials
  const random = createRandom(HOUSE_SEED)
  const assigned = assignHouseModels(placements, models, HOUSE_CATALOG, random)

  for (const model of models) {
    const plots = assigned.get(model.id)
    if (!plots?.length) continue

    const modelMaterials = model.parts.map((part) => houseMaterial(part.material))
    materials.push(...modelMaterials)
    const cellRandom = createRandom(HOUSE_SEED ^ hashId(model.id))

    for (const cell of chunkPlacements(plots, cellSize)) {
      const matrices = instanceMatrices(cell, model, cellRandom)
      const featureIds = new THREE.InstancedBufferAttribute(
        Float32Array.from(cell, (placement) => placement.slot),
        1,
      )

      model.parts.forEach((part, index) => {
        const mesh = new THREE.InstancedMesh(
          cellGeometry(part.geometry, featureIds),
          modelMaterials[index],
          cell.length,
        )
        matrices.forEach((matrix, slot) => mesh.setMatrixAt(slot, matrix))
        mesh.instanceMatrix.needsUpdate = true
        // Without this the cell keeps one house's bounds and is culled as soon as
        // that house leaves the screen.
        mesh.computeBoundingSphere()
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.name = `${model.id}:${part.name}`
        mesh.userData.modelId = model.id
        group.add(mesh)
      })
    }
  }

  return group
}

function hashId(id) {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return hash
}

export function setHouseHighlight(group, slot) {
  const materials = group?.userData?.materials
  if (!materials?.length) return false

  let applied = false
  for (const material of materials) {
    if (setHighlight(material, slot)) applied = true
  }
  return applied
}

// Per frame. Every part of the house has to ramp together, or a roof would
// reach full glow before its walls.
export function advanceHouseHighlight(group, delta) {
  const materials = group?.userData?.materials
  if (!materials?.length) return false

  let moving = false
  for (const material of materials) {
    if (advanceHighlight(material, delta)) moving = true
  }
  return moving
}
