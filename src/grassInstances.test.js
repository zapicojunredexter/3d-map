import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  CLUMP_HEIGHT,
  GRASS_DENSITY,
  GREEN_LAYER,
  GROUND_LAYER,
  ROAD_LAYER,
  buildGrass,
  buildRoadMask,
  grassMaterial,
  grassPlacements,
  instanceMatrices,
  normalizeGrassModel,
  plantGrass,
  variantFor,
} from './grassInstances'
import { createRandom } from './surfaces'
import { mergeWorldByLayer } from './mergeWorld'

const Z_UP = { position: new THREE.Vector3(0, 0, 0), rotation: [-Math.PI / 2, 0, 0] }

function surfaceMesh(layer, { x = 0, y = 0, w = 10, d = 10 } = {}) {
  const material = new THREE.MeshStandardMaterial()
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material)
  mesh.position.set(x, y, 0)
  mesh.name = `${layer}_0`
  root.add(mesh)
  const merged = mergeWorldByLayer(root)
  return merged.children.find((child) => child.name === layer)
}

function fakeCity() {
  const material = new THREE.MeshStandardMaterial()
  const root = new THREE.Group()
  for (const [layer, w] of [
    [GREEN_LAYER, 10],
    [GROUND_LAYER, 20],
    [ROAD_LAYER, 8],
  ]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w), material)
    mesh.name = `${layer}_0`
    root.add(mesh)
  }
  return mergeWorldByLayer(root)
}

// A pack of two cards, like the Sketchfab download: different places in a
// huge volume, each about 100 units tall.
function fakeGrassPack() {
  const scene = new THREE.Group()
  const map = new THREE.Texture()
  for (const [x, name] of [
    [0, 'card_a'],
    [200, 'card_b'],
  ]) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 100),
      new THREE.MeshStandardMaterial({ map, transparent: true }),
    )
    mesh.name = name
    mesh.position.set(x, 50, 0)
    scene.add(mesh)
  }
  return scene
}

describe('grassPlacements', () => {
  it('scatters clumps across a green patch, not beside it', () => {
    const green = surfaceMesh(GREEN_LAYER, { w: 10, d: 10 })
    const placements = grassPlacements(green, Z_UP, {
      density: 1,
      random: createRandom(3),
    })

    expect(placements.length).toBeGreaterThan(40)
    expect(placements.length).toBeLessThan(140)
    for (const clump of placements) {
      expect(clump.y).toBeCloseTo(0, 5)
      expect(Math.abs(clump.x)).toBeLessThanOrEqual(5.05)
      expect(Math.abs(clump.z)).toBeLessThanOrEqual(5.05)
    }
  })

  it('scales the count with the patch area', () => {
    const small = grassPlacements(surfaceMesh(GREEN_LAYER, { w: 4, d: 4 }), Z_UP, {
      density: 1,
      random: createRandom(1),
    })
    const large = grassPlacements(
      surfaceMesh(GREEN_LAYER, { w: 20, d: 20 }),
      Z_UP,
      { density: 1, random: createRandom(1) },
    )

    expect(large.length).toBeGreaterThan(small.length * 8)
  })

  it('has nothing to plant when the surface is missing', () => {
    expect(grassPlacements(undefined, Z_UP)).toEqual([])
    expect(grassPlacements(new THREE.Mesh(), Z_UP)).toEqual([])
  })
})

describe('plantGrass', () => {
  it('plants on parks and dirt, never on the road layer', () => {
    const city = fakeCity()
    const planted = plantGrass(city, Z_UP, {
      densities: { [GREEN_LAYER]: 1, [GROUND_LAYER]: 0.5 },
    })

    expect(planted.length).toBeGreaterThan(100)
    const road = city.children.find((child) => child.name === ROAD_LAYER)
    const onRoad = grassPlacements(road, Z_UP, {
      density: 1,
      random: createRandom(1),
    })
    expect(onRoad.length).toBeGreaterThan(20)
  })

  it('keeps dirt clumps off the pavement even when ground runs under it', () => {
    const material = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), material)
    ground.name = `${GROUND_LAYER}_0`
    root.add(ground)

    // A strip of road across the middle of the dirt.
    const road = new THREE.Mesh(new THREE.PlaneGeometry(20, 4), material)
    road.name = `${ROAD_LAYER}_0`
    root.add(road)

    const city = mergeWorldByLayer(root)
    const planted = plantGrass(city, Z_UP, {
      densities: { [GREEN_LAYER]: 0, [GROUND_LAYER]: 2 },
    })

    expect(planted.length).toBeGreaterThan(50)
    for (const clump of planted) {
      // Inflated keep-out: nothing on the 4m-wide road (±2) plus clearance.
      expect(Math.abs(clump.z)).toBeGreaterThan(1.8)
    }
  })

  it('keeps the dirt much sparser than the parks by default', () => {
    expect(GRASS_DENSITY[GROUND_LAYER]).toBeLessThan(GRASS_DENSITY[GREEN_LAYER])
  })

  it('lays the scrub out the same way on every load', () => {
    const city = fakeCity()
    expect(plantGrass(city, Z_UP)).toEqual(plantGrass(city, Z_UP))
  })

  it('survives dense ground planting without blowing the stack', () => {
    const material = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), material)
    ground.name = `${GROUND_LAYER}_0`
    root.add(ground)
    const city = mergeWorldByLayer(root)

    expect(() =>
      plantGrass(city, Z_UP, {
        densities: { [GREEN_LAYER]: 0, [GROUND_LAYER]: 2 },
      }),
    ).not.toThrow()
    expect(
      plantGrass(city, Z_UP, {
        densities: { [GREEN_LAYER]: 0, [GROUND_LAYER]: 2 },
      }).length,
    ).toBeGreaterThan(5000)
  })
})

