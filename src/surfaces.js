import * as THREE from 'three'

// TopoExport ships flat colour and no UVs, so the ground reads as blank white
// card. These painters build tiling textures at runtime, which keeps the look
// adjustable without needing any new art assets.

export const TEXTURE_SIZE = 512

// Deterministic, so the city looks identical on every load.
export function createRandom(seed = 1) {
  let state = seed >>> 0 || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

// The merged export is still Z-up, so its ground plane is XY. Dividing world
// metres by the tile size lets one texture repeat across the whole city.
export function planarUv(geometry, tileMeters) {
  const position = geometry.getAttribute('position')
  const uv = new Float32Array(position.count * 2)

  for (let index = 0; index < position.count; index += 1) {
    uv[index * 2] = position.getX(index) / tileMeters
    uv[index * 2 + 1] = position.getY(index) / tileMeters
  }

  return new THREE.BufferAttribute(uv, 2)
}

// Anything that crosses an edge has to reappear on the opposite side, or the
// seams show up as a grid across the city.
function seamless(ctx, size, draw) {
  for (const offsetX of [-size, 0, size]) {
    for (const offsetY of [-size, 0, size]) {
      ctx.save()
      ctx.translate(offsetX, offsetY)
      draw()
      ctx.restore()
    }
  }
}

function stain(ctx, size, x, y, radius, rgb, alpha) {
  seamless(ctx, size, () => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(${rgb},${alpha})`)
    gradient.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = gradient
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  })
}

function speckle(ctx, size, random, count, shades) {
  for (let index = 0; index < count; index += 1) {
    ctx.fillStyle = shades[Math.floor(random() * shades.length)]
    ctx.fillRect(random() * size, random() * size, 1, 1 + random())
  }
}

function crack(ctx, size, random, color) {
  ctx.strokeStyle = color
  ctx.lineWidth = 1 + random()
  ctx.beginPath()
  let x = random() * size
  let y = random() * size
  ctx.moveTo(x, y)
  for (let step = 0; step < 8; step += 1) {
    x += (random() - 0.5) * size * 0.16
    y += (random() - 0.5) * size * 0.16
    ctx.lineTo(x, y)
  }
  ctx.stroke()
}

// Philippine local roads are mostly PCCP: pale concrete slabs jointed every few
// metres, dusty and unevenly weathered. The tile repeats every few metres
// across the whole city, so it stays deliberately featureless apart from the
// joints; anything high-contrast here reads as wallpaper from a distance.
export function paintRoad(ctx, size, random) {
  ctx.fillStyle = '#918f86'
  ctx.fillRect(0, 0, size, size)

  // Uneven weathering, kept low-contrast so it never reads as a landmark.
  for (let index = 0; index < 40; index += 1) {
    const pick = random()
    const rgb = pick < 0.4 ? '176,173,163' : pick < 0.8 ? '104,100,88' : '134,124,104'
    stain(
      ctx,
      size,
      random() * size,
      random() * size,
      size * (0.1 + random() * 0.26),
      rgb,
      0.14 + random() * 0.2,
    )
  }

  speckle(ctx, size, random, 14000, [
    '#a3a198',
    '#7d7c74',
    '#aeaca3',
    '#6f6e68',
  ])

  // Slab joints. Half a tile apart, so the tile carries a 2x2 slab block.
  const joint = Math.max(2, Math.round(size * 0.006))
  ctx.fillStyle = 'rgba(88,86,79,0.85)'
  for (const at of [0, size / 2]) {
    ctx.fillRect(at, 0, joint, size)
    ctx.fillRect(0, at, size, joint)
  }

  for (let index = 0; index < 3; index += 1) {
    crack(ctx, size, random, 'rgba(104,101,93,0.5)')
  }
}

// Off-road ground here is dry compacted earth, gravel and patchy scrub mixed
// with bare concrete, not the pale card the export gives you.
export function paintGround(ctx, size, random) {
  ctx.fillStyle = '#7d7361'
  ctx.fillRect(0, 0, size, size)

  for (let index = 0; index < 46; index += 1) {
    const pick = random()
    const rgb =
      pick < 0.3
        ? '150,138,114' // sun-bleached dust
        : pick < 0.58
          ? '92,84,68' // damp or shaded soil
          : pick < 0.82
            ? '112,116,76' // dry scrub
            : '150,148,140' // bare concrete
    stain(
      ctx,
      size,
      random() * size,
      random() * size,
      size * (0.08 + random() * 0.22),
      rgb,
      0.2 + random() * 0.26,
    )
  }

  speckle(ctx, size, random, 20000, [
    '#948b7a',
    '#5f5749',
    '#a39b8a',
    '#4c4437',
  ])
}

export const SURFACES = [
  {
    layer: 'TPX_RoadsOutlines',
    tile: 9,
    seed: 7,
    roughness: 0.8,
    paint: paintRoad,
  },
  {
    layer: 'TPX_Ground',
    tile: 14,
    seed: 21,
    roughness: 0.96,
    paint: paintGround,
  },
]

export function createSurfaceTexture(surface, { anisotropy = 1 } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_SIZE
  canvas.height = TEXTURE_SIZE
  surface.paint(
    canvas.getContext('2d'),
    TEXTURE_SIZE,
    createRandom(surface.seed),
  )

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  // Roads are read at a grazing angle almost all the time.
  texture.anisotropy = anisotropy
  return texture
}

export function applySurfaces(group, options = {}) {
  const { makeTexture = createSurfaceTexture, anisotropy = 1 } = options

  for (const surface of SURFACES) {
    for (const mesh of group.children) {
      if (!mesh.isMesh || mesh.name !== surface.layer) continue

      mesh.geometry.setAttribute('uv', planarUv(mesh.geometry, surface.tile))
      const map = makeTexture(surface, { anisotropy })
      mesh.material = new THREE.MeshStandardMaterial({
        map,
        bumpMap: map,
        bumpScale: 0.12,
        roughness: surface.roughness,
        metalness: 0,
        side: mesh.material.side,
        envMapIntensity: 0.35,
      })
    }
  }

  return group
}
