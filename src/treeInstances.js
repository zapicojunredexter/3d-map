import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
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

// Skeletal sway is only worth evaluating near the camera. Far trees keep the
// last pose they were left in, which is invisible at that distance.
export const TREE_ANIM_RADIUS = 140

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

// The source tree is often off-centre and may be authored Z-up (Sketchfab FBX).
// Rebase to one unit tall on y=0 so an instance matrix only carries position,
// yaw and the survey height it has to match.
export function normalizeTreeModel(scene, catalogEntry = null) {
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

  let size = bounds.getSize(new THREE.Vector3())
  // FBX-via-Sketchfab trees often keep height on Z. Stand them up before
  // measuring so planting scale matches the survey trunks.
  if (size.z > size.y && size.z >= size.x) {
    const stand = new THREE.Matrix4().makeRotationX(-Math.PI / 2)
    bounds.makeEmpty()
    for (const part of parts) {
      part.geometry.applyMatrix4(stand)
      part.geometry.computeBoundingBox()
      bounds.union(part.geometry.boundingBox)
    }
    size = bounds.getSize(new THREE.Vector3())
  }

  const center = bounds.getCenter(new THREE.Vector3())
  if (size.y <= 0) throw new Error('Tree model has no height')

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
    id: catalogEntry?.id ?? parts[0]?.name ?? 'tree',
    parts,
    spread: Math.max(size.x, size.z) / size.y,
  }
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
//
// Pixel-art trees (e.g. Sketchfab stop-motion pines) often ship an RGB atlas
// with a pure-black backdrop instead of an alpha channel. Chroma-key that to
// alpha=0 so alphaTest can discard it.
export function punchBlackAlpha(texture, threshold = 0) {
  const image = texture?.image
  if (!image) return texture

  const width = image.width
  const height = image.height
  if (!width || !height) return texture

  let data
  if (image.data) {
    data = image.data.slice ? image.data.slice() : Uint8ClampedArray.from(image.data)
  } else if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return texture
    ctx.drawImage(image, 0, 0)
    const imgData = ctx.getImageData(0, 0, width, height)
    data = imgData.data
    let punched = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] <= threshold) {
        data[i + 3] = 0
        punched += 1
      }
    }
    if (punched === 0) return texture
    ctx.putImageData(imgData, 0, 0)
    const next = texture.clone()
    next.image = canvas
    next.needsUpdate = true
    return next
  } else {
    return texture
  }

  let punched = 0
  const channels = data.length / (width * height)
  if (channels < 4) return texture
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] + data[i + 1] + data[i + 2] <= threshold) {
      data[i + 3] = 0
      punched += 1
    }
  }
  if (punched === 0) return texture

  const next = texture.clone()
  next.image = { data, width, height }
  next.format = THREE.RGBAFormat
  next.needsUpdate = true
  return next
}

function cutoutMaps(material, source) {
  const map = material.map
  if (!map) return false

  const punched = punchBlackAlpha(map)
  if (punched === map) return false

  material.map = punched
  if (
    material.emissiveMap === map ||
    (source.emissiveMap && material.emissiveMap === source.emissiveMap)
  ) {
    material.emissiveMap = punched
  }
  return true
}

export function treeMaterial(source) {
  const material = source.clone()
  material.envMapIntensity = 0.65

  const punched = cutoutMaps(material, source)
  if (punched || material.transparent) {
    material.transparent = false
    material.alphaTest = Math.max(material.alphaTest || 0, 0.5)
    material.depthWrite = true
  }

  return material
}

export function buildTrees(modelOrModels, placements, cellSize = TREE_CELL_SIZE) {
  const models = Array.isArray(modelOrModels) ? modelOrModels : [modelOrModels]
  const group = new THREE.Group()
  group.name = 'TPX_Trees'
  const random = createRandom(TREE_SEED)
  const assigned = assignTreeModels(placements, models, random)

  for (const model of models) {
    const plots = assigned.get(model.id)
    if (!plots?.length) continue

    const materials = model.parts.map((part) => treeMaterial(part.material))
    const cellRandom = createRandom(TREE_SEED ^ hashId(model.id))

    for (const cell of chunkPlacements(plots, cellSize)) {
      const matrices = instanceMatrices(cell, cellRandom)

      model.parts.forEach((part, index) => {
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
        mesh.name = `${model.id}:${part.name}`
        mesh.userData.modelId = model.id
        group.add(mesh)
      })
    }
  }

  return group
}

