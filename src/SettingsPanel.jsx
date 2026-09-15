import BuildingStylePicker from './BuildingStylePicker'
import TimeAdjuster from './TimeAdjuster'

export default function SettingsPanel({
  hour,
  onHourChange,
  buildingStyle,
  onBuildingStyleChange,
  onResume,
}) {
  return (
    <div className="settings-overlay">
      <section
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-panel__heading">
          <div>
            <span>Explorer paused</span>
            <h2 id="settings-title">Settings</h2>
          </div>
          <kbd>Esc</kbd>
        </header>

        <TimeAdjuster hour={hour} onChange={onHourChange} />
        <BuildingStylePicker
          styleId={buildingStyle}
          onChange={onBuildingStyleChange}
        />

        <button className="settings-panel__resume" type="button" onClick={onResume}>
          Resume exploring
        </button>
      </section>
    </div>
  )
}
