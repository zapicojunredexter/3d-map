import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { BUILDINGS_LAYER } from './buildingStyles'
import {
  HOUSE_CELL_SIZE,
  buildHouses,
  buildingPlacements,
  normalizeHouseModel,
} from './houseInstances'
import { mergeWorldByLayer } from './mergeWorld'
import { calculateModelPlacement } from './world'
import { HOUSE_MODEL_URL } from './Houses'

// The unit tests use stand-in geometry. This one runs the real export through
// the real pipeline, because the failures that matter here are the ones only
// the survey's own terrain and footprints produce: houses floating above a
// slope, or landing on a plot that belongs to a different block.

// jsdom's ArrayBuffer is a different realm from Node's, and GLTFLoader gates on
// instanceof, so the bytes have to be copied into a local buffer.
function asArrayBuffer(path) {
  const file = readFileSync(path)
  const buffer = new ArrayBuffer(file.byteLength)
  new Uint8Array(buffer).set(file)
  return buffer
}

const load = (path) =>
  new Promise((resolve, reject) => {
    new GLTFLoader().parse(asArrayBuffer(path), '', resolve, reject)
  })

const CITY = 'assets/topoexport_3D_modeling.glb'
// Vite hands the component a served url; the file itself sits alongside the city.
const HOUSE = `assets/${HOUSE_MODEL_URL.split('/').pop().split('?')[0]}`

describe('houses on the real survey', () => {
  let blocks
  let plots
  let houses
  let model
  let surfaces

  beforeAll(async () => {
    const [city, house] = await Promise.all([load(CITY), load(HOUSE)])
    const merged = mergeWorldByLayer(city.scene, {
      skip: ['TPX_Trees'],
      identify: [BUILDINGS_LAYER],
    })
    const placement = calculateModelPlacement(merged)

    blocks = merged.children.find(
      (child) => child.isMesh && child.name === BUILDINGS_LAYER,
    )
    plots = buildingPlacements(blocks, placement)
    model = normalizeHouseModel(house.scene)
    houses = buildHouses(model, plots, HOUSE_CELL_SIZE)

    // The ground as the player sees it, so the grounding check uses the same
    // transform chain the renderer does.
    const rotated = new THREE.Group()
    rotated.rotation.set(...placement.rotation)
    rotated.add(merged)
    const world = new THREE.Group()
    world.position.copy(placement.position)
    world.add(rotated)
    world.updateMatrixWorld(true)

    surfaces = merged.children.filter(
      (child) =>
        child.isMesh && ['TPX_Ground', 'TPX_RoadsOutlines'].includes(child.name),
    )
  }, 120000)

  it('finds a plot for every block, with no slot drift', () => {
    const names = blocks.userData.featureNames

    expect(plots).toHaveLength(names.length)
    // Drift here would glow one building and name another.
    for (const plot of plots) {
      expect(plot.name).toBe(names[plot.slot])
    }
  })

  it('puts exactly one house on each plot', () => {
    const bodies = houses.children.filter(
      (mesh) => mesh.name === model.parts[0].name,
    )
    const instances = bodies.reduce((total, mesh) => total + mesh.count, 0)

    expect(instances).toBe(plots.length)
  })

  it('splits the city into cells so most of it can be culled', () => {
    const cells = houses.children.length / model.parts.length

    // One instanced mesh for the whole city could never be frustum culled.
    expect(cells).toBeGreaterThan(20)
  })

  it('stands every house on the ground under it', () => {
    const raycaster = new THREE.Raycaster()
    const down = new THREE.Vector3(0, -1, 0)
    const gaps = []

    for (const plot of plots.slice(0, 400)) {
      raycaster.set(new THREE.Vector3(plot.x, plot.y + 60, plot.z), down)
      raycaster.far = 200
      const [hit] = raycaster.intersectObjects(surfaces, false)
      if (hit) gaps.push(plot.y - hit.point.y)
    }

    expect(gaps.length).toBeGreaterThan(300)
    // A gap above the surface is the visible failure: a house on stilts. Sitting
    // slightly into a slope is fine and is what the export already does.
    expect(gaps.filter((gap) => gap > 0.5)).toHaveLength(0)
  })

  it('keeps the house cheap enough to repeat across the city', () => {
    const triangles = model.parts.reduce(
      (total, part) =>
        total +
        (part.geometry.index
          ? part.geometry.index.count / 3
          : part.geometry.getAttribute('position').count / 3),
      0,
    )

    // Guards the asset, not the code: a heavier replacement dropped in here
    // would multiply by 2,532.
    expect(triangles).toBeLessThan(2500)
  })
})
