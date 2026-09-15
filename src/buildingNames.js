// TopoExport numbers every building node, and those numbers are stable as long
// as the export is not regenerated, so they work as keys. Add entries here to
// give a block a real name; anything unlisted falls back to showing its id.
//
//   'TPX_Buildings_412': 'Barangay Hall',
export const BUILDING_NAMES = {
  'TPX_Buildings_1555': 'Parian Drop-in Center'
}

export function labelFor(id, names = BUILDING_NAMES) {
  if (!id) return null
  return names[id] ?? id
}
