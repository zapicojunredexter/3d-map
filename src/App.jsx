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
import { collidableMeshes, mergeWorldByLayer, solidMeshes } from './mergeWorld'
import { headingFromForward } from './minimapMath'
import Minimap from './Minimap'
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

  render() {
    if (this.state.error) {
      return (
        <Html center>
          <div className="model-error" role="alert">
            <strong>Map model not found</strong>
            <span>
              Add <code>topoexport_3D_modeling.glb</code> to{' '}
              <code>assets</code>, then reload.
            </span>
          </div>
        </Html>
      )
    }

    return this.props.children
  }
}

function WorldModel({ worldRef, collidersRef, solidsRef, placementRef }) {
  const { scene } = useGLTF(MODEL_URL)

  const model = useMemo(() => {
    const merged = mergeWorldByLayer(scene)
    const placement = calculateModelPlacement(merged)

    for (const child of merged.children) {
      child.material = child.material.clone()
      if (child.isMesh) child.material.envMapIntensity = 0.65
    }

    return {
      object: merged,
      colliders: collidableMeshes(merged),
      solids: solidMeshes(merged),
      placement,
    }
  }, [scene])

  useEffect(() => {
    if (placementRef) placementRef.current = model.placement
    if (collidersRef) collidersRef.current = model.colliders
    if (solidsRef) solidsRef.current = model.solids
  }, [collidersRef, model, placementRef, solidsRef])

  return (
    <group ref={worldRef}>
      <group position={model.placement.position}>
        <group rotation={model.placement.rotation}>
          <primitive object={model.object} />
        </group>
      </group>
    </group>
  )
}

function ExplorerControls({ collidersRef, solidsRef, onLockedChange, poseRef }) {
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
    const solids = solidsRef.current
    if (!solids) return true
    origin.set(x, groundY + PLAYER.eyeHeight, z)
    raycaster.far = PLAYER.skyClearance
    raycaster.firstHitOnly = true
    raycaster.set(origin, up)
    return raycaster.intersectObjects(solids, false).length === 0
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
  })

  return (
    <PointerLockControls
      ref={controlsRef}
      onLock={() => onLockedChange(true)}
      onUnlock={() => onLockedChange(false)}
    />
  )
}

function Scene({ onLockedChange, poseRef, placementRef }) {
  const worldRef = useRef()
  const collidersRef = useRef(null)
  const solidsRef = useRef(null)

  return (
    <>
      <color attach="background" args={['#6d8f9c']} />
      <fog attach="fog" args={['#6d8f9c', 250, 1100]} />
      <ambientLight intensity={0.9} />
      <directionalLight
        castShadow
        intensity={2.2}
        position={[80, 160, 40]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={400}
        shadow-camera-left={-160}
        shadow-camera-right={160}
        shadow-camera-top={160}
        shadow-camera-bottom={-160}
      />
      <ModelErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
          <Bvh firstHitOnly>
            <WorldModel
              worldRef={worldRef}
              collidersRef={collidersRef}
              solidsRef={solidsRef}
              placementRef={placementRef}
            />
          </Bvh>
          <Environment preset="park" />
        </Suspense>
      </ModelErrorBoundary>
      <ExplorerControls
        collidersRef={collidersRef}
        solidsRef={solidsRef}
        onLockedChange={onLockedChange}
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
  const poseRef = useRef({ x: 0, z: 0, heading: 0 })
  const placementRef = useRef(null)

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
          onLockedChange={setLocked}
          poseRef={poseRef}
          placementRef={placementRef}
        />
      </Canvas>

      <header className="brand">
        <span className="eyebrow">TopoExport / Field view</span>
        <h1>Terrain Explorer</h1>
      </header>

      {!locked && (
        <button
          className="enter"
          type="button"
          onClick={() => document.querySelector('canvas')?.requestPointerLock()}
        >
          <span>Enter the map</span>
          <small>Click to look around</small>
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
          <span>Mouse to look · Shift sprint · Space jump · R reset</span>
        </div>
      </aside>

      <Minimap poseRef={poseRef} placementRef={placementRef} />
      {locked && <Crosshair />}
      <div className="vignette" aria-hidden="true" />
    </main>
  )
}

useGLTF.preload(MODEL_URL)
