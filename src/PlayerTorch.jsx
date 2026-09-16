import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
// import torchUrl from '../assets/torch.glb?url'
import torchUrl from '../assets/weekly_challenge_46_fire.glb?url'

import {
  TORCH_BRIGHTNESS,
  TORCH_COLOR,
  TORCH_DECAY,
  TORCH_DISTANCE,
  TORCH_FILL_BRIGHTNESS,
  TORCH_FILL_COLOR,
  TORCH_FILL_DISTANCE,
  TORCH_FILL_OFFSET,
  TORCH_OFFSET,
  TORCH_MODEL_HEIGHT,
  TORCH_MODEL_YAW,
  torchFlicker,
} from './nightLighting'

export const TORCH_MODEL_URL = torchUrl

// Scale the Sketchfab torch down to hand size and sit the grip on the origin
// so the flame tip lines up with the point light.
export function prepareTorchModel(scene) {
  const root = scene.clone(true)
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root)
  const size = bounds.getSize(new THREE.Vector3())
  if (size.y <= 0) return root

  const scale = TORCH_MODEL_HEIGHT / size.y
  const center = bounds.getCenter(new THREE.Vector3())
  root.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
  root.scale.setScalar(scale)
  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = false
      object.receiveShadow = false
      object.frustumCulled = false
    }
  })
  return root
}

function TorchVisual({ active, strength, color }) {
  const { scene, animations } = useGLTF(TORCH_MODEL_URL)
  const model = useMemo(() => prepareTorchModel(scene), [scene])
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model])
  const group = useRef()
  const torchLight = useRef()
  const fillLight = useRef()
  const { camera } = useThree()
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const yaw = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])

  useEffect(() => {
    const actions = animations.map((clip) => {
      const action = mixer.clipAction(clip)
      action.reset().setLoop(THREE.LoopRepeat, Infinity).play()
      return action
    })
    return () => {
      for (const action of actions) action.stop()
      mixer.stopAllAction()
    }
  }, [animations, mixer])

  useLayoutEffect(() => {
    if (torchLight.current) torchLight.current.color.set(color)
  }, [color])

  useFrame((state, delta) => {
    if (!active || !group.current || !torchLight.current || !fillLight.current) {
      return
    }

    mixer.update(delta)
    const flicker = torchFlicker(state.clock.elapsedTime)

    // Follow the view, keep fire upright, face the right-hand grip outward.
    yaw.setFromQuaternion(camera.quaternion)
    group.current.rotation.set(0.22, yaw.y + TORCH_MODEL_YAW, -0.12)

    scratch.set(...TORCH_OFFSET).applyQuaternion(camera.quaternion)
    group.current.position.copy(camera.position).add(scratch)

    torchLight.current.intensity = strength * TORCH_BRIGHTNESS * flicker
    // Flame sits near the top of the scaled model.
    torchLight.current.position.set(0, TORCH_MODEL_HEIGHT * 0.82, 0)

    scratch.set(...TORCH_FILL_OFFSET)
    fillLight.current.position.copy(scratch)
    fillLight.current.intensity =
      strength * TORCH_FILL_BRIGHTNESS * (0.88 + 0.12 * flicker)
  })

  if (!active) return null

  return (
    <group ref={group}>
      <primitive object={model} />
      <pointLight
        ref={torchLight}
        color={color}
        intensity={strength * TORCH_BRIGHTNESS}
        distance={TORCH_DISTANCE}
        decay={TORCH_DECAY}
        castShadow={false}
      />
      <pointLight
        ref={fillLight}
        color={TORCH_FILL_COLOR}
        intensity={strength * TORCH_FILL_BRIGHTNESS}
        distance={TORCH_FILL_DISTANCE}
        decay={TORCH_DECAY}
        castShadow={false}
      />
    </group>
  )
}

// Lives in the scene graph (not parented to the camera). Each frame it is
// placed in front of the view so the ground and nearby walls actually receive
// the light — camera-child lights often contribute nothing in practice.
export default function PlayerTorch({
  active = false,
  strength = 0,
  color = TORCH_COLOR,
}) {
  return (
    <Suspense fallback={null}>
      <TorchVisual active={active} strength={strength} color={color} />
    </Suspense>
  )
}

useGLTF.preload(TORCH_MODEL_URL)
