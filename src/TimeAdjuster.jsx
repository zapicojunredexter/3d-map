import { atmosphereAt, currentDecimalHour, formatHour } from './timeOfDay'

export default function TimeAdjuster({ hour, onChange }) {
  const mood = atmosphereAt(hour)

  return (
    <section className="time-adjuster" aria-label="Time of day">
      <div className="time-adjuster__heading">
        <div>
          <span>Time of day</span>
          <strong>{formatHour(hour)}</strong>
        </div>
        <span className="time-adjuster__period">{mood.name}</span>
      </div>

      <input
        aria-label="Time of day"
        type="range"
        min="0"
        max={1439 / 60}
        step={1 / 60}
        value={hour}
        onChange={(event) => onChange(Number(event.target.value))}
      />

      <div className="time-adjuster__footer">
        <span>00:00</span>
        <button type="button" onClick={() => onChange(currentDecimalHour())}>
          Use current time
        </button>
        <span>24:00</span>
      </div>
    </section>
  )
}
