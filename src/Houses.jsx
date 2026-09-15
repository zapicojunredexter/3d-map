import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  advanceHouseHighlight,
  buildHouses,
  normalizeHouseModel,
  setHouseHighlight,
} from './houseInstances'
// import houseUrl from '../assets/house.glb?url'
import houseUrl from '../assets/simple_medieval_style_house.glb?url'

export const HOUSE_MODEL_URL = houseUrl

// Outside the city's <Bvh>, like the trees: the blocks underneath are still the
// raycast target, so nothing needs a bounds tree over the instances.
export default function Houses({ placements, highlight }) {
  const { scene } = useGLTF(HOUSE_MODEL_URL)
  const model = useMemo(() => normalizeHouseModel(scene), [scene])
  const houses = useMemo(
    () => buildHouses(model, placements),
    [model, placements],
  )

  useEffect(() => {
    setHouseHighlight(houses, highlight)
  }, [houses, highlight])

  useFrame((state, delta) => advanceHouseHighlight(houses, delta))

  return <primitive object={houses} />
}
