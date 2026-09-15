import * as THREE from 'three'
import roadColor from '../assets/PavingStones069_1K-JPG/PavingStones069_1K-JPG_Color.jpg'
import roadNormal from '../assets/PavingStones069_1K-JPG/PavingStones069_1K-JPG_NormalGL.jpg'
import roadRoughness from '../assets/PavingStones069_1K-JPG/PavingStones069_1K-JPG_Roughness.jpg'
import roadAo from '../assets/PavingStones069_1K-JPG/PavingStones069_1K-JPG_AmbientOcclusion.jpg'
import { configureGrassTexture } from './grassMaps'

// ambientCG PavingStones069. Same roles as the grass pack: Color for the look,
// NormalGL for three.js, Roughness + AO for contact shade.
export const ROAD_MAP_URLS = {
  map: roadColor,
  normalMap: roadNormal,
  roughnessMap: roadRoughness,
  aoMap: roadAo,
}

// Metres covered by the texture's long edge. The JPGs are 1024×512, so the
// short edge covers half that to keep stones square in world space.
export const ROAD_TILE_METERS = 4.5
export const ROAD_TILE_ASPECT = 2

const loader = new THREE.TextureLoader()
const cache = new Map()

export function loadRoadMaps({ anisotropy = 1 } = {}) {
  const key = `road:${anisotropy}`
  const hit = cache.get(key)
  if (hit) return hit

  // Reuse the grass configurator: wrap, anisotropy and colour space are identical.
  const maps = {
    map: configureGrassTexture(loader.load(ROAD_MAP_URLS.map), {
      srgb: true,
      anisotropy,
    }),
    normalMap: configureGrassTexture(loader.load(ROAD_MAP_URLS.normalMap), {
      anisotropy,
    }),
    roughnessMap: configureGrassTexture(
      loader.load(ROAD_MAP_URLS.roughnessMap),
      { anisotropy },
    ),
    aoMap: configureGrassTexture(loader.load(ROAD_MAP_URLS.aoMap), {
      anisotropy,
    }),
  }
  cache.set(key, maps)
  return maps
}

export function createRoadMaterial(sourceSide, { anisotropy = 1 } = {}) {
  const maps = loadRoadMaps({ anisotropy })
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    // Roads are seen at a grazing angle; a bit more normal punch helps joints.
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: maps.roughnessMap,
    roughness: 1,
    aoMap: maps.aoMap,
    aoMapIntensity: 0.95,
    metalness: 0,
    side: sourceSide,
    envMapIntensity: 0.35,
  })
}
