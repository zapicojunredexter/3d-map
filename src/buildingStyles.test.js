import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  BUILDINGS_LAYER,
  BUILDING_STYLES,
  DEFAULT_BUILDING_STYLE,
  GROUND_LAYER,
  HOUSES_STYLE,
  ROAD_LAYER,
  advanceBuildingHighlight,
  applyBuildingStyle,
  findBuildingStyle,
  setBuildingHighlight,
} from './buildingStyles'
import { HIGHLIGHT_FADE_SECONDS, NO_HIGHLIGHT } from './featureHighlight'
import { FEATURE_ID, mergeWorldByLayer } from './mergeWorld'

// A city of four tagged blocks plus textured ground and road, matching what
// the merge and applySurfaces hand over.
function fakeCity(featureCount = 4) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff' })
  const root = new THREE.Group()

  for (let index = 0; index < featureCount; index += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), material)
    mesh.position.set(index * 10, 0, 0)
    mesh.name = `${BUILDINGS_LAYER}_${index}`
    root.add(mesh)
  }

  const merged = mergeWorldByLayer(root, { identify: [BUILDINGS_LAYER] })

  for (const layer of [GROUND_LAYER, ROAD_LAYER]) {
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ map: new THREE.Texture() }),
    )
    surface.name = layer
    merged.add(surface)
  }

  return merged
}

const layer = (group, name) =>
  group.children.find((child) => child.isMesh && child.name === name)

describe('findBuildingStyle', () => {
  it('falls back to the default look for an unknown id', () => {
    expect(findBuildingStyle('hologram').id).toBe('hologram')
    expect(findBuildingStyle('nonsense').id).toBe(DEFAULT_BUILDING_STYLE)
    expect(findBuildingStyle(undefined).id).toBe(DEFAULT_BUILDING_STYLE)
  })

  it('has a default that is one of the offered looks', () => {
    expect(BUILDING_STYLES.map((style) => style.id)).toContain(
      DEFAULT_BUILDING_STYLE,
    )
  })
})

describe('applyBuildingStyle', () => {
  it('keeps the export material for the survey look', () => {
    const city = fakeCity()
    const original = layer(city, BUILDINGS_LAYER).material

    applyBuildingStyle(city, 'plain')

    expect(layer(city, BUILDINGS_LAYER).material).toBe(original)
    expect(layer(city, BUILDINGS_LAYER).children).toHaveLength(0)
  })

  it('tints each block separately from the merge tags', () => {
    const city = fakeCity(4)
    applyBuildingStyle(city, 'clay')

    const buildings = layer(city, BUILDINGS_LAYER)
    const colors = buildings.geometry.getAttribute('color')
    const slots = buildings.geometry.getAttribute(FEATURE_ID)

    expect(colors).toBeTruthy()
    expect(buildings.material.vertexColors).toBe(true)

    // Every vertex of one block shares a colour, and blocks differ from each other.
    const perFeature = new Map()
    for (let vertex = 0; vertex < slots.count; vertex += 1) {
      const slot = slots.getX(vertex)
      const rgb = [
        colors.getX(vertex),
        colors.getY(vertex),
        colors.getZ(vertex),
      ].join()
      if (!perFeature.has(slot)) perFeature.set(slot, rgb)
      expect(perFeature.get(slot)).toBe(rgb)
    }

    expect(perFeature.size).toBe(4)
    expect(new Set(perFeature.values()).size).toBeGreaterThan(1)
  })

  it('never enables vertex colours without the attribute to back them', () => {
    const plain = new THREE.Group()
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    )
    mesh.name = BUILDINGS_LAYER
    plain.add(mesh)

    applyBuildingStyle(plain, 'clay')

    // Untagged geometry would otherwise multiply by nothing and render black.
    expect(mesh.geometry.getAttribute('color')).toBeUndefined()
    expect(mesh.material.vertexColors).toBe(false)
  })

  it('adds glowing edges for the hologram and drops them again', () => {
    const city = fakeCity()
    applyBuildingStyle(city, 'hologram')

    const buildings = layer(city, BUILDINGS_LAYER)
    const [edges] = buildings.children
    expect(edges.isLineSegments).toBe(true)
    // Real creases only: a cube has 12, not one per triangle.
    expect(edges.geometry.getAttribute('position').count).toBe(4 * 12 * 2)
    expect(buildings.castShadow).toBe(false)

    applyBuildingStyle(city, 'plain')
    expect(layer(city, BUILDINGS_LAYER).children).toHaveLength(0)
    expect(layer(city, BUILDINGS_LAYER).castShadow).toBe(true)
  })

  it('tints the ground and restores it when the style moves on', () => {
    const city = fakeCity()

    applyBuildingStyle(city, 'clay')
    expect(layer(city, GROUND_LAYER).material.color.getHexString()).not.toBe(
      'ffffff',
    )

    applyBuildingStyle(city, 'plain')
    expect(layer(city, GROUND_LAYER).material.color.getHexString()).toBe(
      'ffffff',
    )
    expect(layer(city, ROAD_LAYER).material.color.getHexString()).toBe('ffffff')
  })

  it('survives switching through every style repeatedly', () => {
    const city = fakeCity()
    const ids = BUILDING_STYLES.map((style) => style.id)

    for (let pass = 0; pass < 3; pass += 1) {
      for (const id of [...ids, ...ids.toReversed()]) {
        expect(() => applyBuildingStyle(city, id)).not.toThrow()
      }
    }

    const buildings = layer(city, BUILDINGS_LAYER)
    expect(buildings.material).toBeTruthy()
    // One edge child at most, never an accumulation.
    expect(buildings.children.length).toBeLessThanOrEqual(1)
  })

  it('reuses one edge geometry instead of rebuilding it per switch', () => {
    const city = fakeCity()
    applyBuildingStyle(city, 'hologram')
    const first = layer(city, BUILDINGS_LAYER).userData.edgeGeometry

    applyBuildingStyle(city, 'plain')
    applyBuildingStyle(city, 'hologram')

    expect(layer(city, BUILDINGS_LAYER).userData.edgeGeometry).toBe(first)
  })

  it('does nothing when the city has no buildings layer', () => {
    const empty = new THREE.Group()
    expect(() => applyBuildingStyle(empty, 'clay')).not.toThrow()
  })

  it('hides the blocks for the houses look but keeps them in the scene', () => {
    const city = fakeCity()
    applyBuildingStyle(city, HOUSES_STYLE)
    const buildings = layer(city, BUILDINGS_LAYER)

    // Still a child, and still raycastable: collision and the crosshair's name
    // both come off this mesh while the instanced houses do the drawing.
    expect(buildings).toBeTruthy()
    expect(buildings.visible).toBe(false)
  })

  it('brings the blocks back when another look is chosen', () => {
    const city = fakeCity()
    applyBuildingStyle(city, HOUSES_STYLE)
    applyBuildingStyle(city, 'clay')

    expect(layer(city, BUILDINGS_LAYER).visible).toBe(true)
  })

  it('leaves the blocks visible in every material-only look', () => {
    const city = fakeCity()

    for (const style of BUILDING_STYLES.filter((each) => !each.hidden)) {
      applyBuildingStyle(city, style.id)
      expect(layer(city, BUILDINGS_LAYER).visible).toBe(true)
    }
  })
})

