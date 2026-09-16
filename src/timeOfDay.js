const DAY_MINUTES = 24 * 60

const STOPS = [
  {
    hour: 0,
    name: 'Night',
    top: '#06111f',
    horizon: '#172238',
    fog: '#101927',
    sun: '#9db7d8',
    ambient: '#263b64',
    ground: '#07100d',
    sunIntensity: 0.08,
    ambientIntensity: 0.28,
    exposure: 0.48,
    stars: 0.9,
    environmentIntensity: 0.12,
  },
  {
    hour: 4.75,
    name: 'Night',
    top: '#081426',
    horizon: '#25314a',
    fog: '#172133',
    sun: '#a9c3df',
    ambient: '#334a75',
    ground: '#101713',
    sunIntensity: 0.08,
    ambientIntensity: 0.3,
    exposure: 0.5,
    stars: 0.85,
    environmentIntensity: 0.14,
  },
  {
    hour: 5.75,
    name: 'Dawn',
    top: '#405b78',
    horizon: '#f19a72',
    fog: '#987c79',
    sun: '#ffae72',
    ambient: '#8c7892',
    ground: '#25231d',
    sunIntensity: 0.65,
    ambientIntensity: 0.52,
    exposure: 0.76,
    stars: 0.2,
    environmentIntensity: 0.3,
  },
  {
    hour: 7,
    name: 'Morning',
    top: '#6f9fc2',
    horizon: '#d9c8a7',
    fog: '#91a6ad',
    sun: '#ffd29a',
    ambient: '#b4c9d2',
    ground: '#384133',
    sunIntensity: 1.45,
    ambientIntensity: 0.72,
    exposure: 0.94,
    stars: 0,
    environmentIntensity: 0.55,
  },
  {
    hour: 12,
    name: 'Midday',
    top: '#438bc2',
    horizon: '#b8d7e2',
    fog: '#83a5b3',
    sun: '#fff3d4',
    ambient: '#c6dfeb',
    ground: '#46523d',
    sunIntensity: 2.2,
    ambientIntensity: 0.9,
    exposure: 1.05,
    stars: 0,
    environmentIntensity: 0.7,
  },
  {
    hour: 16.75,
    name: 'Afternoon',
    top: '#4e82aa',
    horizon: '#e4b083',
    fog: '#a28f83',
    sun: '#ffc17c',
    ambient: '#c3b6b0',
    ground: '#433d31',
    sunIntensity: 1.6,
    ambientIntensity: 0.72,
    exposure: 0.94,
    stars: 0,
    environmentIntensity: 0.5,
  },
  {
    hour: 18.25,
    name: 'Sunset',
    top: '#293f66',
    horizon: '#e96f52',
    fog: '#765b66',
    sun: '#ff875c',
    ambient: '#826d83',
    ground: '#28221e',
    sunIntensity: 0.72,
    ambientIntensity: 0.48,
    exposure: 0.73,
    stars: 0.15,
    environmentIntensity: 0.26,
  },
  {
    hour: 19.25,
    name: 'Dusk',
    top: '#111d38',
    horizon: '#563d55',
    fog: '#302b40',
    sun: '#df8a76',
    ambient: '#46557a',
    ground: '#141714',
    sunIntensity: 0.16,
    ambientIntensity: 0.34,
    exposure: 0.56,
    stars: 0.7,
    environmentIntensity: 0.16,
  },
  {
    hour: 24,
    name: 'Night',
    top: '#06111f',
    horizon: '#172238',
    fog: '#101927',
    sun: '#9db7d8',
    ambient: '#263b64',
    ground: '#07100d',
    sunIntensity: 0.08,
    ambientIntensity: 0.28,
    exposure: 0.48,
    stars: 0.9,
    environmentIntensity: 0.12,
  },
]

export function normalizeHour(hour) {
  return ((Number(hour) % 24) + 24) % 24
}

export function currentDecimalHour(date = new Date()) {
  return date.getHours() + date.getMinutes() / 60
}

export function formatHour(hour) {
  const minutes = Math.round(normalizeHour(hour) * 60) % DAY_MINUTES
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function rgbToHex(rgb) {
  return `#${rgb
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

function mixColor(from, to, amount) {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  return rgbToHex(a.map((channel, index) => channel + (b[index] - channel) * amount))
}

function mix(from, to, amount) {
  return from + (to - from) * amount
}

export function atmosphereAt(hour) {
  const normalized = normalizeHour(hour)
  const endIndex = STOPS.findIndex((stop) => stop.hour >= normalized)
  const end = STOPS[Math.max(1, endIndex)]
  const start = STOPS[Math.max(0, endIndex - 1)]
  const amount = (normalized - start.hour) / (end.hour - start.hour || 1)

  // Sunrise is east, noon is high overhead, sunset is west. At night the
  // directional light becomes a low moon-like fill rather than disappearing.
  const solarAngle = ((normalized - 6) / 12) * Math.PI
  const daylight = Math.max(0, Math.sin(solarAngle))
  const azimuth = ((normalized - 6) / 24) * Math.PI * 2
  const radius = 300
  const stars = mix(start.stars, end.stars, amount)
  // Personal light aura — fades in with night the same way the stars do.
  const nightAura = Math.min(1, Math.max(0, (stars - 0.08) / 0.72))

  return {
    name: amount < 0.5 ? start.name : end.name,
    top: mixColor(start.top, end.top, amount),
    horizon: mixColor(start.horizon, end.horizon, amount),
    fog: mixColor(start.fog, end.fog, amount),
    sun: mixColor(start.sun, end.sun, amount),
    ambient: mixColor(start.ambient, end.ambient, amount),
    ground: mixColor(start.ground, end.ground, amount),
    sunIntensity: mix(start.sunIntensity, end.sunIntensity, amount),
    ambientIntensity: mix(start.ambientIntensity, end.ambientIntensity, amount),
    exposure: mix(start.exposure, end.exposure, amount),
    stars,
    environmentIntensity: mix(
      start.environmentIntensity,
      end.environmentIntensity,
      amount,
    ),
    lanternIntensity: nightAura * 1.35,
    lanternColor: '#ff8f3d',
    sunPosition: [
      Math.cos(azimuth) * radius,
      Math.max(12, daylight * radius),
      Math.sin(azimuth) * radius,
    ],
  }
}
