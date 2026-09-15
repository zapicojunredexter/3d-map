import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { buildGrass, normalizeGrassModel } from './grassInstances'
// import grassUrl from '../assets/grass_green.glb?url'
import grassUrl from '../assets/grass_02.glb?url'

export const GRASS_MODEL_URL = grassUrl

useGLTF.preload(GRASS_MODEL_URL)

// Outside the city's <Bvh>: decoration only, nothing raycasts against clumps.
export default function Grass({ placements }) {
  const { scene } = useGLTF(GRASS_MODEL_URL)
  const model = useMemo(() => normalizeGrassModel(scene), [scene])
  const grass = useMemo(
    () => buildGrass(model, placements),
    [model, placements],
  )

  return <primitive object={grass} />
}
