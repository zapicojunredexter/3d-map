import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const buf = fs.readFileSync(path.join(root, 'assets/topoexport_2D_vectorial.dxf'))

let o = 22

function groupType(code) {
  if (code >= 0 && code <= 9) return 's'
  if (code >= 10 && code <= 59) return 'd'
  if (code >= 60 && code <= 79) return 'i16'
  if (code >= 90 && code <= 99) return 'i32'
  if (code === 100 || code === 102 || code === 105) return 's'
  if (code >= 110 && code <= 149) return 'd'
  if (code >= 160 && code <= 169) return 'i64'
  if (code >= 170 && code <= 179) return 'i16'
  if (code >= 210 && code <= 239) return 'd'
  if (code >= 270 && code <= 289) return 'i16'
  if (code >= 290 && code <= 299) return 'b'
  if (code >= 300 && code <= 309) return 's'
  if (code >= 310 && code <= 319) return 'hex'
  if (code >= 320 && code <= 369) return 's'
  if (code >= 370 && code <= 389) return 'i16'
  if (code >= 390 && code <= 399) return 's'
  if (code >= 400 && code <= 409) return 'i16'
  if (code >= 410 && code <= 419) return 's'
  if (code >= 420 && code <= 429) return 'i32'
  if (code >= 430 && code <= 439) return 's'
  if (code >= 440 && code <= 459) return 'i32'
  if (code >= 460 && code <= 469) return 'd'
  if (code >= 470 && code <= 479) return 's'
  if (code >= 480 && code <= 489) return 's'
  if (code === 999) return 's'
  if (code >= 1000 && code <= 1009) return 's'
  if (code >= 1010 && code <= 1059) return 'd'
  if (code >= 1060 && code <= 1070) return 'i16'
  if (code === 1071) return 'i32'
  return 's'
}

function readStr() {
  const start = o
  while (o < buf.length && buf[o] !== 0) o += 1
  const value = buf.toString('latin1', start, o)
  o += 1
  return value
}

function readVal(code) {
  const type = groupType(code)
  if (type === 's' || type === 'hex') return readStr()
  if (type === 'd') {
    const value = buf.readDoubleLE(o)
    o += 8
    return value
  }
  if (type === 'i16') {
    const value = buf.readInt16LE(o)
    o += 2
    return value
  }
  if (type === 'i32') {
    const value = buf.readInt32LE(o)
    o += 4
    return value
  }
  if (type === 'i64') {
    const value = Number(buf.readBigInt64LE(o))
    o += 8
    return value
  }
  if (type === 'b') {
    const value = buf[o]
    o += 1
    return value
  }
  return readStr()
}

function rdp(points, epsilon) {
  if (points.length < 3) return points
  const [startX, startY] = points[0]
  const [endX, endY] = points[points.length - 1]
  const dx = endX - startX
  const dy = endY - startY
  const length = Math.hypot(dx, dy) || 1
  let maxDist = 0
  let index = 0

  for (let i = 1; i < points.length - 1; i += 1) {
    const dist =
      Math.abs(dy * points[i][0] - dx * points[i][1] + endX * startY - endY * startX) /
      length
    if (dist > maxDist) {
      maxDist = dist
      index = i
    }
  }

  if (maxDist <= epsilon) return [points[0], points[points.length - 1]]
  const left = rdp(points.slice(0, index + 1), epsilon)
  const right = rdp(points.slice(index), epsilon)
  return left.slice(0, -1).concat(right)
}

function roundPts(points) {
  return points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])
}

const wanted = {
  TPX_BUILDINGS: { key: 'buildings', epsilon: 0.6, closed: true },
  TPX_ROADS_CONTOURS: { key: 'roads', epsilon: 1.4, closed: true },
  TPX_WATERWAYS: { key: 'water', epsilon: 0.8, closed: false },
  TPX_VEGETATION_GREEN_SPACES: { key: 'parks', epsilon: 0.8, closed: true },
}

const map = {
  buildings: [],
  roads: [],
  water: [],
  parks: [],
  trees: [],
}

let section = ''
let entity = null
let layer = ''
let closed = false
let points = []
let pendingX = null
let insertX = null
let minX = Infinity
let minY = Infinity
let maxX = -Infinity
let maxY = -Infinity

function touch(x, y) {
  if (x < minX) minX = x
  if (x > maxX) maxX = x
  if (y < minY) minY = y
  if (y > maxY) maxY = y
}

function flush() {
  if (entity === 'INSERT' && layer === 'TPX_VEGETATION_TREES_INDIVIDUAL' && insertX != null) {
    return
  }
  const spec = wanted[layer]
  if (entity === 'LWPOLYLINE' && spec && points.length >= 2) {
    const simplified = roundPts(rdp(points, spec.epsilon))
    if (simplified.length >= 2) {
      map[spec.key].push({
        closed: spec.closed || closed,
        points: simplified,
      })
      for (const [x, y] of simplified) touch(x, y)
    }
  }
  points = []
  pendingX = null
  closed = false
  insertX = null
}

while (o + 2 <= buf.length) {
  const code = buf.readInt16LE(o)
  o += 2
  const value = readVal(code)
  if (code === 0 && value === 'SECTION') {
    entity = 'SECTION'
    continue
  }
  if (code === 2 && entity === 'SECTION') {
    section = value
    entity = null
    continue
  }
  if (code === 0 && value === 'ENDSEC') {
    flush()
    section = ''
    entity = null
    continue
  }
  if (section !== 'ENTITIES') continue
  if (code === 0) {
    flush()
    entity = value
    layer = ''
    continue
  }
  if (code === 8) layer = value
  if (code === 70 && entity === 'LWPOLYLINE') closed = Boolean(value & 1)
  if (code === 10) {
    pendingX = value
    if (entity === 'INSERT') insertX = value
  }
  if (code === 20 && pendingX != null) {
    if (entity === 'INSERT' && layer === 'TPX_VEGETATION_TREES_INDIVIDUAL') {
      const x = Math.round(pendingX * 10) / 10
      const y = Math.round(value * 10) / 10
      map.trees.push([x, y])
      touch(x, y)
    } else {
      points.push([pendingX, value])
    }
    pendingX = null
  }
}
flush()

const out = {
  bounds: { minX, minY, maxX, maxY },
  ...map,
}

const dest = path.join(root, 'src/minimapData.json')
fs.writeFileSync(dest, JSON.stringify(out))
console.log({
  dest,
  kb: Math.round(fs.statSync(dest).size / 1024),
  buildings: map.buildings.length,
  roads: map.roads.length,
  water: map.water.length,
  parks: map.parks.length,
  trees: map.trees.length,
  bounds: out.bounds,
})
