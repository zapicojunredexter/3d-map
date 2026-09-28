import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  TORCH_BRIGHTNESS,
  TORCH_DISTANCE,
  TORCH_FILL_BRIGHTNESS,
  TORCH_MODEL_HEIGHT,
  TORCH_OFFSET,
  TORCH_OFFSET_MOBILE,
  canUseTorch,
  torchFlicker,
  torchHandOffset,
  torchIsLit,
} from './nightLighting'
import { prepareTorchModel } from './PlayerTorch'

describe('nightLighting', () => {
  it('uses candela-scale brightness so a night pool actually reads', () => {
    expect(TORCH_BRIGHTNESS).toBeGreaterThan(80)
    expect(TORCH_FILL_BRIGHTNESS).toBeGreaterThan(30)
    expect(TORCH_DISTANCE).toBeGreaterThan(25)
    expect(TORCH_OFFSET[2]).toBeLessThan(0)
  })

  it('flickers between dimmer and brighter fire', () => {
    const samples = [0, 0.1, 0.37, 1.2, 4.5].map(torchFlicker)
    expect(Math.min(...samples)).toBeGreaterThan(0.7)
    expect(Math.max(...samples)).toBeLessThan(1.05)
    expect(new Set(samples.map((v) => v.toFixed(3))).size).toBeGreaterThan(1)
  })

  it('only lights the torch at night when the player leaves it on', () => {
    expect(canUseTorch(0)).toBe(false)
    expect(canUseTorch(1.2)).toBe(true)
    expect(torchIsLit(1.2, true)).toBe(true)
    expect(torchIsLit(1.2, false)).toBe(false)
    expect(torchIsLit(0, true)).toBe(false)
  })

  it('pulls the hand torch in-frame on narrow or portrait viewports', () => {
    expect(torchHandOffset(1280, 720)).toEqual(TORCH_OFFSET)
    expect(torchHandOffset(390, 844)).toEqual(TORCH_OFFSET_MOBILE)
    expect(torchHandOffset(800, 600)).toEqual(TORCH_OFFSET_MOBILE)
    expect(TORCH_OFFSET_MOBILE[0]).toBeLessThan(TORCH_OFFSET[0])
    expect(TORCH_OFFSET_MOBILE[2]).toBeGreaterThan(TORCH_OFFSET[2])
  })
})

describe('prepareTorchModel', () => {
  it('scales the torch to hand height with the grip on y=0', () => {
    const scene = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 1))
    mesh.position.y = 3
    scene.add(mesh)

    const prepared = prepareTorchModel(scene)
    prepared.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(prepared)
    expect(box.min.y).toBeCloseTo(0, 4)
    expect(box.max.y - box.min.y).toBeCloseTo(TORCH_MODEL_HEIGHT, 4)
  })
})
