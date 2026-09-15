import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  FEATURE_ID,
  collidableMeshes,
  featureAt,
  isCollidableLayer,
  layerFromName,
  layerOf,
  mergeWorldByLayer,
  pickFeature,
  stripToSegments,
} from './mergeWorld'

function boxAt(x, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
  mesh.position.set(x, 0, z)
  return mesh
}

describe('layerFromName', () => {
  it('strips the per-feature suffix TopoExport appends', () => {
    expect(layerFromName('TPX_Buildings_0')).toBe('TPX_Buildings')
    expect(layerFromName('TPX_Waterways_3_1')).toBe('TPX_Waterways')
    expect(layerFromName('TPX_Trees_tree_17')).toBe('TPX_Trees')
  })

  it('strips the suffix GLTFLoader adds to reused meshes', () => {
    expect(layerFromName('TPX_Trees_crown_26_instance_11')).toBe('TPX_Trees')
    expect(layerFromName('TPX_Trees_trunk_0_instance_0')).toBe('TPX_Trees')
  })

  it('keeps layer names that carry no suffix', () => {
    expect(layerFromName('TPX_Ground')).toBe('TPX_Ground')
    expect(layerFromName('TPX_RoadsOutlines')).toBe('TPX_RoadsOutlines')
  })

  it('ignores names from outside the export', () => {
    expect(layerFromName('Scene')).toBe('')
    expect(layerFromName(undefined)).toBe('')
  })
})

describe('layerOf', () => {
  it('falls back to the nearest named ancestor', () => {
    const parent = new THREE.Group()
    parent.name = 'TPX_Roads_4'
    const mesh = new THREE.Mesh(new THREE.BoxGeometry())
    parent.add(mesh)

    expect(layerOf(mesh)).toBe('TPX_Roads')
  })
})

describe('mergeWorldByLayer', () => {
  it('collapses a layer into one mesh per material', () => {
    const white = new THREE.MeshStandardMaterial()
    const grey = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()

    for (let index = 0; index < 5; index += 1) {
      const mesh = boxAt(index * 10, 0, white)
      mesh.name = `TPX_Buildings_${index}`
      root.add(mesh)
    }
    const road = boxAt(0, 40, grey)
    road.name = 'TPX_Roads_0'
    root.add(road)

    const merged = mergeWorldByLayer(root)

    expect(merged.children).toHaveLength(2)
    expect(merged.children.map((mesh) => mesh.name).sort()).toEqual([
      'TPX_Buildings',
      'TPX_Roads',
    ])
  })

  it('bakes each feature transform so the city keeps its footprint', () => {
    const material = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    const near = boxAt(0, 0, material)
    near.name = 'TPX_Buildings_0'
    const far = boxAt(100, 50, material)
    far.name = 'TPX_Buildings_1'
    root.add(near, far)

    const merged = mergeWorldByLayer(root)
    const bounds = new THREE.Box3().setFromObject(merged)

    expect(bounds.min.x).toBeCloseTo(-0.5)
    expect(bounds.max.x).toBeCloseTo(100.5)
    expect(bounds.max.z).toBeCloseTo(50.5)
  })

  it('keeps the merged geometry raycastable', () => {
    const material = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    const mesh = boxAt(30, 0, material)
    mesh.name = 'TPX_Ground_0'
    root.add(mesh)

    const merged = mergeWorldByLayer(root)
    merged.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(30, 10, 0),
      new THREE.Vector3(0, -1, 0),
    )

    const [hit] = raycaster.intersectObject(merged, true)
    expect(hit?.point.y).toBeCloseTo(0.5)
  })

  it('names the feature a ray hits, even after merging', () => {
    const material = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    for (let index = 0; index < 4; index += 1) {
      const mesh = boxAt(index * 10, 0, material)
      mesh.name = `TPX_Buildings_${index}`
      root.add(mesh)
    }

    const merged = mergeWorldByLayer(root, { identify: ['TPX_Buildings'] })
    merged.updateMatrixWorld(true)
    const buildings = merged.children[0]

    expect(buildings.userData.featureNames).toHaveLength(4)
    expect(buildings.geometry.getAttribute(FEATURE_ID)).toBeTruthy()

    // Each block answers with its own name, from one merged mesh.
    for (const [index, x] of [0, 10, 20, 30].entries()) {
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(x, 10, 0),
        new THREE.Vector3(0, -1, 0),
      )
      const [hit] = raycaster.intersectObject(buildings, false)
      expect(featureAt(hit)).toBe(`TPX_Buildings_${index}`)
      // The slot is what the highlight shader compares against.
      expect(pickFeature(hit)).toEqual({
        slot: index,
        name: `TPX_Buildings_${index}`,
      })
    }
  })

  it('leaves features unnamed unless the layer asked to be identified', () => {
    const material = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    const mesh = boxAt(0, 0, material)
    mesh.name = 'TPX_Buildings_0'
    root.add(mesh)

    const merged = mergeWorldByLayer(root)
    merged.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(0, -1, 0),
    )

    const [hit] = raycaster.intersectObject(merged.children[0], false)
    expect(hit).toBeTruthy()
    expect(featureAt(hit)).toBeNull()
    expect(merged.children[0].geometry.getAttribute(FEATURE_ID)).toBeUndefined()
  })

  it('leaves out layers something else draws', () => {
    const material = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    const building = boxAt(0, 0, material)
    building.name = 'TPX_Buildings_0'
    const crown = boxAt(10, 0, material)
    crown.name = 'TPX_Trees_crown_0_instance_3'
    const trunk = boxAt(10, 0, material)
    trunk.name = 'TPX_Trees_trunk_0'
    root.add(building, crown, trunk)

    const merged = mergeWorldByLayer(root, { skip: ['TPX_Trees'] })

    expect(merged.children.map((mesh) => mesh.name)).toEqual(['TPX_Buildings'])
  })
})

