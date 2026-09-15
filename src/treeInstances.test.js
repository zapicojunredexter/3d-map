import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  CANOPY_SQUEEZE,
  TREE_ANIM_RADIUS,
  TREE_CONTAINER,
  advanceTreeAnimations,
  buildAnimatedTrees,
  buildTrees,
  canopyTest,
  chunkPlacements,
  instanceMatrices,
  normalizeTreeModel,
  orderStopMotionFrames,
  placementMatrix,
  prepareAnimatedTree,
  punchBlackAlpha,
  treeMaterial,
  treePlacements,
} from './treeInstances'

// A box of the given size, centred on its node, standing on the ground in the
// export's Z-up space.
function fakeTree(name, { x, y, height, width = 6 }) {
  const container = new THREE.Object3D()
  container.name = name
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, width, height))
  mesh.position.set(x, y, height / 2)
  container.add(mesh)
  return container
}

// The export is Z-up, so every placement goes through the same correction the
// city group gets.
const Z_UP = { position: new THREE.Vector3(0, 0, 0), rotation: [-Math.PI / 2, 0, 0] }

describe('TREE_CONTAINER', () => {
  it('matches the container nodes but not the parts inside them', () => {
    expect(TREE_CONTAINER.test('TPX_Trees_tree_0')).toBe(true)
    expect(TREE_CONTAINER.test('TPX_Trees_tree_12_3')).toBe(true)
    expect(TREE_CONTAINER.test('TPX_Trees_trunk_4_instance_9')).toBe(false)
    expect(TREE_CONTAINER.test('TPX_Trees_crown_4')).toBe(false)
    expect(TREE_CONTAINER.test('TPX_Buildings_7')).toBe(false)
  })
})

describe('treePlacements', () => {
  it('reads position, base and height from the container bounds', () => {
    const scene = new THREE.Group()
    scene.add(fakeTree('TPX_Trees_tree_0', { x: 10, y: 20, height: 8 }))
    scene.add(fakeTree('TPX_Buildings_1', { x: 0, y: 0, height: 30 }))

    const [tree, ...rest] = treePlacements(scene, Z_UP)

    expect(rest).toHaveLength(0)
    expect(tree.x).toBeCloseTo(10)
    expect(tree.z).toBeCloseTo(-20)
    expect(tree.y).toBeCloseTo(0)
    expect(tree.height).toBeCloseTo(8)
    expect(tree.radius).toBeCloseTo(3)
  })

  it('applies the same z-up correction and offset as the city group', () => {
    const scene = new THREE.Group()
    scene.add(fakeTree('TPX_Trees_tree_0', { x: 100, y: 40, height: 10 }))

    const placement = {
      position: new THREE.Vector3(-50, -2, -30),
      rotation: [-Math.PI / 2, 0, 0],
    }
    const [tree] = treePlacements(scene, placement)

    // Z-up (100, 40, 0..10) rotates to (100, 0..10, -40), then shifts.
    expect(tree.x).toBeCloseTo(50)
    expect(tree.y).toBeCloseTo(-2)
    expect(tree.z).toBeCloseTo(-70)
    expect(tree.height).toBeCloseTo(10)
  })

  it('agrees with the matrix the city group is built from', () => {
    const point = new THREE.Vector3(3, 7, 11)
    const placement = {
      position: new THREE.Vector3(5, -1, 2),
      rotation: [-Math.PI / 2, 0, 0],
    }

    const outer = new THREE.Group()
    outer.position.copy(placement.position)
    const inner = new THREE.Group()
    inner.rotation.set(...placement.rotation)
    outer.add(inner)
    outer.updateMatrixWorld(true)

    const mine = point.clone().applyMatrix4(placementMatrix(placement))
    const theirs = point.clone().applyMatrix4(inner.matrixWorld)

    expect(mine.x).toBeCloseTo(theirs.x)
    expect(mine.y).toBeCloseTo(theirs.y)
    expect(mine.z).toBeCloseTo(theirs.z)
  })
})

describe('normalizeTreeModel', () => {
  it('rebases the model to one unit tall, centred, standing on y=0', () => {
    const scene = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(2, 20, 2))
    trunk.name = 'trunk'
    trunk.position.set(8, 6, -4)
    const crown = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12))
    crown.name = 'crown'
    crown.position.set(8, 16, -4)
    scene.add(trunk, crown)

    const { parts, spread } = normalizeTreeModel(scene)
    expect(parts.map((part) => part.name)).toEqual(['trunk', 'crown'])

    const bounds = new THREE.Box3()
    for (const part of parts) bounds.union(part.geometry.boundingBox)

    expect(bounds.min.y).toBeCloseTo(0)
    expect(bounds.max.y).toBeCloseTo(1)
    const center = bounds.getCenter(new THREE.Vector3())
    expect(center.x).toBeCloseTo(0)
    expect(center.z).toBeCloseTo(0)
    // The crown is 12 across on a model standing 26 tall (-4 up to 22).
    expect(spread).toBeCloseTo(12 / 26)
  })

  it('leaves the source geometry untouched', () => {
    const scene = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 10, 4))
    scene.add(mesh)

    normalizeTreeModel(scene)
    mesh.geometry.computeBoundingBox()
    expect(mesh.geometry.boundingBox.max.y).toBeCloseTo(5)
  })

  it('refuses a model with nothing to draw', () => {
    expect(() => normalizeTreeModel(new THREE.Group())).toThrow(/no meshes/i)
  })
})

