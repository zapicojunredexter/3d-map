import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  advanceTreeAnimations,
  buildAnimatedTrees,
  prepareAnimatedTree,
} from './treeInstances'

function loadPine() {
  const buf = readFileSync(
    path.resolve('assets/stop_motion_pixel_art_pine.glb'),
  )
  const loader = new GLTFLoader()
  const bytes = Uint8Array.from(buf)
  return new Promise((resolve, reject) => {
    loader.parse(bytes.buffer, '', resolve, reject)
  })
}

describe('stop_motion_pixel_art_pine.glb', () => {
  it('uses visibility frames instead of scale-mixer grow', async () => {
    const gltf = await loadPine()
    const model = prepareAnimatedTree(gltf.scene, gltf.animations)

    expect(model.stopMotion).toBe(true)
    expect(model.frameNames).toEqual([
      'Object_17',
      'Object_12',
      'Object_7',
      'Object_2',
    ])

    const group = buildAnimatedTrees(model, gltf.animations, [
      { x: 0, y: 0, z: 0, height: 10, radius: 3 },
    ])
    const [entry] = group.userData.mixers
    expect(entry.stopMotion).toBe(true)
    expect(entry.mixer).toBeUndefined()
    expect(entry.frames.every((frame) => frame.scale.x === 1)).toBe(true)

    entry.time = 0
    entry.timeScale = 1
    entry.frameIndex = 0
    entry.frames.forEach((frame, index) => {
      frame.visible = index === 0
    })

    advanceTreeAnimations(group, 0.3, new THREE.Vector3(0, 0, 0))
    expect(entry.frames.map((frame) => frame.visible)).toEqual([
      false,
      true,
      false,
      false,
    ])
  })
})