describe('line layers', () => {
  it('expands a strip into discrete segments', () => {
    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 2, 0, 0], 3),
    )

    const segments = stripToSegments(geometry)

    // Three strip points describe two segments, so four endpoints.
    expect(segments.getAttribute('position').count).toBe(4)
    expect([...segments.getAttribute('position').array]).toEqual([
      0, 0, 0, 1, 0, 0, 1, 0, 0, 2, 0, 0,
    ])
  })

  it('merges road centrelines into one LineSegments and never collides', () => {
    const material = new THREE.LineBasicMaterial()
    const root = new THREE.Group()

    for (let index = 0; index < 3; index += 1) {
      const geometry = new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute([0, 0, index, 5, 0, index], 3),
      )
      const line = new THREE.Line(geometry, material)
      line.name = `TPX_Roads_${index}`
      root.add(line)
    }

    const merged = mergeWorldByLayer(root)

    expect(merged.children).toHaveLength(1)
    expect(merged.children[0].isLineSegments).toBe(true)
    expect(merged.children[0].name).toBe('TPX_Roads')
    expect(merged.children[0].castShadow).toBe(false)
    expect(collidableMeshes(merged)).toEqual([])
  })
})

describe('collidableMeshes', () => {
  it('returns walkable layers and skips decoration', () => {
    const material = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    for (const name of ['TPX_Ground_0', 'TPX_Buildings_0', 'TPX_Trees_tree_0']) {
      const mesh = boxAt(0, 0, material)
      mesh.name = name
      root.add(mesh)
    }

    const merged = mergeWorldByLayer(root)

    expect(collidableMeshes(merged).map((mesh) => mesh.name).sort()).toEqual([
      'TPX_Buildings',
      'TPX_Ground',
    ])
    expect(isCollidableLayer('TPX_Trees')).toBe(false)
  })
})
