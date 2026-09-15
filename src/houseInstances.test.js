import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { HIGHLIGHT_FADE_SECONDS, NO_HIGHLIGHT } from './featureHighlight'
import {
  FOOTPRINT_INSET,
  advanceHouseHighlight,
  buildHouses,
  buildingPlacements,
  houseMaterial,
  instanceMatrices,
  normalizeHouseModel,
  setHouseHighlight,
} from './houseInstances'
import { BUILDINGS_LAYER } from './buildingStyles'
import { FEATURE_ID, mergeWorldByLayer } from './mergeWorld'

// The export is z-up, so placements go through the same correction the city
// group is built from.
const Z_UP = { position: new THREE.Vector3(0, 0, 0), rotation: [-Math.PI / 2, 0, 0] }

// Blocks as TopoExport writes them: z-up extrusions standing on z=0.
function blockCity(blocks) {
  const material = new THREE.MeshStandardMaterial()
  const root = new THREE.Group()

  blocks.forEach(({ x, y, w, d, h }, index) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), material)
    mesh.position.set(x, y, h / 2)
    mesh.name = `${BUILDINGS_LAYER}_${index}`
    root.add(mesh)
  })

  const merged = mergeWorldByLayer(root, { identify: [BUILDINGS_LAYER] })
  return merged.children.find((child) => child.name === BUILDINGS_LAYER)
}

// A house-shaped stand-in: longer than it is deep, off-centre and dipping below
// its own origin, like the real asset.
function fakeHouse() {
  const scene = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5))
  body.name = 'VH2_house1_0'
  body.position.set(1, 1.9, 0.5)
  scene.add(body)

  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.2))
  door.name = 'VH2_door_0'
  door.position.set(1, 0.9, 3)
  scene.add(door)
  return scene
}

describe('buildingPlacements', () => {
  it('reads each plot back out of the merged mesh', () => {
    const blocks = blockCity([{ x: 0, y: 0, w: 10, d: 8, h: 6 }])
    const [plot, ...rest] = buildingPlacements(blocks, Z_UP)

    expect(rest).toHaveLength(0)
    expect(plot.width).toBeCloseTo(10)
    expect(plot.depth).toBeCloseTo(8)
    expect(plot.height).toBeCloseTo(6)
    // Standing on the ground, not centred on it.
    expect(plot.y).toBeCloseTo(0)
  })

  it('agrees with the slots picking and the glow already use', () => {
    const blocks = blockCity([
      { x: 0, y: 0, w: 10, d: 8, h: 6 },
      { x: 40, y: 0, w: 6, d: 6, h: 6 },
      { x: 80, y: 0, w: 20, d: 12, h: 9 },
    ])
    const placements = buildingPlacements(blocks, Z_UP)
    const slots = blocks.geometry.getAttribute(FEATURE_ID)

    expect(placements.map((plot) => plot.slot)).toEqual([0, 1, 2])
    for (const plot of placements) {
      expect(plot.name).toBe(blocks.userData.featureNames[plot.slot])
    }
    expect(slots.count).toBeGreaterThan(0)
  })

  it('applies the z-up correction and offset of the city group', () => {
    const blocks = blockCity([{ x: 100, y: 40, w: 10, d: 8, h: 6 }])
    const [plot] = buildingPlacements(blocks, {
      position: new THREE.Vector3(-50, -2, -30),
      rotation: [-Math.PI / 2, 0, 0],
    })

    // Z-up (100, 40) rotates to x=100, z=-40, then shifts by the placement.
    expect(plot.x).toBeCloseTo(50)
    expect(plot.z).toBeCloseTo(-70)
    expect(plot.y).toBeCloseTo(-2)
    // Depth came from the export's y, so the correction has to swap the axes.
    expect(plot.width).toBeCloseTo(10)
    expect(plot.depth).toBeCloseTo(8)
    expect(plot.height).toBeCloseTo(6)
  })

  it('has nothing to place on a city with no identified buildings', () => {
    const material = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
    mesh.name = `${BUILDINGS_LAYER}_0`
    root.add(mesh)
    const merged = mergeWorldByLayer(root)

    expect(buildingPlacements(merged.children[0], Z_UP)).toEqual([])
    expect(buildingPlacements(undefined, Z_UP)).toEqual([])
  })
})

