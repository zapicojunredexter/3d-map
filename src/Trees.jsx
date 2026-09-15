import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { buildTrees, normalizeTreeModel } from './treeInstances'
import { TREE_CATALOG, TREE_MODEL_URLS } from './treeCatalog'

export { TREE_CATALOG, TREE_MODEL_URLS }
export const TREE_MODEL_URL = TREE_MODEL_URLS[0]

// Deliberately outside the city's <Bvh>: these are decoration, nothing raycasts
// against them, and a bounds tree per instanced cell would only cost time.
export default function Trees({ placements }) {
  const gltfs = useGLTF(TREE_MODEL_URLS)
  const models = useMemo(
    () =>
      TREE_CATALOG.map((entry, index) =>
        normalizeTreeModel(gltfs[index].scene, entry),
      ),
    [gltfs],
  )
  const trees = useMemo(
    () => buildTrees(models, placements),
    [models, placements],
  )

  return <primitive object={trees} />
}

for (const url of TREE_MODEL_URLS) useGLTF.preload(url)
