import { useEffect, useMemo, useRef } from 'react'
import mapData from './minimapData.json'
import {
  MINIMAP_RANGE,
  headingFromForward,
  minimapScale,
  worldToPlan,
} from './minimapMath'
import { buildFeatureIndex, queryFeatureIndex } from './minimapIndex'

const SIZE = 176
const RING = SIZE / 2 - 6
// Corner-to-corner reach of the rotating view square.
const QUERY_RADIUS = MINIMAP_RANGE * Math.SQRT2
const FRAME_MS = 1000 / 30

const LAYERS = [
  { key: 'parks', fill: '#4f7d3a' },
  { key: 'water', fill: '#3d8fb8', stroke: '#3d8fb8', lineWidth: 3.5 },
  { key: 'roads', fill: '#4a4f4c', stroke: '#9aa39a', lineWidth: 0.8 },
  { key: 'buildings', fill: '#d8d3c8', stroke: '#8f8a80', lineWidth: 0.35 },
]

function drawFeatures(ctx, features, layer) {
  ctx.beginPath()
  for (const feature of features) {
    const points = feature.points
    ctx.moveTo(points[0][0], points[0][1])
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index][0], points[index][1])
    }
    if (feature.closed) ctx.closePath()
  }

  if (layer.fill) {
    ctx.fillStyle = layer.fill
    ctx.fill()
  }
  if (layer.stroke) {
    ctx.strokeStyle = layer.stroke
    ctx.lineWidth = layer.lineWidth
    ctx.stroke()
  }
}

function drawTrees(ctx, trees) {
  ctx.fillStyle = '#2f6a28'
  ctx.beginPath()
  for (const tree of trees) {
    const [x, y] = tree.points[0]
    ctx.moveTo(x + 1.6, y)
    ctx.arc(x, y, 1.6, 0, Math.PI * 2)
  }
  ctx.fill()
}

function drawPlayer(ctx) {
  ctx.beginPath()
  ctx.moveTo(SIZE / 2, SIZE / 2 - 18)
  ctx.lineTo(SIZE / 2 - 8, SIZE / 2 + 3)
  ctx.lineTo(SIZE / 2, SIZE / 2 + 2)
  ctx.lineTo(SIZE / 2 + 8, SIZE / 2 + 3)
  ctx.closePath()
  ctx.fillStyle = '#5ad0ff'
  ctx.fill()
  ctx.strokeStyle = '#041018'
  ctx.lineWidth = 0.5
  ctx.lineJoin = 'round'
  ctx.stroke()
}

function drawChrome(ctx, heading) {
  ctx.strokeStyle = '#d4e56f'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE / 2, RING, 0, Math.PI * 2)
  ctx.stroke()

  drawPlayer(ctx)

  const radius = SIZE / 2 - 14
  ctx.fillStyle = '#d4e56f'
  ctx.font = "500 11px 'DM Mono', monospace"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    'N',
    SIZE / 2 - radius * Math.sin(heading),
    SIZE / 2 - radius * Math.cos(heading),
  )
}

export default function Minimap({ poseRef, placementRef }) {
  const canvasRef = useRef(null)
  const indexes = useMemo(
    () => ({
      parks: buildFeatureIndex(mapData.parks),
      water: buildFeatureIndex(mapData.water),
      roads: buildFeatureIndex(mapData.roads),
      buildings: buildFeatureIndex(mapData.buildings),
      trees: buildFeatureIndex(
        mapData.trees.map((point) => ({ points: [point] })),
      ),
    }),
    [],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = SIZE * ratio
    canvas.height = SIZE * ratio
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)

    let frame = 0
    let lastDraw = 0

    const scale = minimapScale(MINIMAP_RANGE, SIZE)

    const draw = (planX, planY, heading) => {
      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.save()
      ctx.beginPath()
      ctx.arc(SIZE / 2, SIZE / 2, RING, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = '#1a2420'
      ctx.fillRect(0, 0, SIZE, SIZE)

      ctx.save()
      ctx.translate(SIZE / 2, SIZE / 2)
      ctx.rotate(-heading)
      ctx.scale(scale, -scale)
      ctx.translate(-planX, -planY)
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      for (const layer of LAYERS) {
        const features = queryFeatureIndex(
          indexes[layer.key],
          planX,
          planY,
          QUERY_RADIUS,
        )
        if (features.length) drawFeatures(ctx, features, layer)
      }

      const trees = queryFeatureIndex(
        indexes.trees,
        planX,
        planY,
        QUERY_RADIUS,
      )
      if (trees.length) drawTrees(ctx, trees)
      ctx.restore()
      ctx.restore()

      drawChrome(ctx, heading)
    }

    const tick = (now) => {
      frame = requestAnimationFrame(tick)
      const pose = poseRef.current
      const placement = placementRef.current
      if (!pose || !placement || now - lastDraw < FRAME_MS) return

      lastDraw = now
      const plan = worldToPlan(pose.x, pose.z, placement)
      draw(plan.x, plan.y, pose.heading ?? headingFromForward(0, -1))
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [indexes, placementRef, poseRef])

  return (
    <div className="minimap" aria-label="Minimap">
      <canvas className="minimap-canvas" ref={canvasRef} />
    </div>
  )
}