describe('chunkPlacements', () => {
  it('groups by cell and keeps every tree exactly once', () => {
    const placements = [
      { x: 10, z: 10 },
      { x: 90, z: 10 },
      { x: 110, z: 10 },
      { x: 10, z: 130 },
      { x: -10, z: 10 },
    ]
    const cells = chunkPlacements(placements, 100)

    expect(cells).toHaveLength(4)
    expect(cells.flat()).toHaveLength(placements.length)
    expect(cells[0]).toEqual([{ x: 10, z: 10 }, { x: 90, z: 10 }])
  })
})

describe('instanceMatrices', () => {
  const placements = [
    { x: 4, y: 2, z: -6, height: 9 },
    { x: 4, y: 2, z: -6, height: 9 },
  ]

  it('stands each instance at its point, scaled to its height', () => {
    const [matrix] = instanceMatrices(placements)
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    matrix.decompose(position, quaternion, scale)

    expect(position.toArray()).toEqual([4, 2, -6])
    expect(scale.y).toBeCloseTo(9)
    expect(scale.x).toBeCloseTo(scale.z)
    expect(scale.x).toBeLessThan(9 * CANOPY_SQUEEZE * 1.09)
    expect(scale.x).toBeGreaterThan(9 * CANOPY_SQUEEZE * 0.91)
  })

  it('varies identical trees but stays the same across runs', () => {
    const [first, second] = instanceMatrices(placements)
    expect(first.elements).not.toEqual(second.elements)
    expect(instanceMatrices(placements)[0].elements).toEqual(first.elements)
  })

  it('keeps the yaw on the vertical axis so trees stay upright', () => {
    const quaternion = new THREE.Quaternion()
    instanceMatrices(placements)[0].decompose(
      new THREE.Vector3(),
      quaternion,
      new THREE.Vector3(),
    )
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion)
    expect(up.y).toBeCloseTo(1)
  })
})

describe('treeMaterial', () => {
  it('converts blended foliage to an alpha test and keeps depth', () => {
    const source = new THREE.MeshStandardMaterial({ transparent: true })
    const material = treeMaterial(source)

    expect(material).not.toBe(source)
    expect(material.transparent).toBe(false)
    expect(material.alphaTest).toBe(0.5)
    expect(material.depthWrite).toBe(true)
    expect(source.transparent).toBe(true)
  })

  it('leaves opaque bark alone', () => {
    const material = treeMaterial(new THREE.MeshStandardMaterial())
    expect(material.alphaTest).toBe(0)
    expect(material.transparent).toBe(false)
  })

  it('punches pure-black atlas pixels to alpha for cut-out foliage', () => {
    const data = new Uint8Array([
      0, 0, 0, 255, 20, 120, 40, 255, 0, 0, 0, 255, 10, 80, 20, 255,
    ])
    const map = new THREE.DataTexture(data, 2, 2)
    map.format = THREE.RGBAFormat
    map.needsUpdate = true
    const source = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: new THREE.Color(1, 1, 1),
    })

    const material = treeMaterial(source)

    expect(material.map).not.toBe(map)
    expect(material.emissiveMap).toBe(material.map)
    expect(Array.from(material.map.image.data)).toEqual([
      0, 0, 0, 0, 20, 120, 40, 255, 0, 0, 0, 0, 10, 80, 20, 255,
    ])
    expect(material.alphaTest).toBe(0.5)
    expect(material.transparent).toBe(false)
    expect(data[3]).toBe(255)
  })
})

describe('punchBlackAlpha', () => {
  it('returns the same texture when nothing is black', () => {
    const data = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255])
    const map = new THREE.DataTexture(data, 2, 1)
    map.format = THREE.RGBAFormat
    expect(punchBlackAlpha(map)).toBe(map)
  })
})

