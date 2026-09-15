// The plan is ~970 units across but the minimap only shows a ~190 unit window,
// so a uniform grid lets each frame draw the local neighbourhood instead of all
// 4,500 features.
export const CELL_SIZE = 64

export function featureBounds(points) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  return { minX, minY, maxX, maxY }
}

export function buildFeatureIndex(features, cellSize = CELL_SIZE) {
  const cells = new Map()

  features.forEach((feature, id) => {
    if (!feature.points.length) return
    const bounds = featureBounds(feature.points)

    for (let cx = Math.floor(bounds.minX / cellSize); cx <= Math.floor(bounds.maxX / cellSize); cx += 1) {
      for (let cy = Math.floor(bounds.minY / cellSize); cy <= Math.floor(bounds.maxY / cellSize); cy += 1) {
        const key = `${cx},${cy}`
        const bucket = cells.get(key)
        if (bucket) bucket.push(id)
        else cells.set(key, [id])
      }
    }
  })

  return { cellSize, cells, features }
}

export function queryFeatureIndex(index, centerX, centerY, radius) {
  const { cellSize, cells, features } = index
  const seen = new Set()
  const found = []

  for (let cx = Math.floor((centerX - radius) / cellSize); cx <= Math.floor((centerX + radius) / cellSize); cx += 1) {
    for (let cy = Math.floor((centerY - radius) / cellSize); cy <= Math.floor((centerY + radius) / cellSize); cy += 1) {
      const bucket = cells.get(`${cx},${cy}`)
      if (!bucket) continue
      for (const id of bucket) {
        if (seen.has(id)) continue
        seen.add(id)
        found.push(features[id])
      }
    }
  }

  return found
}
