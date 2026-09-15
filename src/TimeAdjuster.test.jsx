import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TimeAdjuster from './TimeAdjuster'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TimeAdjuster', () => {
  it('shows the selected time and mood', () => {
    render(<TimeAdjuster hour={18.25} onChange={() => {}} />)

    expect(screen.getByText('18:15')).toBeInTheDocument()
    expect(screen.getByText('Sunset')).toBeInTheDocument()
  })

  it('reports slider changes as decimal hours', () => {
    const onChange = vi.fn()
    render(<TimeAdjuster hour={12} onChange={onChange} />)

    fireEvent.change(screen.getByRole('slider', { name: 'Time of day' }), {
      target: { value: '6.5' },
    })

    expect(onChange).toHaveBeenCalledWith(6.5)
  })

  it('can return to the current local time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 15, 17, 33))
    const onChange = vi.fn()
    render(<TimeAdjuster hour={2} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Use current time' }))

    expect(onChange).toHaveBeenCalledWith(17.55)
  })
})
