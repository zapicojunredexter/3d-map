import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { SpecGlossGLTFLoader } from './specGlossLoader'
import { buildTrees, normalizeTreeModel } from './treeInstances'
import treeUrl from '../assets/simple_low_poly_tree.glb?url'

export const TREE_MODEL_URL = treeUrl

// Deliberately outside the city's <Bvh>: these are decoration, nothing raycasts
// against them, and a bounds tree per instanced cell would only cost time.
export default function Trees({ placements }) {
  const gltf = useLoader(SpecGlossGLTFLoader, TREE_MODEL_URL)
  const model = useMemo(() => normalizeTreeModel(gltf.scene), [gltf])
  const trees = useMemo(() => buildTrees(model, placements), [model, placements])

  return <primitive object={trees} />
}
