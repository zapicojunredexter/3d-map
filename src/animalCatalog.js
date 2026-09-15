// Livestock GLBs under assets/animals/. Tweak herd sizes in ANIMAL_COUNTS —
// total animals on load is the sum of those numbers. Each kind picks a random
// variant from its list so the field does not look stamped.

import sheep1 from '../assets/animals/sheep-ver1.glb?url'
import sheep2 from '../assets/animals/sheep-ver2.glb?url'
import sheep3 from '../assets/animals/sheep-ver3.glb?url'
import bull1 from '../assets/animals/bull-ver1.glb?url'
import bull2 from '../assets/animals/bull-ver2.glb?url'
import bull3 from '../assets/animals/bull-ver3.glb?url'
import deer1 from '../assets/animals/deer-ver1.glb?url'
import deer2 from '../assets/animals/deer-ver2.glb?url'
import deer3 from '../assets/animals/deer-ver3.glb?url'

// Easy knobs: change a count and reload. Keys must match ANIMAL_CATALOG.kind.
export const ANIMAL_COUNTS = {
  sheep: 60 * 20,
  cow: 20 * 20,
  deer: 20 * 20,
}

export const ANIMAL_CATALOG = [
  { id: 'sheep-ver1', kind: 'sheep', url: sheep1 },
  { id: 'sheep-ver2', kind: 'sheep', url: sheep2 },
  { id: 'sheep-ver3', kind: 'sheep', url: sheep3 },
  // Source files are named bull-*; treated as cows in the herd.
  { id: 'bull-ver1', kind: 'cow', url: bull1 },
  { id: 'bull-ver2', kind: 'cow', url: bull2 },
  { id: 'bull-ver3', kind: 'cow', url: bull3 },
  { id: 'deer-ver1', kind: 'deer', url: deer1 },
  { id: 'deer-ver2', kind: 'deer', url: deer2 },
  { id: 'deer-ver3', kind: 'deer', url: deer3 },
]

export const ANIMAL_MODEL_URLS = ANIMAL_CATALOG.map((entry) => entry.url)

export function animalIdsForKind(kind, catalog = ANIMAL_CATALOG) {
  return catalog.filter((entry) => entry.kind === kind).map((entry) => entry.id)
}

export function expandAnimalKinds(counts = ANIMAL_COUNTS) {
  const kinds = []
  for (const [kind, count] of Object.entries(counts)) {
    const n = Math.max(0, Math.floor(Number(count) || 0))
    for (let i = 0; i < n; i += 1) kinds.push(kind)
  }
  return kinds
}
