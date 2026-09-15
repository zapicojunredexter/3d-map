import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  ANIMAL_CATALOG,
  ANIMAL_COUNTS,
  expandAnimalKinds,
  animalIdsForKind,
} from './animalCatalog'
import {
  animalPlacements,
  buildAnimals,
  instanceMatrices,
  normalizeAnimalModel,
} from './animalInstances'
import {
  GREEN_LAYER,
  GROUND_LAYER,
  ROAD_LAYER,
} from './grassInstances'

const Z_UP = {
  position: new THREE.Vector3(0, 0, 0),
  rotation: [-Math.PI / 2, 0, 0],
}

function surfaceMesh(name, { w = 40, d = 40, y = 0 } = {}) {
  // Z-up export: ground lives in XY before the city rotation.
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d))
  mesh.name = name
  mesh.position.z = y
  return mesh
}

function fakeCity() {
  const group = new THREE.Group()
  group.add(surfaceMesh(GROUND_LAYER, { w: 80, d: 80 }))
  group.add(surfaceMesh(GREEN_LAYER, { w: 20, d: 20 }))
  // A road strip through the middle so the mask has something to reject.
  const road = new THREE.Mesh(new THREE.PlaneGeometry(8, 80))
  road.name = ROAD_LAYER
  group.add(road)
  return group
}

function fakeAnimal(size = [1, 1, 2]) {
  const scene = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(...size))
  body.position.set(0.2, size[1] / 2 - 0.1, 0)
  scene.add(body)
  return scene
}

describe('expandAnimalKinds', () => {
  it('builds one entry per animal from the count table', () => {
    const kinds = expandAnimalKinds({ sheep: 3, cow: 2, deer: 1 })
    expect(kinds.filter((k) => k === 'sheep')).toHaveLength(3)
    expect(kinds.filter((k) => k === 'cow')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'deer')).toHaveLength(1)
  })

  it('matches the default herd totals', () => {
    expect(expandAnimalKinds(ANIMAL_COUNTS)).toHaveLength(
      ANIMAL_COUNTS.sheep + ANIMAL_COUNTS.cow + ANIMAL_COUNTS.deer,
    )
  })
})

describe('animalCatalog', () => {
  it('lists three variants per kind', () => {
    expect(animalIdsForKind('sheep')).toHaveLength(3)
    expect(animalIdsForKind('cow')).toHaveLength(3)
    expect(animalIdsForKind('deer')).toHaveLength(3)
    expect(ANIMAL_CATALOG.every((entry) => entry.url)).toBe(true)
  })
})

describe('animalPlacements', () => {
  it('plants the requested herd on soft ground', () => {
    const planted = animalPlacements(fakeCity(), Z_UP, {
      counts: { sheep: 6, cow: 2, deer: 2 },
    })
    expect(planted).toHaveLength(10)
    expect(planted.filter((p) => p.kind === 'sheep')).toHaveLength(6)
    expect(planted.filter((p) => p.kind === 'cow')).toHaveLength(2)
    expect(planted.filter((p) => p.kind === 'deer')).toHaveLength(2)
    expect(planted.every((p) => p.modelId && Number.isFinite(p.yaw))).toBe(true)
  })

  it('is deterministic for the same seed', () => {
    const a = animalPlacements(fakeCity(), Z_UP, {
      counts: { sheep: 4, cow: 1, deer: 1 },
      seed: 99,
    })
    const b = animalPlacements(fakeCity(), Z_UP, {
      counts: { sheep: 4, cow: 1, deer: 1 },
      seed: 99,
    })
    expect(a).toEqual(b)
  })

  it('skips the road strip', () => {
    const planted = animalPlacements(fakeCity(), Z_UP, {
      counts: { sheep: 30, cow: 0, deer: 0 },
    })
    expect(planted.every((p) => Math.abs(p.x) > 3.5)).toBe(true)
  })
})

describe('normalizeAnimalModel', () => {
  it('stands the mesh on y=0 and centres XZ', () => {
    const model = normalizeAnimalModel(fakeAnimal([2, 1.5, 3]), {
      id: 'sheep-ver1',
      kind: 'sheep',
    })
    expect(model.id).toBe('sheep-ver1')
    expect(model.kind).toBe('sheep')
    const box = model.parts[0].geometry.boundingBox
    expect(box.min.y).toBeCloseTo(0, 5)
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 5)
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 5)
    expect(model.height).toBeCloseTo(1.5, 5)
  })
})

describe('buildAnimals', () => {
  it('instances each chosen variant', () => {
    const models = [
      normalizeAnimalModel(fakeAnimal(), { id: 'sheep-ver1', kind: 'sheep' }),
      normalizeAnimalModel(fakeAnimal([2, 1.4, 1]), {
        id: 'bull-ver1',
        kind: 'cow',
      }),
    ]
    const placements = [
      { x: 0, y: 0, z: 0, modelId: 'sheep-ver1', yaw: 0, scale: 1 },
      { x: 5, y: 0, z: 5, modelId: 'sheep-ver1', yaw: 1, scale: 1.1 },
      { x: 10, y: 0, z: 0, modelId: 'bull-ver1', yaw: 2, scale: 1 },
    ]
    const group = buildAnimals(models, placements, { cellSize: 1000 })
    expect(group.name).toBe('TPX_Animals')
    const meshes = group.children.filter((c) => c.isInstancedMesh)
    expect(meshes).toHaveLength(2)
    expect(meshes.map((m) => m.count).sort()).toEqual([1, 2])
  })

  it('builds a matrix per placement', () => {
    const [matrix] = instanceMatrices([
      { x: 3, y: 1, z: -2, yaw: 0, scale: 2 },
    ])
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    matrix.decompose(position, new THREE.Quaternion(), scale)
    expect(position.toArray()).toEqual([3, 1, -2])
    expect(scale.toArray()).toEqual([2, 2, 2])
  })
})
