// Shared bus between the on-screen HUD (DOM) and ExplorerControls (R3F).

export const MOBILE_LOOK_SENSITIVITY = 0.0032
export const MOBILE_PITCH_MIN = -Math.PI / 2 + 0.08
export const MOBILE_PITCH_MAX = Math.PI / 2 - 0.08

export function createMobileInput() {
  return {
    moveX: 0,
    moveY: 0,
    lookDx: 0,
    lookDy: 0,
    sprint: false,
    jump: false,
  }
}

export function clampStick(x, y, max = 1) {
  const len = Math.hypot(x, y)
  if (len <= max || len === 0) return { x, y }
  const scale = max / len
  return { x: x * scale, y: y * scale }
}

export function consumeMobileLook(input) {
  const dx = input.lookDx
  const dy = input.lookDy
  input.lookDx = 0
  input.lookDy = 0
  return { dx, dy }
}

export function applyMobileLook(euler, lookDx, lookDy, sensitivity = MOBILE_LOOK_SENSITIVITY) {
  euler.y -= lookDx * sensitivity
  euler.x -= lookDy * sensitivity
  euler.x = Math.min(MOBILE_PITCH_MAX, Math.max(MOBILE_PITCH_MIN, euler.x))
  return euler
}

export function pressVirtualKey(code) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
}
