import { useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { SpecGlossGLTFLoader } from './specGlossLoader'
import {
  advanceTreeAnimations,
  buildAnimatedTrees,
  buildTrees,
  normalizeTreeModel,
  prepareAnimatedTree,
} from './treeInstances'
// import treeUrl from '../assets/simple_low_poly_tree.glb?url'
// import treeUrl from '../assets/birch_tree_-_low_poly.glb?url'
import treeUrl from '../assets/tree.glb?url'

export const TREE_MODEL_URL = treeUrl

// Deliberately outside the city's <Bvh>: these are decoration, nothing raycasts
// against them, and a bounds tree per instanced cell would only cost time.
export default function Trees({ placements }) {
  const gltf = useLoader(SpecGlossGLTFLoader, TREE_MODEL_URL)
  const animated = gltf.animations?.length > 0

  const model = useMemo(
    () =>
      animated
        ? prepareAnimatedTree(gltf.scene)
        : normalizeTreeModel(gltf.scene),
    [animated, gltf],
  )

  const trees = useMemo(
    () =>
      animated
        ? buildAnimatedTrees(model, gltf.animations, placements)
        : buildTrees(model, placements),
    [animated, model, gltf.animations, placements],
  )

  useFrame((state, delta) => {
    if (!animated) return
    advanceTreeAnimations(trees, delta, state.camera.position)
  })

  return <primitive object={trees} />
}
