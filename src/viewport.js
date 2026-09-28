import { useEffect, useState } from 'react'

// Desktop keeps pointer-lock + WASD; coarse / narrow viewports get the touch HUD.

export const MOBILE_VIEWPORT_QUERY = '(max-width: 900px), (pointer: coarse)'

export function isMobileViewport(
  media = typeof window !== 'undefined' ? window.matchMedia.bind(window) : null,
) {
  if (!media) return false
  return Boolean(media(MOBILE_VIEWPORT_QUERY)?.matches)
}

export function useMobileViewport() {
  const [mobile, setMobile] = useState(() => isMobileViewport())

  useEffect(() => {
    const query = window.matchMedia(MOBILE_VIEWPORT_QUERY)
    const onChange = () => setMobile(query.matches)
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return mobile
}
