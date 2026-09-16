import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  FIREFLY_COLOR,
  FIREFLY_COUNT,
  FIREFLY_LIGHT_COLOR,
  FIREFLY_LIGHT_COUNT,
  FIREFLY_LIGHT_DECAY,
  FIREFLY_LIGHT_DISTANCE,
  FIREFLY_SIZE,
  applyFireflyPulseShader,
  createFireflyField,
  createFireflyGlowTexture,
  fireflyLightIndices,
  fireflyLightIntensity,
  fireflyPulse,
} from './fireflyField'

// Additive dots plus a handful of real point lights so nearby ground glows.
export default function Fireflies({ strength = 0 }) {
  const points = useRef()
  const lightRefs = useRef([])
  const { camera } = useThree()
  const field = useMemo(() => createFireflyField(FIREFLY_COUNT), [])
  const homes = useMemo(() => field.positions.slice(), [field])
  const lightHosts = useMemo(
    () => fireflyLightIndices(field.count, FIREFLY_LIGHT_COUNT),
    [field],
  )
  const glowMap = useMemo(() => createFireflyGlowTexture(), [])
  const pulseAttr = useMemo(() => new Float32Array(field.count).fill(1), [field])
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(field.positions.slice(), 3),
    )
    geo.setAttribute('aPulse', new THREE.BufferAttribute(pulseAttr, 1))
    return geo
  }, [field, pulseAttr])
  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      color: FIREFLY_COLOR,
      map: glowMap,
      alphaMap: glowMap,
      size: FIREFLY_SIZE,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 0,
    })
    return applyFireflyPulseShader(mat)
  }, [glowMap])

  useFrame((state) => {
    if (!points.current) return
    const visible = strength > 0.02
    points.current.visible = visible
    const lights = lightRefs.current
    for (let L = 0; L < lights.length; L += 1) {
      const light = lights[L]
      if (light) light.visible = visible
    }
    if (!visible) return

    const time = state.clock.elapsedTime
    material.opacity = Math.min(1, strength)
    const positions = geometry.attributes.position.array
    const pulses = geometry.attributes.aPulse.array
    const { phases, count, radius, heightMin, heightMax } = field
    const cx = camera.position.x
    const cy = camera.position.y
    const cz = camera.position.z
    const radiusSq = radius * radius

    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3
      const i5 = i * 5
      const phase = phases[i5]
      const speed = phases[i5 + 1]
      const bob = phases[i5 + 2]
      const twinkle = phases[i5 + 3]
      const pulseSpeed = phases[i5 + 4]

      let hx = homes[i3]
      let hy = homes[i3 + 1]
      let hz = homes[i3 + 2]

      let dx = hx - cx
      let dz = hz - cz
      if (dx * dx + dz * dz > radiusSq) {
        const angle = Math.atan2(dz, dx) + Math.PI
        const dist = radius * (0.35 + (i % 7) * 0.08)
        hx = cx + Math.cos(angle) * dist
        hz = cz + Math.sin(angle) * dist
        hy =
          cy -
          1.2 +
          heightMin +
          ((i * 17) % 100) * 0.01 * (heightMax - heightMin)
        homes[i3] = hx
        homes[i3 + 1] = hy
        homes[i3 + 2] = hz
      }

      const localY = hy - (cy - 1.6)
      if (localY < heightMin) {
        hy += heightMin - localY
        homes[i3 + 1] = hy
      } else if (localY > heightMax) {
        hy -= localY - heightMax
        homes[i3 + 1] = hy
      }

      const glow = fireflyPulse(time, phase, pulseSpeed)
      pulses[i] = glow

      // Gentle drift; glow pulse does the breathing, not fast position jitter.
      const sway = 0.9 + 0.1 * Math.sin(time * twinkle + phase)
      positions[i3] = hx + Math.cos(time * speed + phase) * 0.55 * sway
      positions[i3 + 1] =
        hy + Math.sin(time * (speed * 1.4) + phase * 2.1) * bob * sway
      positions[i3 + 2] = hz + Math.sin(time * speed * 0.87 + phase) * 0.55 * sway
    }

    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aPulse.needsUpdate = true

    // Ride a few bugs with real lights so foliage/ground catch the pulse.
    for (let L = 0; L < lightHosts.length; L += 1) {
      const light = lights[L]
      if (!light) continue
      const i = lightHosts[L]
      const i3 = i * 3
      light.position.set(positions[i3], positions[i3 + 1], positions[i3 + 2])
      light.intensity = fireflyLightIntensity(strength, pulses[i])
    }
  })

  return (
    <group>
      <points
        ref={points}
        geometry={geometry}
        material={material}
        frustumCulled={false}
      />
      {lightHosts.map((_, i) => (
        <pointLight
          key={i}
          ref={(node) => {
            lightRefs.current[i] = node
          }}
          color={FIREFLY_LIGHT_COLOR}
          intensity={0}
          distance={FIREFLY_LIGHT_DISTANCE}
          decay={FIREFLY_LIGHT_DECAY}
          castShadow={false}
        />
      ))}
    </group>
  )
}
