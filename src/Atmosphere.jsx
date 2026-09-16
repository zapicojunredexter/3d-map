import { useFrame, useThree } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState } from 'react'
import { atmosphereAt } from './timeOfDay'
import { canUseTorch, torchIsLit } from './nightLighting'
import PlayerTorch from './PlayerTorch'
import Fireflies from './Fireflies'

const vertexShader = `
  varying vec3 vDirection;

  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  varying vec3 vDirection;

  void main() {
    vec3 direction = normalize(vDirection);
    float heightMix = smoothstep(-0.12, 0.82, direction.y);
    vec3 color = mix(horizonColor, topColor, heightMix);

    float sunCore = pow(max(dot(direction, sunDirection), 0.0), 700.0);
    float sunGlow = pow(max(dot(direction, sunDirection), 0.0), 24.0);
    color += sunColor * (sunCore * 1.2 + sunGlow * 0.16);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export default function Atmosphere({ hour }) {
  const skyRef = useRef()
  const { camera, gl, scene } = useThree()
  const [torchEnabled, setTorchEnabled] = useState(true)
  const mood = useMemo(() => atmosphereAt(hour), [hour])
  const torchLit = torchIsLit(mood.lanternIntensity, torchEnabled)
  const uniforms = useMemo(
    () => ({
      topColor: { value: new THREE.Color(mood.top) },
      horizonColor: { value: new THREE.Color(mood.horizon) },
      sunColor: { value: new THREE.Color(mood.sun) },
      sunDirection: {
        value: new THREE.Vector3(...mood.sunPosition).normalize(),
      },
    }),
    [mood],
  )

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== 'KeyF' || event.repeat) return
      if (event.target?.closest?.('input, textarea, select, [contenteditable]')) {
        return
      }
      if (!canUseTorch(mood.lanternIntensity)) return
      event.preventDefault()
      setTorchEnabled((on) => !on)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mood.lanternIntensity])

  useEffect(() => {
    // Extra exposure only while the hand torch is actually lit.
    const torchBoost = torchLit ? 0.22 : 0
    gl.toneMappingExposure = mood.exposure + torchBoost
    scene.environmentIntensity = mood.environmentIntensity
  }, [gl, mood, scene, torchLit])

  useFrame(() => {
    if (skyRef.current) skyRef.current.position.copy(camera.position)
  })

  const fogNear = 120 + mood.environmentIntensity * 180
  const fogFar = 500 + mood.environmentIntensity * 900

  return (
    <>
      <color attach="background" args={[mood.top]} />
      <fog attach="fog" args={[mood.fog, fogNear, fogFar]} />

      <mesh ref={skyRef} scale={1800} frustumCulled={false} renderOrder={-1000}>
        <sphereGeometry args={[1, 32, 20]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>

      {mood.stars > 0.01 && (
        <Stars
          radius={900}
          depth={80}
          count={1400}
          factor={2}
          saturation={0.25}
          fade
          speed={0.15}
          opacity={mood.stars}
        />
      )}

      <hemisphereLight
        color={mood.ambient}
        groundColor={mood.ground}
        intensity={mood.ambientIntensity}
      />
      <directionalLight
        castShadow
        color={mood.sun}
        intensity={mood.sunIntensity}
        position={mood.sunPosition}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={400}
        shadow-camera-left={-160}
        shadow-camera-right={160}
        shadow-camera-top={160}
        shadow-camera-bottom={-160}
      />

      <PlayerTorch
        active={torchLit}
        strength={mood.lanternIntensity}
        color={mood.lanternColor}
      />
      <Fireflies strength={mood.lanternIntensity} />
    </>
  )
}
