import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import FeatureLabel from './FeatureLabel'
import { labelFor } from './buildingNames'

afterEach(cleanup)

describe('labelFor', () => {
  it('falls back to the id until a name is mapped', () => {
    const names = { TPX_Buildings_7: 'Barangay Hall' }

    expect(labelFor('TPX_Buildings_7', names)).toBe('Barangay Hall')
    expect(labelFor('TPX_Buildings_8', names)).toBe('TPX_Buildings_8')
    expect(labelFor(null, names)).toBeNull()
  })
})

describe('FeatureLabel', () => {
  it('shows nothing when the crosshair is on open ground', () => {
    const { container } = render(<FeatureLabel id={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the raw id for an unmapped block', () => {
    render(<FeatureLabel id="TPX_Buildings_412" names={{}} />)

    expect(screen.getByText('TPX_Buildings_412')).toBeInTheDocument()
  })

  it('shows the mapped name with its id underneath', () => {
    render(
      <FeatureLabel
        id="TPX_Buildings_412"
        names={{ TPX_Buildings_412: 'Barangay Hall' }}
      />,
    )

    expect(screen.getByText('Barangay Hall')).toBeInTheDocument()
    expect(screen.getByText('TPX_Buildings_412')).toBeInTheDocument()
  })
})
