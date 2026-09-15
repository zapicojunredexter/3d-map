import * as THREE from 'three'
import { createRandom } from './surfaces'
import { chunkPlacements, placementMatrix } from './treeInstances'

// Grass sits on the survey's parks and the open ground, never on the roads. A
// downloaded clump GLB is instanced at walking scale; the green floor texture
// fills the gaps so the lawn reads as continuous.

export const GREEN_LAYER = 'TPX_GreenAreas'
export const GROUND_LAYER = 'TPX_Ground'
export const ROAD_LAYER = 'TPX_RoadsOutlines'
export const GRASS_LAYERS = [GREEN_LAYER, GROUND_LAYER]

export const GRASS_CELL_SIZE = 50
export const GRASS_SEED = 20260917

// The download ships a pack of cards. Instancing every card as its own variant
// would multiply draw calls by the pack size in every cell, so only a few of
// the better-facing ones are kept.
export const GRASS_MAX_VARIANTS = 3

// Clumps per square metre. Ground is the big lawn (~900k m² before roads are
// cut out), so coverage comes from density × clump size, not density alone.
// Bump GROUND higher for a thicker carpet; past ~0.35 it gets expensive.
export const GRASS_DENSITY = {
  [GREEN_LAYER]: 0.55,
  [GROUND_LAYER]: 0.22,
}

// How wide each clump is relative to its height. Ground uses a wider stamp so
// fewer instances still seal the gaps between them.
export const CLUMP_SPREAD = {
  [GREEN_LAYER]: 1.15,
  [GROUND_LAYER]: 2.4,
}

export const CLUMP_HEIGHT = { min: 0.18, max: 0.42 }

// The dirt mesh runs under the roads. Without a keep-out, ground clumps poke
// through the pavement. A little padding clears the curb too.
export const ROAD_CLEARANCE = 0.45

const UP = new THREE.Vector3(0, 1, 0)

function triangleAreaXY(a, b, c) {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2
}

function sampleOnTriangle(a, b, c, random, target) {
  let u = random()
  let v = random()
  if (u + v > 1) {
    u = 1 - u
    v = 1 - v
  }
  const w = 1 - u - v
  return target.set(
    a.x * w + b.x * u + c.x * v,
    a.y * w + b.y * u + c.y * v,
    a.z * w + b.z * u + c.z * v,
  )
}

// Scatter clumps across one surface mesh, already in the trees' world space.
export function grassPlacements(
  mesh,
  placement,
  {
    density = GRASS_DENSITY[mesh?.name] ?? GRASS_DENSITY[GREEN_LAYER],
    spread = CLUMP_SPREAD[mesh?.name] ?? 1,
    seed = GRASS_SEED,
    random = createRandom(seed),
    blocked = null,
  } = {},
) {
  const geometry = mesh?.geometry
  const position = geometry?.getAttribute?.('position')
  if (!position || density <= 0) return []

  const index = geometry.index
  const triCount = index ? index.count / 3 : position.count / 3
  const toWorld = placementMatrix(placement)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const point = new THREE.Vector3()
  const placements = []
  const at = (slot) => (index ? index.getX(slot) : slot)

  for (let tri = 0; tri < triCount; tri += 1) {
    const base = tri * 3
    a.fromBufferAttribute(position, at(base))
    b.fromBufferAttribute(position, at(base + 1))
    c.fromBufferAttribute(position, at(base + 2))

    const area = triangleAreaXY(a, b, c)
    if (area <= 0) continue

    const count = Math.max(0, Math.round(area * density + random() - 0.35))
    for (let n = 0; n < count; n += 1) {
      sampleOnTriangle(a, b, c, random, point).applyMatrix4(toWorld)
      if (blocked?.(point.x, point.z)) continue
      placements.push({
        x: point.x,
        y: point.y,
        z: point.z,
        height:
          CLUMP_HEIGHT.min + random() * (CLUMP_HEIGHT.max - CLUMP_HEIGHT.min),
        yaw: random() * Math.PI * 2,
        spread,
      })
    }
  }

  return placements
}

