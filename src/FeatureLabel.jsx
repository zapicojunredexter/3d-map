import { BUILDING_NAMES, labelFor } from './buildingNames'

// Sits under the crosshair rather than at the hit point in 3D: the reticle is
// always centred, so the label never has to chase a moving projection.
export default function FeatureLabel({ id, names = BUILDING_NAMES }) {
  const label = labelFor(id, names)
  if (!label) return null

  const named = label !== id

  return (
    <div className="feature-label" role="status" aria-live="polite">
      <strong>{label}</strong>
      {named && <span>{id}</span>}
    </div>
  )
}
