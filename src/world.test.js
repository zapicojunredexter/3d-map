import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { calculateModelPlacement, isRoadSurface } from './world'

function buildWorld(model, placement) {
  const oriented = new THREE.Group()
  oriented.rotation.fromArray(placement.rotation)
  oriented.add(model)

  const offset = new THREE.Group()
  offset.position.copy(placement.position)
  offset.add(oriented)

  const world = new THREE.Group()
  world.add(offset)
  return world
}

describe('calculateModelPlacement', () => {
  it('turns a Z-up export into a Y-up world standing on zero', () => {
    // 200 x 100 footprint with 20 of height along Z, as TopoExport exports it.
    const model = new THREE.Mesh(
      new THREE.BoxGeometry(200, 100, 20),
      new THREE.MeshBasicMaterial(),
    )
    model.position.set(40, -20, 15)

    const placement = calculateModelPlacement(model)
    const bounds = new THREE.Box3().setFromObject(
      buildWorld(model, placement),
    )
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())

    expect(size.y).toBeCloseTo(20)
    expect(size.x).toBeCloseTo(200)
    expect(size.z).toBeCloseTo(100)
    expect(bounds.min.y).toBeCloseTo(0)
    expect(center.x).toBeCloseTo(0)
    expect(center.z).toBeCloseTo(0)
  })

  it('leaves an already Y-up export unrotated', () => {
    const model = new THREE.Mesh(
      new THREE.BoxGeometry(200, 20, 100),
      new THREE.MeshBasicMaterial(),
    )
    model.position.set(40, 15, -20)

    const placement = calculateModelPlacement(model, 'y')
    const bounds = new THREE.Box3().setFromObject(
      buildWorld(model, placement),
    )
    const size = bounds.getSize(new THREE.Vector3())

    expect(placement.rotation).toEqual([0, 0, 0])
    expect(size.y).toBeCloseTo(20)
    expect(bounds.min.y).toBeCloseTo(0)
  })
})

describe('isRoadSurface', () => {
  const meshUnder = (groupName) => {
    const group = new THREE.Group()
    group.name = groupName
    const mesh = new THREE.Mesh()
    mesh.name = `${groupName}_7`
    group.add(mesh)
    return mesh
  }

  it('recognises the road surface layer the player can stand on', () => {
    expect(isRoadSurface(meshUnder('TPX_RoadsOutlines'))).toBe(true)
    expect(isRoadSurface(meshUnder('TPX_Roads'))).toBe(true)
  })

  it('ignores ground and water', () => {
    expect(isRoadSurface(meshUnder('TPX_Ground'))).toBe(false)
    expect(isRoadSurface(meshUnder('TPX_Waterways_3'))).toBe(false)
  })
})
