import * as THREE from 'three'
import dayHdri from '../assets/DayEnvironmentHDRI107_1K/DayEnvironmentHDRI107_1K_TONEMAPPED.jpg?url'

// ambientCG DayEnvironmentHDRI107. Tonemapped JPG loads like any equirect map;
// drei's <Environment> turns it into the scene PMREM every reflective material
// (water especially) samples.
export const DAY_HDRI_URL = dayHdri

export const WATER_LAYER = 'TPX_Waterways'

// Soft planar scale so any future ripple map would not scream tiling on creeks.
export const WATER_TILE_METERS = 14

export function createWaterMaterial(sourceSide) {
  // Physical clearcoat reads wet without needing a water texture pack. The
  // HDRI environment supplies the sky reflection that sells the surface.
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#1f6f8f'),
    roughness: 0.12,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    reflectivity: 0.85,
    envMapIntensity: 1.75,
    side: sourceSide,
  })
}
