import { useEffect, useRef } from 'react'
import { clampStick, pressVirtualKey } from './mobileInput'

function bindPad(element, { onMove, onEnd }) {
  if (!element) return () => {}

  let pointerId = null

  const read = (event) => {
    const rect = element.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    return { x: x * 2 - 1, y: y * 2 - 1, clientX: event.clientX, clientY: event.clientY }
  }

  const onPointerDown = (event) => {
    if (pointerId != null) return
    pointerId = event.pointerId
    element.setPointerCapture(pointerId)
    onMove(read(event), event)
  }

  const onPointerMove = (event) => {
    if (event.pointerId !== pointerId) return
    onMove(read(event), event)
  }

  const end = (event) => {
    if (event.pointerId !== pointerId) return
    pointerId = null
    onEnd?.()
  }

  element.addEventListener('pointerdown', onPointerDown)
  element.addEventListener('pointermove', onPointerMove)
  element.addEventListener('pointerup', end)
  element.addEventListener('pointercancel', end)

  return () => {
    element.removeEventListener('pointerdown', onPointerDown)
    element.removeEventListener('pointermove', onPointerMove)
    element.removeEventListener('pointerup', end)
    element.removeEventListener('pointercancel', end)
  }
}

function MoveStick({ inputRef }) {
  const rootRef = useRef(null)
  const knobRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    const knob = knobRef.current
    if (!root || !knob) return undefined

    const max = () => root.clientWidth * 0.5 - 10

    return bindPad(root, {
      onMove: ({ x, y }) => {
        const limited = clampStick(x, -y, 1)
        const px = limited.x * max()
        const py = -limited.y * max()
        knob.style.transform = `translate(${px}px, ${py}px)`
        inputRef.current.moveX = limited.x
        inputRef.current.moveY = limited.y
      },
      onEnd: () => {
        knob.style.transform = 'translate(0px, 0px)'
        inputRef.current.moveX = 0
        inputRef.current.moveY = 0
      },
    })
  }, [inputRef])

  return (
    <div
      ref={rootRef}
      className="mobile-stick"
      role="slider"
      aria-label="Move"
      aria-valuemin={-1}
      aria-valuemax={1}
    >
      <span ref={knobRef} className="mobile-stick-knob" />
      <span className="mobile-pad-label">Move</span>
    </div>
  )
}

function LookPad({ inputRef }) {
  const rootRef = useRef(null)
  const last = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    return bindPad(root, {
      onMove: (_norm, event) => {
        if (last.current) {
          inputRef.current.lookDx += event.clientX - last.current.x
          inputRef.current.lookDy += event.clientY - last.current.y
        }
        last.current = { x: event.clientX, y: event.clientY }
      },
      onEnd: () => {
        last.current = null
      },
    })
  }, [inputRef])

  return (
    <div ref={rootRef} className="mobile-look" role="presentation" aria-label="Look around">
      <span className="mobile-pad-label">Look</span>
    </div>
  )
}

function HoldButton({ label, className, onActiveChange, onPress }) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        onActiveChange?.(true)
        onPress?.()
      }}
      onPointerUp={() => onActiveChange?.(false)}
      onPointerCancel={() => onActiveChange?.(false)}
      onLostPointerCapture={() => onActiveChange?.(false)}
    >
      {label}
    </button>
  )
}

export default function MobileControls({ inputRef, onPause }) {
  return (
    <div className="mobile-hud" aria-label="Touch controls">
      <MoveStick inputRef={inputRef} />
      <LookPad inputRef={inputRef} />
      <div className="mobile-actions">
        <HoldButton
          label="Sprint"
          className="mobile-btn mobile-btn-sprint"
          onActiveChange={(active) => {
            inputRef.current.sprint = active
          }}
        />
        <HoldButton
          label="Jump"
          className="mobile-btn mobile-btn-jump"
          onPress={() => {
            inputRef.current.jump = true
          }}
        />
        <HoldButton
          label="Torch"
          className="mobile-btn mobile-btn-torch"
          onPress={() => pressVirtualKey('KeyF')}
        />
        <HoldButton
          label="Reset"
          className="mobile-btn mobile-btn-reset"
          onPress={() => pressVirtualKey('KeyR')}
        />
        <HoldButton
          label="Menu"
          className="mobile-btn mobile-btn-menu"
          onPress={onPause}
        />
      </div>
    </div>
  )
}
