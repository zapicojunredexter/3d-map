import * as THREE from 'three'
import grassColor from '../assets/Grass001_1K-JPG/Grass001_1K-JPG_Color.jpg'
import grassNormal from '../assets/Grass001_1K-JPG/Grass001_1K-JPG_NormalGL.jpg'
import grassRoughness from '../assets/Grass001_1K-JPG/Grass001_1K-JPG_Roughness.jpg'
import grassAo from '../assets/Grass001_1K-JPG/Grass001_1K-JPG_AmbientOcclusion.jpg'

// ambientCG Grass001 pack. Color is the lawn; NormalGL matches three's
// OpenGL normals (NormalDX would flip lighting). Roughness and AO deepen
// the blades without needing the 3D clumps.
export const GRASS_MAP_URLS = {
  map: grassColor,
  normalMap: grassNormal,
  roughnessMap: grassRoughness,
  aoMap: grassAo,
}

// How many metres one 1K tile covers. Smaller = more detail, more repetition.
export const GRASS_TILE_METERS = 5.5

const loader = new THREE.TextureLoader()
const cache = new Map()

export function configureGrassTexture(texture, { srgb = false, anisotropy = 1 } = {}) {
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = anisotropy
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  texture.needsUpdate = true
  return texture
}

// Shared across ground and parks so the pack is decoded once.
export function loadGrassMaps({ anisotropy = 1 } = {}) {
  const key = `grass:${anisotropy}`
  const hit = cache.get(key)
  if (hit) return hit

  const maps = {
    map: configureGrassTexture(loader.load(GRASS_MAP_URLS.map), {
      srgb: true,
      anisotropy,
    }),
    normalMap: configureGrassTexture(loader.load(GRASS_MAP_URLS.normalMap), {
      anisotropy,
    }),
    roughnessMap: configureGrassTexture(
      loader.load(GRASS_MAP_URLS.roughnessMap),
      { anisotropy },
    ),
    aoMap: configureGrassTexture(loader.load(GRASS_MAP_URLS.aoMap), {
      anisotropy,
    }),
  }
  cache.set(key, maps)
  return maps
}

export function createGrassMaterial(sourceSide, { anisotropy = 1 } = {}) {
  const maps = loadGrassMaps({ anisotropy })
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: maps.roughnessMap,
    roughness: 1,
    aoMap: maps.aoMap,
    aoMapIntensity: 0.9,
    metalness: 0,
    side: sourceSide,
    envMapIntensity: 0.3,
  })
}
