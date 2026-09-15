import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  GRASS_MAP_URLS,
  GRASS_TILE_METERS,
  configureGrassTexture,
  createGrassMaterial,
} from './grassMaps'

describe('grassMaps', () => {
  it('points at the color, OpenGL normal, roughness and AO maps', () => {
    expect(GRASS_MAP_URLS.map).toMatch(/Color\.jpg/)
    expect(GRASS_MAP_URLS.normalMap).toMatch(/NormalGL\.jpg/)
    expect(GRASS_MAP_URLS.roughnessMap).toMatch(/Roughness\.jpg/)
    expect(GRASS_MAP_URLS.aoMap).toMatch(/AmbientOcclusion\.jpg/)
  })

  it('tiles the lawn at a walking-scale repeat', () => {
    expect(GRASS_TILE_METERS).toBeGreaterThan(2)
    expect(GRASS_TILE_METERS).toBeLessThan(12)
  })

  it('marks only the color map as sRGB', () => {
    const color = configureGrassTexture(new THREE.Texture(), { srgb: true })
    const linear = configureGrassTexture(new THREE.Texture(), { srgb: false })

    expect(color.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(linear.colorSpace).toBe(THREE.NoColorSpace)
    expect(color.wrapS).toBe(THREE.RepeatWrapping)
  })

  it('builds a standard material with the pack hooked up', () => {
    const material = createGrassMaterial(THREE.DoubleSide, { anisotropy: 4 })

    expect(material.map).toBeTruthy()
    expect(material.normalMap).toBeTruthy()
    expect(material.roughnessMap).toBeTruthy()
    expect(material.aoMap).toBeTruthy()
    expect(material.side).toBe(THREE.DoubleSide)
    expect(material.metalness).toBe(0)
  })
})
