import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  PLAYER,
  applyGravityAndGround,
  createPlayerState,
  findSpawn,
  moveWithCollisions,
  spawnSearchOffsets,
} from './player'

describe('applyGravityAndGround', () => {
  it('falls under gravity and lands at eye height', () => {
    const state = createPlayerState()
    state.position.y = 10

    applyGravityAndGround(state, 1, 0)

    expect(state.position.y).toBeCloseTo(PLAYER.eyeHeight)
    expect(state.grounded).toBe(true)
    expect(state.velocityY).toBe(0)
  })

  it('jumps off the ground, then comes back down', () => {
    const state = createPlayerState()
    state.position.y = PLAYER.eyeHeight
    state.grounded = true
    state.jumpRequested = true

    applyGravityAndGround(state, 0.05, 0)
    expect(state.grounded).toBe(false)
    expect(state.position.y).toBeGreaterThan(PLAYER.eyeHeight)

    for (let i = 0; i < 40; i += 1) {
      applyGravityAndGround(state, 0.05, 0)
    }

    expect(state.grounded).toBe(true)
    expect(state.position.y).toBeCloseTo(PLAYER.eyeHeight)
  })
})

describe('moveWithCollisions', () => {
  it('stops a radius short of a wall', () => {
    const start = new THREE.Vector3(0, 1.65, 0)
    const result = moveWithCollisions(
      start,
      new THREE.Vector3(0, 0, 1),
      0.3,
      (origin, direction) => {
        if (direction.z <= 0) return null
        return {
          distance: (0.5 - origin.z) / direction.z,
          normal: new THREE.Vector3(0, 0, -1),
        }
      },
    )

    expect(result.z).toBeCloseTo(0.2)
    expect(result.x).toBeCloseTo(0)
  })

  it('slides along a wall instead of stopping completely', () => {
    const start = new THREE.Vector3(0, 1.65, 0)
    const result = moveWithCollisions(
      start,
      new THREE.Vector3(1, 0, 1),
      0.3,
      (origin, direction) => {
        if (direction.z <= 0) return null
        const distance = (0.5 - origin.z) / direction.z
        if (distance < 0) return null
        return { distance, normal: new THREE.Vector3(0, 0, -1) }
      },
    )

    expect(result.x).toBeGreaterThan(0.5)
    expect(result.z).toBeLessThan(0.35)
  })
})

describe('findSpawn', () => {
  const offsets = [
    [0, 0],
    [10, 0],
    [20, 0],
  ]

  it('takes the first road that has open sky above it', () => {
    const columns = {
      '0,0': { groundY: 9, road: false },
      '10,0': { groundY: 1, road: true },
      '20,0': { groundY: 2, road: true },
    }
    const probe = (x, z) => columns[`${x},${z}`] ?? null
    const hasHeadroom = (x) => x === 20

    expect(findSpawn(offsets, probe, hasHeadroom)).toEqual({
      x: 20,
      z: 0,
      groundY: 2,
    })
  })

  it('settles for a road under a crown before leaving the road network', () => {
    const columns = {
      '0,0': { groundY: 9, road: false },
      '10,0': { groundY: 1, road: true },
    }
    const probe = (x, z) => columns[`${x},${z}`] ?? null

    expect(findSpawn(offsets, probe, () => false)).toEqual({
      x: 10,
      z: 0,
      groundY: 1,
    })
  })

  it('falls back to open ground when no road is reachable', () => {
    const probe = (x) => (x === 10 ? { groundY: 9, road: false } : null)

    expect(findSpawn(offsets, probe, () => true)).toEqual({
      x: 10,
      z: 0,
      groundY: 9,
    })
  })

  it('reports nothing when every column misses', () => {
    expect(findSpawn(offsets, () => null, () => true)).toBeNull()
  })

  it('never probes headroom for non-road ground', () => {
    const probe = () => ({ groundY: 4, road: false })
    const headroom = vi.fn(() => true)

    findSpawn(offsets, probe, headroom)

    expect(headroom).not.toHaveBeenCalled()
  })
})

describe('spawnSearchOffsets', () => {
  it('starts at the map center and spirals outward', () => {
    const offsets = spawnSearchOffsets()

    expect(offsets[0]).toEqual([0, 0])
    expect(offsets.length).toBeGreaterThan(1)

    const radii = offsets.map(([x, z]) => Math.hypot(x, z))
    expect(Math.max(...radii)).toBeCloseTo(400)
  })
})
