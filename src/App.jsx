import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Bvh,
  Environment,
  Html,
  PointerLockControls,
  useGLTF,
  useProgress,
} from '@react-three/drei'
import * as THREE from 'three'
import {
  PLAYER,
  applyGravityAndGround,
  createPlayerState,
  findSpawn,
  moveWithCollisions,
  spawnSearchOffsets,
} from './player'
import { calculateModelPlacement, isRoadSurface } from './world'
import {
  collidableMeshes,
  pickFeature,
  mergeWorldByLayer,
  solidMeshes,
} from './mergeWorld'
import { applySurfaces } from './surfaces'
import { canopyTest, treePlacements } from './treeInstances'
import {
  BUILDINGS_LAYER,
  DEFAULT_BUILDING_STYLE,
  HOUSES_STYLE,
  advanceBuildingHighlight,
  applyBuildingStyle,
  setBuildingHighlight,
} from './buildingStyles'
import Trees from './Trees'
import Houses from './Houses'
import { buildingPlacements } from './houseInstances'
import { headingFromForward } from './minimapMath'
import { currentDecimalHour } from './timeOfDay'
import Minimap from './Minimap'
import Atmosphere from './Atmosphere'
import FeatureLabel from './FeatureLabel'
import SettingsPanel from './SettingsPanel'
import modelUrl from '../assets/topoexport_3D_modeling.glb?url'

export const MODEL_URL = modelUrl

function LoadingScreen() {
  const { progress } = useProgress()

  return (
    <Html center>
      <div className="loader" role="status">
        <span>Loading terrain</span>
        <strong>{Math.round(progress)}%</strong>
      </div>
    </Html>
  )
}

class ModelErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('World load failed:', error)
  }

  render() {
    if (this.state.error) {
      const detail = this.state.error?.message || String(this.state.error)
      return (
        <Html center>
          <div className="model-error" role="alert">
            <strong>World failed to load</strong>
            <span>{detail}</span>
          </div>
        </Html>
      )
    }

    return this.props.children
  }
}

function WorldModel({
  worldRef,
  collidersRef,
  solidsRef,
  canopyRef,
  placementRef,
  buildingStyle,
  highlight,
}) {
  const { scene } = useGLTF(MODEL_URL)
  const gl = useThree((state) => state.gl)

  const model = useMemo(() => {
    // The export's trees are trunk-and-blob placeholders. Trees draws a real
    // model at each of their positions instead, so they never reach the city.
    const merged = mergeWorldByLayer(scene, {
      skip: ['TPX_Trees'],
      identify: ['TPX_Buildings'],
    })
    const placement = calculateModelPlacement(merged)

    for (const child of merged.children) {
      child.material = child.material.clone()
      if (child.isMesh) child.material.envMapIntensity = 0.65
    }
    applySurfaces(merged, {
      anisotropy: gl.capabilities.getMaxAnisotropy(),
    })

    const blocks = merged.children.find(
      (child) => child.isMesh && child.name === BUILDINGS_LAYER,
    )

    return {
      object: merged,
      colliders: collidableMeshes(merged),
      solids: solidMeshes(merged),
      trees: treePlacements(scene, placement),
      buildings: buildingPlacements(blocks, placement),
      placement,
    }
  }, [gl, scene])

  useEffect(() => {
    if (placementRef) placementRef.current = model.placement
    if (collidersRef) collidersRef.current = model.colliders
    if (solidsRef) solidsRef.current = model.solids
    if (canopyRef) canopyRef.current = canopyTest(model.trees)
  }, [canopyRef, collidersRef, model, placementRef, solidsRef])

  useEffect(() => {
    applyBuildingStyle(model.object, buildingStyle)
  }, [buildingStyle, model])

  // Declared after the style effect so it runs second and re-pushes the pick
  // onto the material a style switch just replaced.
  useEffect(() => {
    setBuildingHighlight(model.object, highlight)
  }, [buildingStyle, highlight, model])

  useFrame((state, delta) => advanceBuildingHighlight(model.object, delta))

  return (
    <group ref={worldRef}>
      <Bvh firstHitOnly>
        <group position={model.placement.position}>
          <group rotation={model.placement.rotation}>
            <primitive object={model.object} />
          </group>
        </group>
      </Bvh>
      <Trees placements={model.trees} />
      {/* Its own boundary, so switching looks never drops the city back to the
          loading screen while the house model arrives. */}
      {buildingStyle === HOUSES_STYLE && (
        <Suspense fallback={null}>
          <Houses placements={model.buildings} highlight={highlight} />
        </Suspense>
      )}
    </group>
  )
}

// How far down the crosshair a building will still name itself, and how often
// that ray is worth casting. Every frame would be wasted work for a label a
// reader cannot follow that fast.
const AIM_RANGE = 120
const AIM_INTERVAL = 0.1

