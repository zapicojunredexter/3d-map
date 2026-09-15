// Native sizes measured from the GLBs (metres, Y-up). Used to pick a model
// whose proportions already fit the plot, so instance scale stays nearly uniform.

import ver1 from '../assets/houses/house-ver1-small.glb?url'
import ver2 from '../assets/houses/house-ver2-small.glb?url'
import ver5 from '../assets/houses/house-ver5-small.glb?url'
import ver6 from '../assets/houses/house-ver6-large.glb?url'
import ver8small from '../assets/houses/house-ver8-small.glb?url'
import ver8mid from '../assets/houses/house-ver8-middlesize.glb?url'
import ver9 from '../assets/houses/house-ver9-large.glb?url'
import ver10 from '../assets/houses/house-ver10.glb?url'
import ver11 from '../assets/houses/house-ver11.glb?url'
import mill1 from '../assets/houses/mill-ver1-base.glb?url'
import mill2 from '../assets/houses/mill-ver2-base.glb?url'

export const HOUSE_CATALOG = [
  {
    id: 'ver1-small',
    url: ver1,
    // Compact square cottage.
    native: { x: 5.69, y: 5.16, z: 6.27 },
    size: 'small',
    shape: 'square',
  },
  {
    id: 'ver2-small',
    url: ver2,
    native: { x: 6.24, y: 5.51, z: 6.76 },
    size: 'small',
    shape: 'square',
  },
  {
    id: 'ver5-small',
    url: ver5,
    // Slightly longer hall, still low.
    native: { x: 6.24, y: 5.51, z: 9.71 },
    size: 'small',
    shape: 'wide',
  },
  {
    id: 'ver8-small',
    url: ver8small,
    native: { x: 5.69, y: 5.17, z: 8.71 },
    size: 'small',
    shape: 'wide',
  },
  {
    id: 'ver8-mid',
    url: ver8mid,
    native: { x: 5.69, y: 9.43, z: 8.78 },
    size: 'medium',
    shape: 'wide',
  },
  {
    id: 'ver6-large',
    url: ver6,
    // Tall on a modest footprint — for the rare high blocks.
    native: { x: 6.23, y: 14.58, z: 9.7 },
    size: 'tall',
    shape: 'wide',
  },
  {
    id: 'ver9-large',
    url: ver9,
    native: { x: 5.69, y: 13.65, z: 8.74 },
    size: 'tall',
    shape: 'wide',
  },
  {
    id: 'ver10',
    url: ver10,
    // Broad multi-storey mass.
    native: { x: 14.08, y: 13.65, z: 8.74 },
    size: 'large',
    shape: 'wide',
  },
  {
    id: 'ver11',
    url: ver11,
    native: { x: 13.65, y: 13.65, z: 8.74 },
    size: 'large',
    shape: 'wide',
  },
  {
    id: 'mill1',
    url: mill1,
    native: { x: 6.9, y: 10.84, z: 9.42 },
    size: 'medium',
    shape: 'square',
  },
  {
    id: 'mill2',
    url: mill2,
    native: { x: 6.93, y: 9.87, z: 9.12 },
    size: 'medium',
    shape: 'square',
  },
]

export const HOUSE_MODEL_URLS = HOUSE_CATALOG.map((entry) => entry.url)

function plotProfile(plot) {
  const area = plot.width * plot.depth
  const longSide = Math.max(plot.width, plot.depth)
  const shortSide = Math.min(plot.width, plot.depth)
  const aspect = longSide / Math.max(shortSide, 1e-6)
  return {
    area,
    longSide,
    aspect,
    square: aspect < 1.28,
    tall: plot.height > 7.5,
    size:
      area < 70 || longSide < 9
        ? 'small'
        : area > 220 || longSide > 18
          ? 'large'
          : 'medium',
  }
}

function poolFor(profile) {
  if (profile.tall) {
    return profile.size === 'large'
      ? ['ver10', 'ver11', 'ver6-large', 'ver9-large']
      : ['ver6-large', 'ver9-large', 'mill1', 'ver8-mid']
  }

  if (profile.size === 'small') {
    return profile.square
      ? ['ver1-small', 'ver2-small', 'ver8-small']
      : ['ver5-small', 'ver8-small', 'ver1-small']
  }

  if (profile.size === 'large') {
    return profile.square
      ? ['ver10', 'ver11', 'mill1', 'mill2']
      : ['ver10', 'ver11', 'ver8-mid', 'mill2']
  }

  // medium
  return profile.square
    ? ['mill2', 'mill1', 'ver2-small', 'ver8-mid']
    : ['ver8-mid', 'ver5-small', 'mill2', 'ver8-small']
}

function modelAspect(entry) {
  const { x, z } = entry.native
  return Math.max(x, z) / Math.min(x, z)
}

function modelFootprint(entry) {
  return entry.native.x * entry.native.z
}

// Seeded pick: prefer catalog entries whose native footprint and height already
// sit near the plot, then break ties randomly so a street is not one clone.
export function pickHouseModel(plot, catalog = HOUSE_CATALOG, random = Math.random) {
  const profile = plotProfile(plot)
  const poolIds = poolFor(profile)
  const pool = poolIds
    .map((id) => catalog.find((entry) => entry.id === id))
    .filter(Boolean)
  const candidates = pool.length ? pool : catalog

  let best = candidates[0]
  let bestScore = Infinity

  for (const entry of candidates) {
    const aspectScore = Math.abs(Math.log(profile.aspect / modelAspect(entry)))
    const areaScore = Math.abs(
      Math.log(profile.area / Math.max(modelFootprint(entry), 1)),
    )
    const heightScore = Math.abs(
      Math.log(plot.height / Math.max(entry.native.y, 1)),
    )
    // Mild jitter so neighbouring plots in the same bucket diverge.
    const score =
      aspectScore * 1.4 + areaScore * 0.9 + heightScore * 0.7 + random() * 0.35
    if (score < bestScore) {
      bestScore = score
      best = entry
    }
  }

  return best
}
