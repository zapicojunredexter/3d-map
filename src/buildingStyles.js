import * as THREE from 'three'
import { FEATURE_ID } from './mergeWorld'
import { createRandom } from './surfaces'

// The export gives every building the same white extrusion. Replacing them with
// real models is a big job, but the blocks are already correctly sized and
// placed, so a material treatment can carry a whole aesthetic for almost
// nothing: no new geometry, no new assets, same draw call.

export const BUILDINGS_LAYER = 'TPX_Buildings'
export const GROUND_LAYER = 'TPX_Ground'
export const ROAD_LAYER = 'TPX_RoadsOutlines'

// Per-building tints come from the featureId tag the merge already writes, so
// each block reads as its own moulded piece instead of one uniform mass.
function tintPalette(geometry, featureCount, palette, seed) {
  const slots = geometry.getAttribute(FEATURE_ID)
  if (!slots || !palette || featureCount <= 0) return false

  const random = createRandom(seed)
  const perFeature = Array.from({ length: featureCount }, () => {
    const color = new THREE.Color(palette[Math.floor(random() * palette.length)])
    // A little brightness jitter on top, so repeats in the palette still differ.
    const shade = 0.9 + random() * 0.2
    return [color.r * shade, color.g * shade, color.b * shade]
  })

  const colors = new Float32Array(slots.count * 3)
  for (let vertex = 0; vertex < slots.count; vertex += 1) {
    const [r, g, b] = perFeature[slots.getX(vertex)] ?? [1, 1, 1]
    colors[vertex * 3] = r
    colors[vertex * 3 + 1] = g
    colors[vertex * 3 + 2] = b
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return true
}

export const BUILDING_STYLES = [
  {
    id: 'plain',
    name: 'Survey',
    // null keeps the export's own white material, as a baseline to come back to.
    material: null,
    shadows: true,
  },
  {
    id: 'acrylic',
    name: 'Acrylic',
    // Frosted, lit from within. True transmission would force three to render
    // the scene again into a transmission buffer every frame, which is not
    // worth it here: opacity plus emissive reads the same at street level.
    material: () =>
      new THREE.MeshPhysicalMaterial({
        color: '#dfeef5',
        roughness: 0.42,
        metalness: 0,
        transparent: true,
        opacity: 0.66,
        emissive: '#ffcf8a',
        emissiveIntensity: 0.38,
        clearcoat: 0.55,
        clearcoatRoughness: 0.4,
        envMapIntensity: 1.15,
        vertexColors: true,
      }),
    palette: ['#eaf4f8', '#d7e9f2', '#f2ece2', '#dfe6ea'],
    seed: 11,
    edges: () =>
      new THREE.LineBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.22,
      }),
    shadows: true,
  },
  {
    id: 'hologram',
    name: 'Hologram',
    // Faces contribute only a faint additive haze and write no depth, so the
    // glowing edges of everything behind stay visible. That x-ray build-up is
    // what makes it read as a blueprint rather than tinted glass.
    material: () =>
      new THREE.MeshBasicMaterial({
        color: '#0d8fb8',
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    edges: () =>
      new THREE.LineBasicMaterial({
        color: '#7df4ff',
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    surfaces: { [GROUND_LAYER]: '#141c26', [ROAD_LAYER]: '#1b2734' },
    shadows: false,
  },
  {
    id: 'clay',
    name: 'Clay',
    // Matte clay is defined by the absence of specular detail, so this needs no
    // texture at all: high roughness, almost no environment, and the per-block
    // tints do the work.
    material: () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.95,
        metalness: 0,
        envMapIntensity: 0.18,
        flatShading: true,
        vertexColors: true,
      }),
    palette: ['#d9c3ab', '#c9a78c', '#e0d2bd', '#b98e73', '#cfbba4', '#e6dccb'],
    seed: 29,
    // Kraft cardboard base, to sell the tabletop diorama.
    surfaces: { [GROUND_LAYER]: '#c79a6d', [ROAD_LAYER]: '#d9c0a0' },
    shadows: true,
  },
]

export const DEFAULT_BUILDING_STYLE = 'plain'

export function findBuildingStyle(id) {
  return (
    BUILDING_STYLES.find((style) => style.id === id) ??
    BUILDING_STYLES.find((style) => style.id === DEFAULT_BUILDING_STYLE)
  )
}

function layerMesh(group, name) {
  return group.children.find((child) => child.isMesh && child.name === name)
}

// Only dispose what a style created, never the export's own material.
function swapMaterial(mesh, next) {
  const previous = mesh.material
  if (previous === next) return
  mesh.material = next
  if (previous?.userData?.styled) previous.dispose()
}

export function applyBuildingStyle(group, styleId) {
  const style = findBuildingStyle(styleId)
  const buildings = layerMesh(group, BUILDINGS_LAYER)
  if (!buildings) return group

  buildings.userData.baseMaterial ??= buildings.material

  if (style.material) {
    const material = style.material()
    material.userData.styled = true
    const tinted = tintPalette(
      buildings.geometry,
      buildings.userData.featureNames?.length ?? 0,
      style.palette,
      style.seed ?? 1,
    )
    // Without the attribute, vertexColors would multiply by undefined and the
    // blocks would render black.
    material.vertexColors = tinted && material.vertexColors === true
    swapMaterial(buildings, material)
  } else {
    swapMaterial(buildings, buildings.userData.baseMaterial)
  }

  buildings.castShadow = style.shadows
  buildings.receiveShadow = style.shadows

  applyEdges(buildings, style)
  applySurfaceTints(group, style)
  return group
}

// Wireframing the triangles would show every diagonal of the roof
// triangulation. EdgesGeometry keeps only real creases, which is what makes the
// outlines read as architecture.
function applyEdges(buildings, style) {
  const existing = buildings.children.find((child) => child.isLineSegments)

  if (!style.edges) {
    if (existing) {
      existing.material.dispose()
      buildings.remove(existing)
    }
    return
  }

  buildings.userData.edgeGeometry ??= new THREE.EdgesGeometry(
    buildings.geometry,
    1,
  )

  const material = style.edges()
  if (existing) {
    existing.material.dispose()
    existing.material = material
    return
  }

  const edges = new THREE.LineSegments(buildings.userData.edgeGeometry, material)
  edges.name = 'TPX_BuildingEdges'
  edges.frustumCulled = false
  buildings.add(edges)
}

function applySurfaceTints(group, style) {
  for (const layer of [GROUND_LAYER, ROAD_LAYER]) {
    const mesh = layerMesh(group, layer)
    if (!mesh?.material?.color) continue
    // White is the neutral multiplier, so it restores the painted texture.
    mesh.material.color.set(style.surfaces?.[layer] ?? '#ffffff')
  }
}
