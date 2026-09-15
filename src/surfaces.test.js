import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  SURFACES,
  applySurfaces,
  createRandom,
  paintGrass,
  paintGround,
  paintRoad,
  planarUv,
} from './surfaces'

// jsdom has no 2D context, so the painters are checked against a recorder.
function recordingContext() {
  const calls = { fillRect: [], fills: 0, strokes: 0, gradients: 0 }
  return {
    calls,
    set fillStyle(value) {
      calls.lastFill = value
    },
    strokeStyle: '',
    lineWidth: 0,
    fillRect: (x, y, w, h) => calls.fillRect.push([x, y, w, h]),
    fill: () => {
      calls.fills += 1
    },
    stroke: () => {
      calls.strokes += 1
    },
    createRadialGradient: () => {
      calls.gradients += 1
      return { addColorStop: () => {} }
    },
    save: () => {},
    restore: () => {},
    translate: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
  }
}

describe('createRandom', () => {
  it('is deterministic for a seed', () => {
    const first = createRandom(42)
    const second = createRandom(42)

    expect([first(), first(), first()]).toEqual([second(), second(), second()])
  })

  it('stays inside the unit range', () => {
    const random = createRandom(9)

    for (let index = 0; index < 500; index += 1) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('differs between seeds', () => {
    expect(createRandom(1)()).not.toBe(createRandom(2)())
  })
})

describe('planarUv', () => {
  it('projects the Z-up ground plane onto metres of tile', () => {
    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      // x, y are the horizontal plane before the Y-up correction.
      new THREE.Float32BufferAttribute([0, 0, 0, 9, 18, 5], 3),
    )

    const uv = planarUv(geometry, 9)

    expect(uv.itemSize).toBe(2)
    expect([...uv.array]).toEqual([0, 0, 1, 2])
  })

  it('gives one texture repeat per tile of world space', () => {
    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute([26, 13, 0], 3),
    )

    const uv = planarUv(geometry, 13)

    expect([...uv.array]).toEqual([2, 1])
  })

  it('compensates for wide texture packs so stones stay square', () => {
    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute([4.5, 2.25, 0], 3),
    )

    // 2:1 map: 4.5m along X is one U, 2.25m along Y is one V.
    expect([...planarUv(geometry, 4.5, 2).array]).toEqual([1, 1])
  })
})

describe('painters', () => {
  it('fills the whole tile and draws the slab joints', () => {
    const ctx = recordingContext()

    paintRoad(ctx, 512, createRandom(7))

    // Base coat covers the tile.
    expect(ctx.calls.fillRect[0]).toEqual([0, 0, 512, 512])
    // Two joints per axis: one on the edge, one across the middle.
    const joints = ctx.calls.fillRect.filter(
      ([x, y, w, h]) =>
        (w === 512 && h < 8 && (y === 0 || y === 256)) ||
        (h === 512 && w < 8 && (x === 0 || x === 256)),
    )
    expect(joints).toHaveLength(4)
  })

  it('leaves no joints on open ground', () => {
    const ctx = recordingContext()

    paintGround(ctx, 512, createRandom(21))

    expect(ctx.calls.fillRect[0]).toEqual([0, 0, 512, 512])
    expect(ctx.calls.gradients).toBeGreaterThan(0)
    const wideLines = ctx.calls.fillRect.filter(
      ([, , w, h]) => w === 512 && h < 8,
    )
    expect(wideLines).toHaveLength(0)
  })

  it('paints a denser green tile for parks', () => {
    const ctx = recordingContext()

    paintGrass(ctx, 512, createRandom(41))

    expect(ctx.calls.fillRect[0]).toEqual([0, 0, 512, 512])
    expect(ctx.calls.gradients).toBeGreaterThan(0)
    expect(ctx.calls.strokes).toBeGreaterThan(100)
  })

  it('paints the same tile for the same seed', () => {
    const first = recordingContext()
    const second = recordingContext()

    paintRoad(first, 256, createRandom(7))
    paintRoad(second, 256, createRandom(7))

    expect(first.calls.fillRect).toEqual(second.calls.fillRect)
  })
})

