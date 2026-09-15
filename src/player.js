import * as THREE from 'three'

export const PLAYER = {
  eyeHeight: 1.65,
  radius: 0.28,
  gravity: 24,
  walkSpeed: 4.4,
  sprintSpeed: 7.6,
  jumpSpeed: 7.2,
  groundSnap: 0.22,
  spawnHeight: 80,
  // Above the tallest building, so a downward ray sees the whole column.
  probeHeight: 160,
  // Open sky a spawn point needs. The exported trees are tall, so this has to
  // clear a whole crown rather than just the player's head.
  skyClearance: 25,
}

export function createPlayerState(x = 0, z = 0) {
  return {
    position: new THREE.Vector3(x, PLAYER.spawnHeight, z),
    velocityY: 0,
    grounded: false,
    jumpRequested: false,
  }
}

export function spawnSearchOffsets(maxRadius = 400, step = 16, spokes = 12) {
  const offsets = [[0, 0]]
  for (let radius = step; radius <= maxRadius; radius += step) {
    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const theta = (spoke / spokes) * Math.PI * 2
      offsets.push([Math.cos(theta) * radius, Math.sin(theta) * radius])
    }
  }
  return offsets
}

// Walks the search offsets and takes the first road with open sky above it.
// Roads under tree crowns and plain open ground are kept only as fallbacks, so
// the player never starts buried in leaves or stranded on a roof.
export function findSpawn(offsets, probe, hasHeadroom) {
  let coveredRoad = null
  let openGround = null

  for (const [x, z] of offsets) {
    const found = probe(x, z)
    if (!found) continue
    const spot = { x, z, groundY: found.groundY }

    if (!found.road) {
      openGround ??= spot
      continue
    }
    if (hasHeadroom(x, z, found.groundY)) return spot
    coveredRoad ??= spot
  }

  return coveredRoad ?? openGround ?? null
}

export function applyGravityAndGround(state, dt, groundY, options = PLAYER) {
  const { eyeHeight, gravity, jumpSpeed, groundSnap } = options

  if (state.jumpRequested && state.grounded) {
    state.velocityY = jumpSpeed
    state.grounded = false
  }
  state.jumpRequested = false

  state.velocityY -= gravity * dt
  state.position.y += state.velocityY * dt

  if (groundY == null) {
    state.grounded = false
    return state
  }

  const standY = groundY + eyeHeight
  if (state.velocityY <= 0 && state.position.y <= standY + groundSnap) {
    state.position.y = standY
    state.velocityY = 0
    state.grounded = true
  } else if (state.position.y > standY + groundSnap) {
    state.grounded = false
  }

  return state
}

export function moveWithCollisions(position, wishMove, radius, castWall) {
  const dest = position.clone()
  const remaining = wishMove.clone()

  for (let i = 0; i < 3; i += 1) {
    const distance = remaining.length()
    if (distance < 1e-5) break

    const direction = remaining.clone().divideScalar(distance)
    const hit = castWall(dest, direction, distance + radius)

    if (!hit) {
      dest.add(remaining)
      break
    }

    const travel = Math.max(0, hit.distance - radius)
    dest.addScaledVector(direction, travel)
    remaining.multiplyScalar(1 - travel / distance)
    remaining.addScaledVector(hit.normal, -remaining.dot(hit.normal))
  }

  return dest
}
