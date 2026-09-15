import { BUILDING_STYLES } from './buildingStyles'

export default function BuildingStylePicker({ styleId, onChange }) {
  return (
    <section className="style-picker" aria-label="Block style">
      <span className="style-picker__label">Blocks</span>
      <div className="style-picker__options">
        {BUILDING_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            aria-pressed={style.id === styleId}
            onClick={() => onChange(style.id)}
          >
            {style.name}
          </button>
        ))}
      </div>
    </section>
  )
}