describe('setBuildingHighlight', () => {
  // The glow ramps, so the uniform only catches up once frames have run.
  const settle = (city) => {
    for (let frame = 0; frame < 60; frame += 1) {
      advanceBuildingHighlight(city, HIGHLIGHT_FADE_SECONDS / 8)
    }
  }

  const uniforms = (city) =>
    layer(city, BUILDINGS_LAYER).material.userData.highlight.uniforms

  it('lets every look glow, in its own colour', () => {
    const city = fakeCity()

    for (const style of BUILDING_STYLES) {
      applyBuildingStyle(city, style.id)
      expect(setBuildingHighlight(city, 2)).toBe(true)
      settle(city)

      expect(uniforms(city).uHighlightFeature.value).toBe(2)
      expect(uniforms(city).uHighlightLevel.value).toBe(1)
      expect(uniforms(city).uHighlightColor.value.getHex()).toBe(
        new THREE.Color(style.highlight.color).getHex(),
      )
    }
  })

  it('still glows after a style switch replaces the material', () => {
    const city = fakeCity()
    applyBuildingStyle(city, 'plain')
    setBuildingHighlight(city, 1)
    settle(city)

    // The new material starts dark, which is why App re-pushes the pick.
    applyBuildingStyle(city, 'clay')
    expect(uniforms(city).uHighlightFeature.value).toBe(NO_HIGHLIGHT)
    expect(uniforms(city).uHighlightLevel.value).toBe(0)

    expect(setBuildingHighlight(city, 1)).toBe(true)
    settle(city)
    expect(uniforms(city).uHighlightFeature.value).toBe(1)
    expect(uniforms(city).uHighlightLevel.value).toBe(1)
  })

  it('fades in rather than appearing at full glow', () => {
    const city = fakeCity()
    applyBuildingStyle(city, 'clay')
    setBuildingHighlight(city, 3)

    expect(uniforms(city).uHighlightLevel.value).toBe(0)
    advanceBuildingHighlight(city, HIGHLIGHT_FADE_SECONDS / 4)
    const part = uniforms(city).uHighlightLevel.value
    expect(part).toBeGreaterThan(0)
    expect(part).toBeLessThan(1)
  })

  it('does nothing when the city has no buildings layer', () => {
    expect(setBuildingHighlight(new THREE.Group(), 1)).toBe(false)
    expect(setBuildingHighlight(null, 1)).toBe(false)
    expect(advanceBuildingHighlight(new THREE.Group(), 0.016)).toBe(false)
  })
})
