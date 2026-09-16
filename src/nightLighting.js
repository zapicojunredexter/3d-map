// Hand torch at night: world-space point lights tracked to the camera (camera-
// parented lights are unreliable in three/R3F) plus a visible flame sprite.

export const TORCH_COLOR = '#ff7a28'
export const TORCH_FILL_COLOR = '#ffb14a'

// Camera-local offsets, converted to world each frame.
// +X is the player's right — torch sits in the right hand.
export const TORCH_OFFSET = [0.42, -0.38, -0.8]
export const TORCH_FILL_OFFSET = [0, -0.9, 0]

// Spin the model so the handle faces the palm (right-hand grip).
export const TORCH_MODEL_YAW = Math.PI

// Physically lit scenes need large candela values before a pool reads on screen.
export const TORCH_DISTANCE = 40
export const TORCH_FILL_DISTANCE = 100
export const TORCH_DECAY = 2
export const TORCH_BRIGHTNESS = 100
export const TORCH_FILL_BRIGHTNESS = 55

// Hand-held size for assets/torch.glb (native model is ~6.4 m tall).
export const TORCH_MODEL_HEIGHT = 0.55

export function torchFlicker(timeSeconds) {
  const wave =
    0.5 * Math.sin(timeSeconds * 14.1) +
    0.3 * Math.sin(timeSeconds * 27.4 + 1.3) +
    0.2 * Math.sin(timeSeconds * 45.8 + 0.6)
  return 0.78 + 0.22 * (0.5 + 0.5 * wave)
}

// Night mood drives availability; the player toggles the flame with F.
export const TORCH_ACTIVE_THRESHOLD = 0.02

export function canUseTorch(lanternIntensity) {
  return lanternIntensity > TORCH_ACTIVE_THRESHOLD
}

export function torchIsLit(lanternIntensity, torchEnabled) {
  return canUseTorch(lanternIntensity) && Boolean(torchEnabled)
}
