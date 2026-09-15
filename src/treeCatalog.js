import ver1 from '../assets/trees/tree-ver1.glb?url'
import ver2 from '../assets/trees/tree-ver2.glb?url'
import ver3 from '../assets/trees/tree-ver3.glb?url'
import ver4 from '../assets/trees/tree-ver4.glb?url'
import ver5 from '../assets/trees/tree-ver5.glb?url'

export const TREE_CATALOG = [
  { id: 'ver1', url: ver1 },
  { id: 'ver2', url: ver2 },
  { id: 'ver3', url: ver3 },
  { id: 'ver4', url: ver4 },
  { id: 'ver5', url: ver5 },
]

export const TREE_MODEL_URLS = TREE_CATALOG.map((entry) => entry.url)