function ExplorerControls({
  collidersRef,
  solidsRef,
  canopyRef,
  onLockedChange,
  onAimChange,
  poseRef,
}) {
  const { camera } = useThree()
  const controlsRef = useRef()
  const player = useRef(createPlayerState())
  const placed = useRef(false)
  const aimed = useRef(false)
  const keys = useRef(new Set())
  const raycaster = useMemo(() => {
    const next = new THREE.Raycaster()
    next.firstHitOnly = true
    return next
  }, [])
  const forward = useMemo(() => new THREE.Vector3(), [])
  const aim = useMemo(() => new THREE.Vector3(), [])
  const aimedSlot = useRef(null)
  const aimTimer = useRef(0)
  const right = useMemo(() => new THREE.Vector3(), [])
  const wish = useMemo(() => new THREE.Vector3(), [])
  const down = useMemo(() => new THREE.Vector3(0, -1, 0), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const origin = useMemo(() => new THREE.Vector3(), [])

  const pickGround = (x, z, fromY) => {
    const colliders = collidersRef.current
    if (!colliders) return null
    origin.set(x, fromY, z)
    raycaster.far = fromY + 200
    raycaster.firstHitOnly = true
    raycaster.set(origin, down)
    return raycaster.intersectObjects(colliders, false)[0] ?? null
  }

  const castWall = (from, direction, far) => {
    const colliders = collidersRef.current
    if (!colliders) return null
    raycaster.far = far
    let closest = null

    for (const height of [0.4, 0.95, PLAYER.eyeHeight - 0.15]) {
      origin.set(from.x, from.y - PLAYER.eyeHeight + height, from.z)
      raycaster.firstHitOnly = true
      raycaster.set(origin, direction)
      const hit = raycaster.intersectObjects(colliders, false)[0]
      if (hit && (!closest || hit.distance < closest.distance)) closest = hit
    }

    return closest
  }

  const standAt = (x, z, groundY) => {
    aimed.current = false
    player.current = createPlayerState(x, z)
    if (groundY != null) {
      player.current.position.y = groundY + PLAYER.eyeHeight
      player.current.grounded = true
    }
    camera.position.copy(player.current.position)
  }

  const hasHeadroom = (x, z, groundY) => {
    // Crowns are instanced rather than part of the scene's raycast targets, so
    // the planting points answer for them.
    if (canopyRef?.current?.(x, z)) return false

    const solids = solidsRef.current
    if (!solids) return true
    origin.set(x, groundY + PLAYER.eyeHeight, z)
    raycaster.far = PLAYER.skyClearance
    raycaster.firstHitOnly = true
    raycaster.set(origin, up)
    return raycaster.intersectObjects(solids, false).length === 0
  }

  // Whatever the crosshair is resting on, named if that surface has an
  // identity. Casting against every collider rather than just the buildings is
  // what makes a wall in the way hide the building behind it.
  const aimedAt = () => {
    const colliders = collidersRef.current
    if (!colliders) return null
    camera.getWorldDirection(aim)
    raycaster.far = AIM_RANGE
    raycaster.firstHitOnly = true
    raycaster.set(camera.position, aim)
    return pickFeature(raycaster.intersectObjects(colliders, false)[0])
  }

  // The topmost surface in a column has open sky, so a road there is walkable.
  const probeColumn = (x, z) => {
    const top = pickGround(x, z, PLAYER.probeHeight)
    if (!top) return null
    return { groundY: top.point.y, road: isRoadSurface(top.object) }
  }

  const resetPlayer = () => {
    const spot = findSpawn(spawnSearchOffsets(), probeColumn, hasHeadroom)
    if (spot) standAt(spot.x, spot.z, spot.groundY)
    else standAt(0, 0, null)
  }

  useEffect(() => {
    camera.position.copy(player.current.position)

    const onKeyDown = (event) => {
      if (event.code === 'Space') event.preventDefault()
      keys.current.add(event.code)
      if (event.code === 'Space') player.current.jumpRequested = true
      if (event.code === 'KeyR') resetPlayer()
    }
    const onKeyUp = (event) => keys.current.delete(event.code)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [camera])

  useFrame((_, delta) => {
    if (!collidersRef.current) return

    if (!placed.current) {
      resetPlayer()
      placed.current = true
      return
    }

    const dt = Math.min(delta, 0.05)
    const state = player.current
    if (state.position.y < -20) {
      resetPlayer()
      return
    }
    const locked = Boolean(controlsRef.current?.isLocked)
    const pressed = keys.current

    if (locked) {
      const forwardInput =
        Number(pressed.has('KeyW')) - Number(pressed.has('KeyS'))
      const sideInput =
        Number(pressed.has('KeyD')) - Number(pressed.has('KeyA'))

      camera.getWorldDirection(forward)
      forward.y = 0
      if (forward.lengthSq() > 0) forward.normalize()
      right.crossVectors(forward, camera.up).normalize()
      wish
        .set(0, 0, 0)
        .addScaledVector(forward, forwardInput)
        .addScaledVector(right, sideInput)

      if (wish.lengthSq() > 0) {
        const speed = pressed.has('ShiftLeft') ? PLAYER.sprintSpeed : PLAYER.walkSpeed
        const next = moveWithCollisions(
          state.position,
          wish.normalize().multiplyScalar(speed * dt),
          PLAYER.radius,
          castWall,
        )
        state.position.x = next.x
        state.position.z = next.z
      }
    }

    const probeY = Math.max(state.position.y + 0.5, PLAYER.eyeHeight + 0.5)
    const ground = pickGround(state.position.x, state.position.z, probeY)
    applyGravityAndGround(state, dt, ground ? ground.point.y : null)
    camera.position.copy(state.position)
    if (state.grounded && !aimed.current) {
      camera.lookAt(state.position.x, state.position.y, state.position.z - 10)
      aimed.current = true
    }

    if (poseRef) {
      camera.getWorldDirection(forward)
      poseRef.current = {
        x: state.position.x,
        z: state.position.z,
        heading: headingFromForward(forward.x, forward.z),
      }
    }

    if (onAimChange) {
      aimTimer.current += dt
      if (aimTimer.current >= AIM_INTERVAL) {
        aimTimer.current = 0
        const found = aimedAt()
        // The slot, not the object: aimedAt builds a fresh one every probe, so
        // identity would report a change every tick and re-render React.
        const slot = found?.slot ?? null
        if (slot !== aimedSlot.current) {
          aimedSlot.current = slot
          onAimChange(found)
        }
      }
    }
  })

  return (
    <PointerLockControls
      ref={controlsRef}
      onLock={() => onLockedChange(true)}
      onUnlock={() => onLockedChange(false)}
    />
  )
}

function Scene({
  hour,
  buildingStyle,
  highlight,
  onLockedChange,
  onAimChange,
  poseRef,
  placementRef,
}) {
  const worldRef = useRef()
  const collidersRef = useRef(null)
  const solidsRef = useRef(null)
  const canopyRef = useRef(null)

  return (
    <>
      <Atmosphere hour={hour} />
      <ModelErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
          <WorldModel
            worldRef={worldRef}
            collidersRef={collidersRef}
            solidsRef={solidsRef}
            canopyRef={canopyRef}
            placementRef={placementRef}
            buildingStyle={buildingStyle}
            highlight={highlight}
          />
          <Environment preset="park" />
        </Suspense>
      </ModelErrorBoundary>
      <ExplorerControls
        collidersRef={collidersRef}
        solidsRef={solidsRef}
        canopyRef={canopyRef}
        onLockedChange={onLockedChange}
        onAimChange={onAimChange}
        poseRef={poseRef}
      />
    </>
  )
}

function Crosshair() {
  return <div className="crosshair" aria-hidden="true" />
}

export default function App() {
  const [locked, setLocked] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aimedFeature, setAimedFeature] = useState(null)
  const [buildingStyle, setBuildingStyle] = useState(DEFAULT_BUILDING_STYLE)
  const [hour, setHour] = useState(() => currentDecimalHour())
  const hasEnteredRef = useRef(false)
  const poseRef = useRef({ x: 0, z: 0, heading: 0 })
  const placementRef = useRef(null)
  const requestPointerLock = () =>
    document.querySelector('canvas')?.requestPointerLock()

  const handleLockedChange = (nextLocked) => {
    setLocked(nextLocked)
    if (nextLocked) {
      hasEnteredRef.current = true
      setSettingsOpen(false)
    } else if (hasEnteredRef.current) {
      setSettingsOpen(true)
    }
  }

  return (
    <main>
      <Canvas
        shadows
        camera={{
          fov: 72,
          near: 0.12,
          far: 2500,
          position: [0, PLAYER.spawnHeight, 0],
        }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Scene
          hour={hour}
          buildingStyle={buildingStyle}
          highlight={aimedFeature?.slot ?? null}
          onLockedChange={handleLockedChange}
          onAimChange={setAimedFeature}
          poseRef={poseRef}
          placementRef={placementRef}
        />
      </Canvas>

      <header className="brand">
        <span className="eyebrow">TopoExport / Field view</span>
        <h1>Terrain Explorer</h1>
      </header>

      {!locked && !settingsOpen && (
        <button
          className="enter"
          type="button"
          onClick={requestPointerLock}
        >
          <span>Enter the map</span>
          <small>Click to look around · Esc opens settings</small>
        </button>
      )}

      <aside className="controls" aria-label="Controls">
        <div className="key-grid" aria-hidden="true">
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd>
        </div>
        <div>
          <strong>Move</strong>
          <span>
            Mouse look · Shift sprint · Space jump · R reset · Esc pause/settings
          </span>
        </div>
      </aside>

      {settingsOpen && (
        <SettingsPanel
          hour={hour}
          onHourChange={setHour}
          buildingStyle={buildingStyle}
          onBuildingStyleChange={setBuildingStyle}
          onResume={requestPointerLock}
        />
      )}
      <Minimap poseRef={poseRef} placementRef={placementRef} />
      {locked && <Crosshair />}
      {locked && <FeatureLabel id={aimedFeature?.name ?? null} />}
      <div className="vignette" aria-hidden="true" />
    </main>
  )
}

useGLTF.preload(MODEL_URL)