export function assignTreeModels(placements, models, random = createRandom(TREE_SEED)) {
  const grouped = new Map()
  if (!models.length) return grouped

  for (const placement of placements) {
    const model = models[Math.floor(random() * models.length)]
    let list = grouped.get(model.id)
    if (!list) {
      list = []
      grouped.set(model.id, list)
    }
    list.push(placement)
  }

  return grouped
}

function hashId(id) {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return hash
}

// Animated glTF trees keep their skeleton. The source is wrapped so the root
// stands one unit tall on y=0; planting then only needs position, yaw and scale.
function objectBounds(root) {
  const bounds = new THREE.Box3()
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return
    const { geometry } = object
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    // Prefer the bind-pose box: setFromObject skin-transforms and needs
    // JOINTS/WEIGHTS that a hand-built test mesh may not carry.
    bounds.union(geometry.boundingBox.clone().applyMatrix4(object.matrixWorld))
  })
  return bounds
}

function findTimeframeRoot(root) {
  let found = null
  root.traverse((object) => {
    if (found) return
    const name = object.name ?? ''
    // GLTFLoader strips punctuation from node names, so "sketchfab.timeframe"
    // arrives as "sketchfabtimeframe".
    if (/^sketchfab[._]?timeframe$/i.test(name)) found = object
  })
  return found
}

function scaleTrackForNode(clip, nodeName) {
  if (!clip) return null
  return (
    clip.tracks.find(
      (track) =>
        track.name === `${nodeName}.scale` ||
        track.name.endsWith(`/${nodeName}.scale`),
    ) ?? null
  )
}

function firstVisibleTime(track, fallback) {
  if (!track) return fallback
  const { times, values } = track
  for (let i = 0; i < times.length; i += 1) {
    if (values[i * 3] > 0.5) return times[i]
  }
  return fallback
}

// Sketchfab stop-motion exports one mesh per pose and "shows" them by scaling
// from ~0 to 1 with LINEAR interpolation. Three plays that as a grow/shrink.
// Sketchfab itself steps frames, so we rebuild the cycle as visibility snaps.
export function orderStopMotionFrames(root, clip) {
  const timeframe = findTimeframeRoot(root)
  if (!timeframe?.children?.length) return null

  const scored = timeframe.children.map((child, index) => ({
    child,
    appear: firstVisibleTime(
      scaleTrackForNode(clip, child.name),
      child.scale.x > 0.5 ? 0 : 1000 + index,
    ),
  }))
  scored.sort((a, b) => a.appear - b.appear || a.child.id - b.child.id)
  return scored.map((entry) => entry.child)
}

export function stopMotionFrameDuration(clip, frameCount) {
  if (frameCount <= 0) return 0.25
  if (clip?.duration > 0) return clip.duration / frameCount
  return 0.25
}

function applyTreeMaterials(root) {
  const materials = new Map()
  root.traverse((object) => {
    if (!object.isMesh) return
    object.castShadow = true
    object.receiveShadow = true
    // Gentle sway / frame swaps can push verts outside the bind-pose sphere.
    object.frustumCulled = false

    const sources = Array.isArray(object.material)
      ? object.material
      : [object.material]
    const replaced = sources.map((source) => {
      if (!source) return source
      let material = materials.get(source)
      if (!material) {
        material = treeMaterial(source)
        materials.set(source, material)
      }
      return material
    })
    object.material = Array.isArray(object.material) ? replaced : replaced[0]
  })
}