describe('applySurfaces', () => {
  const buildWorld = () => {
    const group = new THREE.Group()
    for (const name of [
      'TPX_RoadsOutlines',
      'TPX_Ground',
      'TPX_GreenAreas',
      'TPX_Waterways',
      'TPX_Buildings',
    ]) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
      )
      mesh.name = name
      group.add(mesh)
    }
    const line = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3),
      ),
      new THREE.LineBasicMaterial(),
    )
    line.name = 'TPX_Roads'
    group.add(line)
    return group
  }

  const withMocks = (group) =>
    applySurfaces(group, {
      makeTexture: () => new THREE.Texture(),
      makeGrassMaterial: (side) =>
        new THREE.MeshStandardMaterial({ map: new THREE.Texture(), side }),
      makeRoadMaterial: (side) =>
        new THREE.MeshStandardMaterial({ map: new THREE.Texture(), side }),
      makeWaterMaterial: (side) =>
        new THREE.MeshPhysicalMaterial({ color: '#1f6f8f', side }),
    })

  it('textures the ground, road, green and water surfaces only', () => {
    const group = buildWorld()
    withMocks(group)

    const textured = group.children
      .filter(
        (child) =>
          child.material?.map || child.name === 'TPX_Waterways',
      )
      .map((child) => child.name)
    expect(textured.sort()).toEqual([
      'TPX_GreenAreas',
      'TPX_Ground',
      'TPX_RoadsOutlines',
      'TPX_Waterways',
    ])
  })

  it('gives the textured layers the UVs the export never had', () => {
    const group = buildWorld()
    const road = group.children.find((c) => c.name === 'TPX_RoadsOutlines')
    road.geometry.deleteAttribute('uv')

    withMocks(group)

    expect(road.geometry.getAttribute('uv')).toBeDefined()
    expect(road.geometry.getAttribute('uv').count).toBe(
      road.geometry.getAttribute('position').count,
    )
  })

  it('leaves buildings and line layers untouched', () => {
    const group = buildWorld()
    const buildings = group.children.find((c) => c.name === 'TPX_Buildings')
    const before = buildings.material

    withMocks(group)

    expect(buildings.material).toBe(before)
    expect(
      group.children.find((c) => c.name === 'TPX_Roads').material.map,
    ).toBeFalsy()
  })

  it('keeps the double-sided export geometry visible from below', () => {
    const group = buildWorld()
    withMocks(group)

    const ground = group.children.find((c) => c.name === 'TPX_Ground')
    expect(ground.material.side).toBe(THREE.DoubleSide)
  })

  it('covers every configured layer', () => {
    expect(SURFACES.map((surface) => surface.layer)).toEqual([
      'TPX_RoadsOutlines',
      'TPX_Ground',
      'TPX_GreenAreas',
      'TPX_Waterways',
    ])
  })

  it('uses photo packs for roads, ground and parks, and a wet material for water', () => {
    expect(SURFACES.find((s) => s.layer === 'TPX_RoadsOutlines').kind).toBe('road')
    expect(SURFACES.find((s) => s.layer === 'TPX_Ground').kind).toBe('grass')
    expect(SURFACES.find((s) => s.layer === 'TPX_GreenAreas').kind).toBe('grass')
    expect(SURFACES.find((s) => s.layer === 'TPX_Waterways').kind).toBe('water')
  })

  it('gives water a glossy physical material', () => {
    const group = buildWorld()
    withMocks(group)
    const water = group.children.find((c) => c.name === 'TPX_Waterways')
    expect(water.material.isMeshPhysicalMaterial).toBe(true)
    expect(water.geometry.getAttribute('uv')).toBeDefined()
  })

  it('gives photo layers a second UV set for ambient occlusion', () => {
    const group = buildWorld()
    withMocks(group)
    const ground = group.children.find((c) => c.name === 'TPX_Ground')
    expect(ground.geometry.getAttribute('uv2')).toBe(
      ground.geometry.getAttribute('uv'),
    )
  })
})
