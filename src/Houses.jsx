import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  advanceHouseHighlight,
  buildHouses,
  normalizeHouseModel,
  setHouseHighlight,
} from './houseInstances'
import { HOUSE_CATALOG, HOUSE_MODEL_URLS } from './houseCatalog'

export { HOUSE_CATALOG, HOUSE_MODEL_URLS }
export const HOUSE_MODEL_URL = HOUSE_MODEL_URLS[0]

// Outside the city's <Bvh>, like the trees: the blocks underneath are still the
// raycast target, so nothing needs a bounds tree over the instances.
export default function Houses({ placements, highlight }) {
  const gltfs = useGLTF(HOUSE_MODEL_URLS)
  const models = useMemo(
    () =>
      HOUSE_CATALOG.map((entry, index) =>
        normalizeHouseModel(gltfs[index].scene, entry),
      ),
    [gltfs],
  )
  const houses = useMemo(
    () => buildHouses(models, placements),
    [models, placements],
  )

  useEffect(() => {
    setHouseHighlight(houses, highlight)
  }, [houses, highlight])

  useFrame((state, delta) => advanceHouseHighlight(houses, delta))

  return <primitive object={houses} />
}

for (const url of HOUSE_MODEL_URLS) useGLTF.preload(url)