describe('buildTrees', () => {
  const model = {
    id: 'test',
    parts: [
      {
        name: 'bark',
        geometry: new THREE.BoxGeometry(1, 1, 1),
        material: new THREE.MeshStandardMaterial(),
      },
      {
        name: 'leaves',
        geometry: new THREE.BoxGeometry(1, 1, 1),
        material: new THREE.MeshStandardMaterial({ transparent: true }),
      },
    ],
  }

  it('builds one instanced mesh per part per cell', () => {
    const placements = [
      { x: 0, y: 0, z: 0, height: 8, radius: 3 },
      { x: 20, y: 0, z: 0, height: 9, radius: 3 },
      { x: 400, y: 0, z: 0, height: 7, radius: 3 },
    ]
    const group = buildTrees(model, placements, 100)

    const meshes = group.children
    expect(meshes).toHaveLength(4)
    expect(meshes.every((mesh) => mesh.isInstancedMesh)).toBe(true)
    expect(meshes.map((mesh) => mesh.count).sort()).toEqual([1, 1, 2, 2])

    for (const mesh of meshes) {
      // A cell must be culled by its own extent, not the single tree's.
      expect(mesh.boundingSphere).toBeTruthy()
      expect(mesh.castShadow).toBe(true)
    }
  })

  it('does not repeat the same variations in every cell', () => {
    const placements = Array.from({ length: 4 }, (_, index) => ({
      x: index * 200,
      y: 0,
      z: 0,
      height: 8,
      radius: 3,
    }))
    const group = buildTrees(model, placements, 100)
    const firsts = group.children
      .filter((mesh) => mesh.name.endsWith('bark'))
      .map((mesh) => {
        const matrix = new THREE.Matrix4()
        mesh.getMatrixAt(0, matrix)
        // Yaw and width, with the cell's own position taken out.
        return matrix.elements.slice(0, 11).join()
      })

    expect(new Set(firsts).size).toBe(firsts.length)
  })

  it('shares one material per part across every cell', () => {
    const placements = Array.from({ length: 6 }, (_, index) => ({
      x: index * 200,
      y: 0,
      z: 0,
      height: 8,
      radius: 3,
    }))
    const group = buildTrees(model, placements, 100)
    const leaves = group.children.filter((mesh) => mesh.name.endsWith('leaves'))

    expect(leaves).toHaveLength(6)
    expect(new Set(leaves.map((mesh) => mesh.material)).size).toBe(1)
    expect(leaves[0].material.alphaTest).toBe(0.5)
  })

  it('scatters placements across multiple models', () => {
    const models = [
      { ...model, id: 'a' },
      {
        id: 'b',
        parts: [
          {
            name: 'trunk',
            geometry: new THREE.BoxGeometry(1, 1, 1),
            material: new THREE.MeshStandardMaterial(),
          },
        ],
      },
    ]
    const placements = Array.from({ length: 40 }, (_, index) => ({
      x: index * 10,
      y: 0,
      z: 0,
      height: 8,
      radius: 3,
    }))
    const group = buildTrees(models, placements, 1000)
    const ids = new Set(group.children.map((mesh) => mesh.userData.modelId))

    expect(ids.has('a')).toBe(true)
    expect(ids.has('b')).toBe(true)
  })
})

describe('canopyTest', () => {
  it('reports points under a crown', () => {
    const under = canopyTest([
      { x: 0, z: 0, radius: 4 },
      { x: 50, z: 50, radius: 2 },
    ])

    expect(under(0, 0)).toBe(true)
    expect(under(3, 0)).toBe(true)
    expect(under(5, 0)).toBe(false)
    expect(under(51, 50)).toBe(true)
    expect(under(53, 50)).toBe(false)
  })

  it('is clear everywhere when nothing is planted', () => {
    expect(canopyTest([])(0, 0)).toBe(false)
  })
})

function skinnedTreeScene() {
  const scene = new THREE.Group()
  const bone = new THREE.Bone()
  bone.name = 'Trunk'
  bone.position.y = 1
  const skeleton = new THREE.Skeleton([bone])
  const geometry = new THREE.BoxGeometry(2, 10, 2)
  geometry.translate(0, 5, 0)
  const mesh = new THREE.SkinnedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ transparent: true }),
  )
  mesh.name = 'foliage'
  mesh.add(bone)
  mesh.bind(skeleton)
  scene.add(mesh)
  return scene
}

describe('prepareAnimatedTree', () => {
  it('rebases a skinned tree to one unit tall without flattening bones', () => {
    const { template, spread } = prepareAnimatedTree(skinnedTreeScene())
    template.updateMatrixWorld(true)
    const bounds = new THREE.Box3()
    template.traverse((object) => {
      if (!object.isMesh || !object.geometry) return
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
      bounds.union(
        object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld),
      )
    })

    expect(bounds.min.y).toBeCloseTo(0)
    expect(bounds.max.y).toBeCloseTo(1)
    expect(spread).toBeCloseTo(0.2)

    let bones = 0
    template.traverse((object) => {
      if (object.isSkinnedMesh) {
        expect(object.skeleton.bones).toHaveLength(1)
        expect(object.material.alphaTest).toBe(0.5)
        bones += 1
      }
    })
    expect(bones).toBe(1)
  })
})