describe('normalizeHouseModel', () => {
  it('rebases every part into one shared unit box on the ground', () => {
    const { parts } = normalizeHouseModel(fakeHouse())
    const bounds = new THREE.Box3()
    for (const part of parts) bounds.union(part.geometry.boundingBox)

    expect(bounds.min.y).toBeCloseTo(0)
    expect(bounds.max.y).toBeCloseTo(1)
    expect(bounds.min.x).toBeCloseTo(-0.5)
    expect(bounds.max.x).toBeCloseTo(0.5)
    expect(bounds.min.z).toBeCloseTo(-0.5)
    expect(bounds.max.z).toBeCloseTo(0.5)
  })

  it('reports which way the ridge runs', () => {
    expect(normalizeHouseModel(fakeHouse()).ridgeAlongX).toBe(true)
  })

  it('keeps every part, so doors and windows survive', () => {
    const { parts } = normalizeHouseModel(fakeHouse())

    expect(parts.map((part) => part.name)).toEqual([
      'VH2_house1_0',
      'VH2_door_0',
    ])
  })

  it('leaves the loaded model alone, so a reload is not cumulative', () => {
    const scene = fakeHouse()
    const source = scene.children[0].geometry
    const before = source.getAttribute('position').array.slice()
    normalizeHouseModel(scene)

    expect(source.getAttribute('position').array).toEqual(before)
  })

  it('refuses a model with no meshes', () => {
    expect(() => normalizeHouseModel(new THREE.Group())).toThrow(/no meshes/i)
  })
})

describe('instanceMatrices', () => {
  const decompose = (matrix) => {
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    matrix.decompose(position, quaternion, scale)
    return { position, quaternion, scale }
  }

  it('fills the plot, inset so neighbours do not share a wall', () => {
    const [matrix] = instanceMatrices([
      { x: 5, y: 2, z: -3, width: 10, depth: 8, height: 6 },
    ])
    const { position, scale } = decompose(matrix)

    expect(position.toArray()).toEqual([5, 2, -3])
    expect(scale.x).toBeCloseTo(10 * FOOTPRINT_INSET)
    expect(scale.z).toBeCloseTo(8 * FOOTPRINT_INSET)
    // Height fills the block exactly, or roofs would float above the plot.
    expect(scale.y).toBeCloseTo(6)
  })

  it('turns the house so its ridge follows the long side of a deep plot', () => {
    const [matrix] = instanceMatrices([
      { x: 0, y: 0, z: 0, width: 8, depth: 20, height: 6 },
    ])
    const { quaternion, scale } = decompose(matrix)

    // Turned a quarter, so the model's own x now spans the plot's depth.
    expect(scale.x).toBeCloseTo(20 * FOOTPRINT_INSET)
    expect(scale.z).toBeCloseTo(8 * FOOTPRINT_INSET)

    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ')
    expect(Math.abs(Math.cos(euler.y))).toBeCloseTo(0)
  })

  it('still covers the plot after the front is turned around', () => {
    // Whatever yaw the jitter picks, the footprint it spans cannot change.
    const plots = Array.from({ length: 24 }, (unused, index) => ({
      x: index * 30,
      y: 0,
      z: 0,
      width: 12,
      depth: 9,
      height: 6,
    }))

    for (const matrix of instanceMatrices(plots)) {
      const box = new THREE.Box3(
        new THREE.Vector3(-0.5, 0, -0.5),
        new THREE.Vector3(0.5, 1, 0.5),
      ).applyMatrix4(matrix)
      const size = box.getSize(new THREE.Vector3())

      expect(size.x).toBeCloseTo(12 * FOOTPRINT_INSET)
      expect(size.z).toBeCloseTo(9 * FOOTPRINT_INSET)
    }
  })

  it('only ever yaws, so no house leans off its plot', () => {
    const plots = Array.from({ length: 16 }, (unused, index) => ({
      x: index,
      y: 0,
      z: 0,
      width: 10,
      depth: 8,
      height: 6,
    }))

    for (const matrix of instanceMatrices(plots)) {
      const euler = new THREE.Euler().setFromQuaternion(
        decompose(matrix).quaternion,
        'YXZ',
      )
      expect(euler.x).toBeCloseTo(0)
      expect(euler.z).toBeCloseTo(0)
    }
  })

  it('does not point every house the same way', () => {
    const plots = Array.from({ length: 40 }, (unused, index) => ({
      x: index * 20,
      y: 0,
      z: 0,
      width: 12,
      depth: 9,
      height: 6,
    }))
    const yaws = new Set(
      instanceMatrices(plots).map((matrix) =>
        decompose(matrix).quaternion.y.toFixed(3),
      ),
    )

    expect(yaws.size).toBeGreaterThan(1)
  })

  it('lays the city out the same way on every load', () => {
    const plots = [{ x: 0, y: 0, z: 0, width: 12, depth: 9, height: 6 }]

    expect(instanceMatrices(plots)[0].elements).toEqual(
      instanceMatrices(plots)[0].elements,
    )
  })
})