function pointInTriangleXZ(px, pz, ax, az, bx, bz, cx, cz) {
  const v0x = cx - ax
  const v0z = cz - az
  const v1x = bx - ax
  const v1z = bz - az
  const v2x = px - ax
  const v2z = pz - az
  const dot00 = v0x * v0x + v0z * v0z
  const dot01 = v0x * v1x + v0z * v1z
  const dot02 = v0x * v2x + v0z * v2z
  const dot11 = v1x * v1x + v1z * v1z
  const dot12 = v1x * v2x + v1z * v2z
  const denom = dot00 * dot11 - dot01 * dot01
  if (Math.abs(denom) < 1e-12) return false
  const u = (dot11 * dot02 - dot01 * dot12) / denom
  const v = (dot00 * dot12 - dot01 * dot02) / denom
  return u >= 0 && v >= 0 && u + v <= 1
}

// The ground mesh is continuous under the pavement. This mask answers whether
// a world XZ point is on (or next to) a road, so dirt planting can skip it.
export function buildRoadMask(
  mesh,
  placement,
  { cellSize = 8, clearance = ROAD_CLEARANCE } = {},
) {
  const geometry = mesh?.geometry
  const position = geometry?.getAttribute?.('position')
  if (!position) return () => false

  const index = geometry.index
  const triCount = index ? index.count / 3 : position.count / 3
  const toWorld = placementMatrix(placement)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const at = (slot) => (index ? index.getX(slot) : slot)
  const cells = new Map()

  const push = (key, tri) => {
    let list = cells.get(key)
    if (!list) {
      list = []
      cells.set(key, list)
    }
    list.push(tri)
  }

  for (let tri = 0; tri < triCount; tri += 1) {
    const base = tri * 3
    a.fromBufferAttribute(position, at(base)).applyMatrix4(toWorld)
    b.fromBufferAttribute(position, at(base + 1)).applyMatrix4(toWorld)
    c.fromBufferAttribute(position, at(base + 2)).applyMatrix4(toWorld)

    // Inflate from the triangle centre so clumps stay off the curb, not only
    // off the painted asphalt.
    if (clearance > 0) {
      const cx = (a.x + b.x + c.x) / 3
      const cz = (a.z + b.z + c.z) / 3
      const grow = (point) => {
        const dx = point.x - cx
        const dz = point.z - cz
        const len = Math.hypot(dx, dz) || 1
        point.x += (dx / len) * clearance
        point.z += (dz / len) * clearance
      }
      grow(a)
      grow(b)
      grow(c)
    }

    const triData = [a.x, a.z, b.x, b.z, c.x, c.z]
    const minX = Math.floor(Math.min(a.x, b.x, c.x) / cellSize)
    const maxX = Math.floor(Math.max(a.x, b.x, c.x) / cellSize)
    const minZ = Math.floor(Math.min(a.z, b.z, c.z) / cellSize)
    const maxZ = Math.floor(Math.max(a.z, b.z, c.z) / cellSize)
    for (let gx = minX; gx <= maxX; gx += 1) {
      for (let gz = minZ; gz <= maxZ; gz += 1) {
        push(`${gx},${gz}`, triData)
      }
    }
  }

  return (x, z) => {
    const list = cells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`)
    if (!list) return false
    for (const [ax, az, bx, bz, cx, cz] of list) {
      if (pointInTriangleXZ(x, z, ax, az, bx, bz, cx, cz)) return true
    }
    return false
  }
}

// Parks first, then the dirt. Anything that would land on the pavement — from
// either layer — is rejected by the road mask. The dirt mesh is continuous
// under the roads; parks can also sit against or over them in the survey.
export function plantGrass(group, placement, options = {}) {
  const { densities = GRASS_DENSITY, spreads = CLUMP_SPREAD, seed = GRASS_SEED } =
    options
  const random = createRandom(seed)
  const planted = []
  const roads = group?.children?.find(
    (child) => child.isMesh && child.name === ROAD_LAYER,
  )
  const blocked = roads ? buildRoadMask(roads, placement) : null

  for (const layer of GRASS_LAYERS) {
    const mesh = group?.children?.find(
      (child) => child.isMesh && child.name === layer,
    )
    if (!mesh) continue
    // Avoid push(...hugeArray): dense ground planting can be hundreds of
    // thousands of clumps, and a spread that large blows the call stack.
    const next = grassPlacements(mesh, placement, {
      density: densities[layer] ?? 0,
      spread: spreads[layer] ?? 1,
      random,
      blocked,
    })
    for (let index = 0; index < next.length; index += 1) {
      planted.push(next[index])
    }
  }

  return planted
}

// The download is a Sketchfab pack of separate cards scattered in a huge
// volume. Each card becomes its own unit-tall variant so instances can pick
// one look without stretching the whole pack.
export function normalizeGrassModel(
  scene,
  { maxVariants = GRASS_MAX_VARIANTS } = {},
) {
  scene.updateMatrixWorld(true)
  const parts = []

  scene.traverse((object) => {
    if (!object.isMesh || !object.geometry) return

    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld)
    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox
    const size = bounds.getSize(new THREE.Vector3())
    if (size.y <= 1e-4) return

    const center = bounds.getCenter(new THREE.Vector3())
    const rebase = new THREE.Matrix4()
      .makeScale(1 / size.y, 1 / size.y, 1 / size.y)
      .multiply(
        new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z),
      )
    geometry.applyMatrix4(rebase)
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

    const spread = Math.max(size.x, size.z) / size.y
    parts.push({
      name: object.name,
      geometry,
      material: object.material,
      spread: Number.isFinite(spread) && spread > 0 ? spread : 1,
    })
  })

  if (parts.length === 0) throw new Error('Grass model has no meshes')

  // Edge-on cards (spread near 0) disappear from most angles. Prefer faces
  // that still read as a clump after instancing.
  const ranked = [...parts].sort((a, b) => {
    const score = (part) => {
      if (part.spread < 0.12) return part.spread
      return 1 - Math.abs(part.spread - 0.55)
    }
    return score(b) - score(a)
  })

  return { parts: ranked.slice(0, Math.max(1, maxVariants)) }
}

export function grassMaterial(source) {
  const material = source.clone()
  material.envMapIntensity = 0.3
  material.side = THREE.DoubleSide
  // Grass atlases are cut-outs. Blending thousands of cards has no correct
  // order, so the alpha is tested rather than blended — same as the trees.
  if (material.map || material.alphaMap || material.transparent) {
    material.transparent = false
    material.alphaTest = Math.max(material.alphaTest || 0, 0.45)
    material.depthWrite = true
  }
  return material
}

export function instanceMatrices(placements, modelSpread = 1) {
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()

  return placements.map((placement) => {
    const width = placement.height * modelSpread * (placement.spread ?? 1)
    position.set(placement.x, placement.y, placement.z)
    quaternion.setFromAxisAngle(UP, placement.yaw)
    scale.set(width, placement.height, width)
    return new THREE.Matrix4().compose(position, quaternion, scale)
  })
}

// Stable pick so a reload does not reshuffle which card sits where.
export function variantFor(placement, count) {
  if (count <= 1) return 0
  if (placement.variant != null) {
    return ((placement.variant % count) + count) % count
  }
  const wave = Math.sin(placement.x * 12.9898 + placement.z * 78.233) * 43758.5453
  return Math.floor((wave - Math.floor(wave)) * count)
}

export function buildGrass({ parts }, placements, cellSize = GRASS_CELL_SIZE) {
  const group = new THREE.Group()
  group.name = 'TPX_Grass'
  if (!placements.length || !parts.length) return group

  const materials = parts.map((part) => grassMaterial(part.material))

  for (const cell of chunkPlacements(placements, cellSize)) {
    const byVariant = new Map()
    for (const placement of cell) {
      const variant = variantFor(placement, parts.length)
      let list = byVariant.get(variant)
      if (!list) {
        list = []
        byVariant.set(variant, list)
      }
      list.push(placement)
    }

    for (const [variant, list] of byVariant) {
      const part = parts[variant]
      const matrices = instanceMatrices(list, part.spread)
      const mesh = new THREE.InstancedMesh(
        part.geometry,
        materials[variant],
        list.length,
      )
      matrices.forEach((matrix, slot) => mesh.setMatrixAt(slot, matrix))
      mesh.instanceMatrix.needsUpdate = true
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      mesh.name = part.name
      group.add(mesh)
    }
  }

  group.userData.materials = materials
  return group
}