export function prepareAnimatedTree(scene, clips = []) {
  const root = cloneSkeleton(scene)
  const clip = clips[0]
  const frames = orderStopMotionFrames(root, clip)

  if (frames) {
    // Measure every pose at full size; the export leaves later frames scaled away.
    for (const frame of frames) {
      frame.scale.set(1, 1, 1)
      frame.visible = true
    }
  }

  root.updateMatrixWorld(true)

  const bounds = objectBounds(root)
  if (bounds.isEmpty()) throw new Error('Tree model has no meshes')

  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  if (size.y <= 0) throw new Error('Tree model has no height')

  root.position.set(-center.x, -bounds.min.y, -center.z)
  root.scale.setScalar(1 / size.y)
  root.updateMatrixWorld(true)

  applyTreeMaterials(root)

  if (frames) {
    frames.forEach((frame, index) => {
      frame.visible = index === 0
    })
  }

  const template = new THREE.Group()
  template.name = 'TreeTemplate'
  template.add(root)

  return {
    template,
    spread: Math.max(size.x, size.z) / size.y,
    stopMotion: Boolean(frames),
    frameNames: frames?.map((frame) => frame.name) ?? null,
    frameDuration: stopMotionFrameDuration(clip, frames?.length ?? 0),
  }
}

function plantTreeTransform(tree, placement, random) {
  const width = placement.height * CANOPY_SQUEEZE * (0.92 + random() * 0.16)
  tree.position.set(placement.x, placement.y, placement.z)
  tree.rotation.y = random() * Math.PI * 2
  tree.scale.set(width, placement.height, width)
}

export function buildAnimatedTrees(
  model,
  clips,
  placements,
  cellSize = TREE_CELL_SIZE,
) {
  const { template } = model
  const group = new THREE.Group()
  group.name = 'TPX_Trees'
  const mixers = []
  group.userData.mixers = mixers

  const clip = clips[0]
  const random = createRandom(TREE_SEED)

  for (const cell of chunkPlacements(placements, cellSize)) {
    for (const placement of cell) {
      const tree = cloneSkeleton(template)
      plantTreeTransform(tree, placement, random)

      if (model.stopMotion && model.frameNames?.length) {
        const frames = model.frameNames.map((name) => {
          const frame = tree.getObjectByName(name)
          if (!frame) throw new Error(`Missing stop-motion frame ${name}`)
          return frame
        })
        const timeScale = 0.85 + random() * 0.3
        const time = random() * model.frameDuration * frames.length
        const frameIndex =
          Math.floor(time / model.frameDuration) % frames.length
        frames.forEach((frame, index) => {
          frame.visible = index === frameIndex
          frame.scale.set(1, 1, 1)
        })
        mixers.push({
          stopMotion: true,
          frames,
          frameDuration: model.frameDuration,
          frameIndex,
          time,
          timeScale,
          x: placement.x,
          z: placement.z,
        })
      } else {
        if (!clip) continue
        const mixer = new THREE.AnimationMixer(tree)
        const action = mixer.clipAction(clip)
        action.play()
        action.time = random() * clip.duration
        action.timeScale = 0.85 + random() * 0.3
        mixer.update(0)

        mixers.push({
          mixer,
          x: placement.x,
          z: placement.z,
        })
      }

      group.add(tree)
    }
  }

  return group
}

export function advanceTreeAnimations(
  group,
  delta,
  camera,
  radius = TREE_ANIM_RADIUS,
) {
  const mixers = group?.userData?.mixers
  if (!mixers?.length) return

  const radiusSq = radius * radius
  const cx = camera.x
  const cz = camera.z

  for (const entry of mixers) {
    const dx = entry.x - cx
    const dz = entry.z - cz
    if (dx * dx + dz * dz > radiusSq) continue

    if (entry.stopMotion) {
      entry.time += delta * entry.timeScale
      const count = entry.frames.length
      const next =
        Math.floor(entry.time / entry.frameDuration) % count
      if (next === entry.frameIndex) continue
      entry.frames[entry.frameIndex].visible = false
      entry.frames[next].visible = true
      entry.frameIndex = next
      continue
    }

    entry.mixer.update(delta)
  }
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
