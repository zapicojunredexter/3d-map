import { useId, useState } from 'react'
import {
  CREDIT_INTRO,
  CREDIT_SECTIONS,
  creditEntryCount,
  formatSketchfabCredit,
} from './credits'

function ExternalLink({ href, children }) {
  if (!href) return children
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

function SketchfabCredit({ entry }) {
  return (
    <li className="credits-entry">
      <p className="credits-entry__sketchfab">
        <span className="credits-entry__quoted">
          &ldquo;
          <ExternalLink href={entry.source}>{entry.title}</ExternalLink>
          &rdquo;
        </span>{' '}
        (
        <ExternalLink href={entry.source}>{entry.source}</ExternalLink>
        ) by <ExternalLink href={entry.authorUrl}>{entry.author}</ExternalLink>{' '}
        is licensed under{' '}
        <ExternalLink href={entry.license.url}>{entry.license.name}</ExternalLink>{' '}
        (<ExternalLink href={entry.license.url}>{entry.license.url}</ExternalLink>
        ).
        {entry.used === false && (
          <span className="credits-entry__badge">in assets</span>
        )}
        {entry.license?.id?.includes('NC') && (
          <span className="credits-entry__badge credits-entry__badge--warn">
            non-commercial
          </span>
        )}
      </p>
      <p className="credits-entry__plain" aria-hidden="true">
        {formatSketchfabCredit(entry)}
      </p>
    </li>
  )
}

function CreditEntry({ entry }) {
  if (entry.via === 'Sketchfab') return <SketchfabCredit entry={entry} />

  return (
    <li className="credits-entry">
      <div className="credits-entry__title">
        <ExternalLink href={entry.source}>{entry.title}</ExternalLink>
        {entry.used === false && (
          <span className="credits-entry__badge">in assets</span>
        )}
        {entry.license?.id?.includes('NC') && (
          <span className="credits-entry__badge credits-entry__badge--warn">
            non-commercial
          </span>
        )}
      </div>
      <p className="credits-entry__meta">
        {entry.author && (
          <>
            <ExternalLink href={entry.authorUrl}>{entry.author}</ExternalLink>
            {entry.license ? ' · ' : null}
          </>
        )}
        {entry.license && (
          <ExternalLink href={entry.license.url}>
            {entry.license.shortName ?? entry.license.name}
          </ExternalLink>
        )}
      </p>
      {entry.note && <p className="credits-entry__note">{entry.note}</p>}
    </li>
  )
}

export default function CreditsSection() {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const total = creditEntryCount()

  return (
    <section className="credits-section" aria-label="Credits and licenses">
      <div className="credits-section__bar">
        <div>
          <span>Credits</span>
          <strong>Assets & licenses</strong>
        </div>
        <button
          type="button"
          className="credits-section__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Hide' : 'View'}
        </button>
      </div>

      {open && (
        <div id={panelId} className="credits-section__panel">
          <p className="credits-section__intro">{CREDIT_INTRO}</p>
          <p className="credits-section__count">{total} credited sources</p>

          {CREDIT_SECTIONS.map((section) => (
            <div key={section.id} className="credits-group">
              <h3>{section.title}</h3>
              {section.blurb && <p className="credits-group__blurb">{section.blurb}</p>}
              <ul>
                {section.entries.map((entry) => (
                  <CreditEntry
                    key={`${section.id}-${entry.title}-${entry.source ?? ''}`}
                    entry={entry}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
