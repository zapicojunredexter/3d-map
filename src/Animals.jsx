import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { buildAnimals, normalizeAnimalModel } from './animalInstances'
import { ANIMAL_CATALOG, ANIMAL_MODEL_URLS } from './animalCatalog'

export { ANIMAL_CATALOG, ANIMAL_MODEL_URLS, ANIMAL_COUNTS } from './animalCatalog'

// Outside the city BVH: decoration only, nothing raycasts against the herd.
export default function Animals({ placements }) {
  const gltfs = useGLTF(ANIMAL_MODEL_URLS)
  const models = useMemo(
    () =>
      ANIMAL_CATALOG.map((entry, index) =>
        normalizeAnimalModel(gltfs[index].scene, entry),
      ),
    [gltfs],
  )
  const animals = useMemo(
    () => buildAnimals(models, placements),
    [models, placements],
  )

  return <primitive object={animals} />
}

for (const url of ANIMAL_MODEL_URLS) useGLTF.preload(url)
