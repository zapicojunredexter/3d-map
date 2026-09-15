export const MINIMAP_RANGE = 95

export function worldToPlan(worldX, worldZ, placement) {
  return {
    x: worldX - placement.position.x,
    y: placement.position.z - worldZ,
  }
}

export function headingFromForward(forwardX, forwardZ) {
  return Math.atan2(forwardX, -forwardZ)
}

// Plan units to minimap pixels, so the disk always spans 2x the range.
export function minimapScale(range, size) {
  return size / (range * 2)
}
