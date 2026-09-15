import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  ROAD_MAP_URLS,
  ROAD_TILE_ASPECT,
  ROAD_TILE_METERS,
  createRoadMaterial,
} from './roadMaps'

describe('roadMaps', () => {
  it('points at the color, OpenGL normal, roughness and AO maps', () => {
    expect(ROAD_MAP_URLS.map).toMatch(/Color\.jpg/)
    expect(ROAD_MAP_URLS.normalMap).toMatch(/NormalGL\.jpg/)
    expect(ROAD_MAP_URLS.roughnessMap).toMatch(/Roughness\.jpg/)
    expect(ROAD_MAP_URLS.aoMap).toMatch(/AmbientOcclusion\.jpg/)
  })

  it('accounts for the pack being twice as wide as it is tall', () => {
    expect(ROAD_TILE_ASPECT).toBe(2)
    expect(ROAD_TILE_METERS).toBeGreaterThan(2)
    expect(ROAD_TILE_METERS).toBeLessThan(12)
  })

  it('builds a standard material with the pack hooked up', () => {
    const material = createRoadMaterial(THREE.DoubleSide, { anisotropy: 4 })

    expect(material.map).toBeTruthy()
    expect(material.normalMap).toBeTruthy()
    expect(material.roughnessMap).toBeTruthy()
    expect(material.aoMap).toBeTruthy()
    expect(material.side).toBe(THREE.DoubleSide)
    expect(material.metalness).toBe(0)
  })
})