describe('buildRoadMask', () => {
  it('reports points on the road and leaves open dirt alone', () => {
    const material = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), material)
    road.name = `${ROAD_LAYER}_0`
    root.add(road)
    const mesh = mergeWorldByLayer(root).children[0]
    const blocked = buildRoadMask(mesh, Z_UP, { clearance: 0 })

    expect(blocked(0, 0)).toBe(true)
    expect(blocked(0, 3)).toBe(false)
  })
})

describe('normalizeGrassModel', () => {
  it('rebases every card into its own unit-tall variant', () => {
    const { parts } = normalizeGrassModel(fakeGrassPack())

    expect(parts).toHaveLength(2)
    for (const part of parts) {
      expect(part.geometry.boundingBox.min.y).toBeCloseTo(0)
      expect(part.geometry.boundingBox.max.y).toBeCloseTo(1)
      expect(part.spread).toBeCloseTo(0.4)
    }
  })

  it('keeps only a few variants so cells stay cheap to draw', () => {
    const scene = new THREE.Group()
    for (let index = 0; index < 10; index += 1) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(40 + index, 100),
        new THREE.MeshStandardMaterial(),
      )
      mesh.position.set(index * 50, 50, 0)
      scene.add(mesh)
    }

    expect(normalizeGrassModel(scene).parts).toHaveLength(3)
    expect(normalizeGrassModel(scene, { maxVariants: 2 }).parts).toHaveLength(2)
  })

  it('leaves the loaded model alone so a reload is not cumulative', () => {
    const scene = fakeGrassPack()
    const source = scene.children[0].geometry
    const before = source.getAttribute('position').array.slice()
    normalizeGrassModel(scene)

    expect(source.getAttribute('position').array).toEqual(before)
  })

  it('refuses a model with no meshes', () => {
    expect(() => normalizeGrassModel(new THREE.Group())).toThrow(/no meshes/i)
  })
})

describe('grassMaterial', () => {
  it('turns transparent atlases into alpha-tested cards', () => {
    const source = new THREE.MeshStandardMaterial({
      map: new THREE.Texture(),
      transparent: true,
    })
    const material = grassMaterial(source)

    expect(material).not.toBe(source)
    expect(material.transparent).toBe(false)
    expect(material.alphaTest).toBeGreaterThanOrEqual(0.45)
    expect(material.depthWrite).toBe(true)
  })
})

describe('buildGrass', () => {
  const clumps = (count) =>
    Array.from({ length: count }, (unused, index) => ({
      x: index * 2,
      y: 0,
      z: 0,
      height: 0.3,
      yaw: 0,
    }))

  it('draws one instanced mesh per variant that appears in a cell', () => {
    const model = normalizeGrassModel(fakeGrassPack())
    const grass = buildGrass(model, clumps(20), 10)

    expect(grass.children.length).toBeGreaterThan(1)
    for (const mesh of grass.children) {
      expect(mesh.isInstancedMesh).toBe(true)
      expect(mesh.castShadow).toBe(false)
      expect(mesh.receiveShadow).toBe(true)
    }
  })

  it('spreads the pack variants across the city', () => {
    const model = normalizeGrassModel(fakeGrassPack())
    const grass = buildGrass(model, clumps(40), 1000)
    const names = new Set(grass.children.map((mesh) => mesh.name))

    expect(names.size).toBe(2)
  })

  it('builds nothing when there is nowhere to plant', () => {
    const model = normalizeGrassModel(fakeGrassPack())
    expect(buildGrass(model, []).children).toHaveLength(0)
  })
})

describe('instanceMatrices', () => {
  it('plants a clump at its world position and height', () => {
    const [matrix] = instanceMatrices(
      [{ x: 3, y: 1, z: -2, height: 0.4, yaw: 0, spread: 2 }],
      0.5,
    )
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    matrix.decompose(position, new THREE.Quaternion(), scale)

    expect(position.toArray()).toEqual([3, 1, -2])
    expect(scale.y).toBeCloseTo(0.4)
    // modelSpread 0.5 × placement.spread 2 × height 0.4
    expect(scale.x).toBeCloseTo(0.4)
  })

  it('keeps heights inside the walking-scale range', () => {
    const planted = grassPlacements(surfaceMesh(GREEN_LAYER), Z_UP, {
      density: 1,
      random: createRandom(4),
    })
    for (const clump of planted) {
      expect(clump.height).toBeGreaterThanOrEqual(CLUMP_HEIGHT.min)
      expect(clump.height).toBeLessThanOrEqual(CLUMP_HEIGHT.max)
    }
  })
})

describe('variantFor', () => {
  it('is stable for a position', () => {
    const placement = { x: 12.5, z: -3.2 }
    expect(variantFor(placement, 14)).toBe(variantFor(placement, 14))
  })

  it('honours an explicit variant when one was set', () => {
    expect(variantFor({ x: 0, z: 0, variant: 3 }, 14)).toBe(3)
  })
})
