import * as THREE from 'three'

// TopoExport writes Z-up geometry, while three.js treats Y as up.
export const Z_UP_TO_Y_UP = [-Math.PI / 2, 0, 0]

// TopoExport keeps its source layers as node names, so roads stay identifiable.
// It draws centrelines as line strips and the surface you actually walk on as
// the RoadsOutlines triangles, so both spellings count as road.
export function isRoadSurface(object) {
  for (let node = object; node; node = node.parent) {
    if ((node.name ?? '').startsWith('TPX_Roads')) return true
  }
  return false
}

export function calculateModelPlacement(object, upAxis = 'z') {
  const rotation = upAxis === 'z' ? Z_UP_TO_Y_UP : [0, 0, 0]
  const bounds = new THREE.Box3().setFromObject(object)

  if (upAxis === 'z') {
    bounds.applyMatrix4(new THREE.Matrix4().makeRotationX(rotation[0]))
  }

  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())

  return {
    rotation,
    position: new THREE.Vector3(-center.x, -bounds.min.y, -center.z),
    size,
  }
}