describe('buildHouses', () => {
  const plots = (count) =>
    Array.from({ length: count }, (unused, index) => ({
      slot: index,
      name: `${BUILDINGS_LAYER}_${index}`,
      x: index * 10,
      y: 0,
      z: 0,
      width: 10,
      depth: 8,
      height: 6,
    }))

  it('draws one instanced mesh per part of each cell', () => {
    const model = normalizeHouseModel(fakeHouse())
    // Two cells at this size, two parts each.
    const houses = buildHouses(model, plots(4), 20)

    expect(houses.children).toHaveLength(4)
    for (const mesh of houses.children) {
      expect(mesh.isInstancedMesh).toBe(true)
      expect(mesh.count).toBe(2)
    }
  })

  it('tags each instance with the slot the crosshair reports', () => {
    const model = normalizeHouseModel(fakeHouse())
    const houses = buildHouses(model, plots(3), 1000)
    const [mesh] = houses.children
    const slots = mesh.geometry.getAttribute(FEATURE_ID)

    // Per instance, not per vertex: that is what lets one merged block's id
    // light up a whole house.
    expect(slots.isInstancedBufferAttribute).toBe(true)
    expect([...slots.array]).toEqual([0, 1, 2])
  })

  it('shares one material and one vertex buffer across every cell', () => {
    const model = normalizeHouseModel(fakeHouse())
    const houses = buildHouses(model, plots(6), 20)
    const bodies = houses.children.filter((mesh) => mesh.name === 'VH2_house1_0')

    expect(bodies.length).toBeGreaterThan(1)
    for (const body of bodies) {
      expect(body.material).toBe(bodies[0].material)
      expect(body.geometry.getAttribute('position')).toBe(
        bodies[0].geometry.getAttribute('position'),
      )
    }
  })

  it('gives each cell bounds covering its own houses, not one house', () => {
    const model = normalizeHouseModel(fakeHouse())
    const houses = buildHouses(model, plots(4), 1000)
    const [mesh] = houses.children

    expect(mesh.boundingSphere.radius).toBeGreaterThan(15)
  })

  it('casts and receives shadows like the rest of the city', () => {
    const model = normalizeHouseModel(fakeHouse())
    const houses = buildHouses(model, plots(2))

    for (const mesh of houses.children) {
      expect(mesh.castShadow).toBe(true)
      expect(mesh.receiveShadow).toBe(true)
    }
  })

  it('builds nothing when no plot was found', () => {
    const model = normalizeHouseModel(fakeHouse())

    expect(buildHouses(model, []).children).toHaveLength(0)
  })
})

describe('setHouseHighlight', () => {
  const oneHouse = (slot) =>
    buildHouses(normalizeHouseModel(fakeHouse()), [
      { slot, name: 'x', x: 0, y: 0, z: 0, width: 10, depth: 8, height: 6 },
    ])

  const settle = (houses) => {
    for (let frame = 0; frame < 60; frame += 1) {
      advanceHouseHighlight(houses, HIGHLIGHT_FADE_SECONDS / 8)
    }
  }

  const uniformsOf = (material) => material.userData.highlight.uniforms

  it('glows the aimed building wherever its instance sits', () => {
    const houses = oneHouse(7)

    expect(setHouseHighlight(houses, 7)).toBe(true)
    settle(houses)
    for (const material of houses.userData.materials) {
      expect(uniformsOf(material).uHighlightFeature.value).toBe(7)
      expect(uniformsOf(material).uHighlightLevel.value).toBe(1)
    }
  })

  it('clears on null, so the glow does not stick to the last building', () => {
    const houses = oneHouse(2)

    setHouseHighlight(houses, 2)
    settle(houses)
    setHouseHighlight(houses, null)
    settle(houses)

    const [material] = houses.userData.materials
    expect(uniformsOf(material).uHighlightFeature.value).toBe(NO_HIGHLIGHT)
    expect(uniformsOf(material).uHighlightLevel.value).toBe(0)
  })

  it('ramps every part of the house together', () => {
    const houses = oneHouse(1)
    setHouseHighlight(houses, 1)
    advanceHouseHighlight(houses, HIGHLIGHT_FADE_SECONDS / 3)

    // Walls, door and roof share one ramp, or the house would light unevenly.
    const levels = houses.userData.materials.map(
      (material) => uniformsOf(material).uHighlightLevel.value,
    )
    expect(new Set(levels).size).toBe(1)
    expect(levels[0]).toBeGreaterThan(0)
    expect(levels[0]).toBeLessThan(1)
  })

  it('reports when there is nothing to glow', () => {
    expect(setHouseHighlight(new THREE.Group(), 1)).toBe(false)
    expect(setHouseHighlight(null, 1)).toBe(false)
    expect(advanceHouseHighlight(new THREE.Group(), 0.016)).toBe(false)
    expect(advanceHouseHighlight(null, 0.016)).toBe(false)
  })

  it('reports settled, so a still crosshair stops costing uniform writes', () => {
    const houses = oneHouse(5)
    setHouseHighlight(houses, 5)

    expect(advanceHouseHighlight(houses, 0.016)).toBe(true)
    settle(houses)
    expect(advanceHouseHighlight(houses, 0.016)).toBe(false)
  })
})

describe('houseMaterial', () => {
  it('patches the source material without touching the original', () => {
    const source = new THREE.MeshStandardMaterial()
    const material = houseMaterial(source)

    expect(material).not.toBe(source)
    expect(material.userData.highlight).toBeTruthy()
    expect(source.userData.highlight).toBeUndefined()
  })
})