describe('buildAnimatedTrees', () => {
  it('plants one skinned clone per placement and wires mixers', () => {
    const model = prepareAnimatedTree(skinnedTreeScene())
    const clip = new THREE.AnimationClip('sway', 1, [
      new THREE.VectorKeyframeTrack('Trunk.position', [0, 1], [0, 1, 0, 0, 1.1, 0]),
    ])
    const placements = [
      { x: 0, y: 0, z: 0, height: 8, radius: 3 },
      { x: 20, y: 0, z: 5, height: 9, radius: 3 },
    ]

    const group = buildAnimatedTrees(model, [clip], placements)

    expect(group.children).toHaveLength(2)
    expect(group.userData.mixers).toHaveLength(2)
    expect(group.children[0].scale.y).toBeCloseTo(8)
    expect(group.children[1].position.x).toBeCloseTo(20)
  })

  it('only advances mixers near the camera', () => {
    const model = prepareAnimatedTree(skinnedTreeScene())
    const clip = new THREE.AnimationClip('sway', 2, [
      new THREE.VectorKeyframeTrack('Trunk.position', [0, 2], [0, 1, 0, 0, 1.2, 0]),
    ])
    const group = buildAnimatedTrees(model, [clip], [
      { x: 0, y: 0, z: 0, height: 8, radius: 3 },
      { x: TREE_ANIM_RADIUS * 3, y: 0, z: 0, height: 8, radius: 3 },
    ])

    const [near, far] = group.userData.mixers
    const nearTime = near.mixer.time
    const farTime = far.mixer.time

    advanceTreeAnimations(group, 0.25, new THREE.Vector3(0, 0, 0))

    expect(near.mixer.time).toBeGreaterThan(nearTime)
    expect(far.mixer.time).toBe(farTime)
  })
})

function stopMotionScene() {
  const scene = new THREE.Group()
  const timeframe = new THREE.Group()
  // Match the name GLTFLoader emits after stripping punctuation.
  timeframe.name = 'sketchfabtimeframe'

  for (const [name, scale] of [
    ['Object_2', 1e-10],
    ['Object_7', 1e-10],
    ['Object_12', 1e-10],
    ['Object_17', 1],
  ]) {
    const frame = new THREE.Group()
    frame.name = name
    frame.scale.setScalar(scale)
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 10, 2),
      new THREE.MeshStandardMaterial(),
    )
    mesh.position.y = 5
    frame.add(mesh)
    timeframe.add(frame)
  }

  scene.add(timeframe)
  return scene
}

function stopMotionClip() {
  return new THREE.AnimationClip('Object_0', 1, [
    new THREE.VectorKeyframeTrack(
      'Object_17.scale',
      [0, 0.25],
      [1, 1, 1, 1, 1, 1],
    ),
    new THREE.VectorKeyframeTrack(
      'Object_12.scale',
      [0, 0.25, 0.5],
      [1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1, 1, 1],
    ),
    new THREE.VectorKeyframeTrack(
      'Object_7.scale',
      [0, 0.5, 0.75],
      [1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1, 1, 1],
    ),
    new THREE.VectorKeyframeTrack(
      'Object_2.scale',
      [0, 0.75, 1],
      [1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1, 1, 1],
    ),
  ])
}

describe('stop-motion trees', () => {
  it('orders Sketchfab frames by when they appear, not node order', () => {
    const root = stopMotionScene()
    const frames = orderStopMotionFrames(root, stopMotionClip())
    expect(frames.map((frame) => frame.name)).toEqual([
      'Object_17',
      'Object_12',
      'Object_7',
      'Object_2',
    ])
  })

  it('snaps visibility between poses instead of scaling them', () => {
    const model = prepareAnimatedTree(stopMotionScene(), [stopMotionClip()])
    expect(model.stopMotion).toBe(true)
    expect(model.frameDuration).toBeCloseTo(0.25)

    const group = buildAnimatedTrees(model, [stopMotionClip()], [
      { x: 0, y: 0, z: 0, height: 8, radius: 3 },
    ])
    const [entry] = group.userData.mixers
    expect(entry.stopMotion).toBe(true)
    entry.time = 0
    entry.timeScale = 1
    entry.frameIndex = 0
    entry.frames.forEach((frame, index) => {
      frame.visible = index === 0
    })

    advanceTreeAnimations(group, 0.26, new THREE.Vector3(0, 0, 0))
    expect(entry.frames.map((frame) => frame.visible)).toEqual([
      false,
      true,
      false,
      false,
    ])
    expect(entry.frames.every((frame) => frame.scale.x === 1)).toBe(true)
  })
})
