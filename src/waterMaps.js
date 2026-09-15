import * as THREE from 'three'
import dayHdri from '../assets/DayEnvironmentHDRI107_1K/DayEnvironmentHDRI107_1K_TONEMAPPED.jpg?url'

// ambientCG DayEnvironmentHDRI107. Tonemapped JPG loads like any equirect map;
// drei's <Environment> turns it into the scene PMREM every reflective material
// (water especially) samples.
export const DAY_HDRI_URL = dayHdri

export const WATER_LAYER = 'TPX_Waterways'

// Soft planar scale so the flow map does not scream tiling on creeks.
export const WATER_TILE_METERS = 14

// Metres of texture drift per second along the ribbon. Slow enough to read as
// current rather than a conveyor belt.
export const WATER_FLOW_SPEED = 0.07

const FLOW_SIZE = 256

// Soft streak noise: scrolling it along V sells current without a video texture.
export function createWaterFlowTexture() {
  if (typeof document === 'undefined') {
    const texture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.needsUpdate = true
    return texture
  }

  const canvas = document.createElement('canvas')
  canvas.width = FLOW_SIZE
  canvas.height = FLOW_SIZE
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, FLOW_SIZE, FLOW_SIZE)

  for (let i = 0; i < 140; i += 1) {
    const x = Math.random() * FLOW_SIZE
    const y = Math.random() * FLOW_SIZE
    const w = 4 + Math.random() * 18
    const h = 18 + Math.random() * 70
    const shade = 96 + Math.floor(Math.random() * 64)
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.18 + Math.random() * 0.28})`
    ctx.beginPath()
    ctx.ellipse(x, y, w * 0.35, h * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return texture
}

let sharedFlow = null

function waterFlowMap() {
  if (!sharedFlow) sharedFlow = createWaterFlowTexture()
  return sharedFlow
}

export function createWaterMaterial(sourceSide) {
  const flow = waterFlowMap().clone()
  flow.offset = new THREE.Vector2(Math.random(), Math.random())

  // Physical clearcoat reads wet; the scrolling map is just enough motion for
  // the eye to catch while the HDRI still carries the sky reflection.
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#1f6f8f'),
    map: flow,
    roughness: 0.18,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
    reflectivity: 0.85,
    envMapIntensity: 1.75,
    side: sourceSide,
  })
  material.userData.waterFlow = flow
  return material
}

export function advanceWaterFlow(root, delta, speed = WATER_FLOW_SPEED) {
  if (!root || !(delta > 0)) return

  root.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      const flow = material?.userData?.waterFlow
      if (!flow) continue
      flow.offset.y = (flow.offset.y + delta * speed) % 1
    }
  })
}
