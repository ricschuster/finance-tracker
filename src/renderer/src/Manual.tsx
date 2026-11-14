import { useState } from 'react'
import { MANUAL } from './manualContent'

/** The user manual: a contents list on the left and one section at a time on the right. */
export function Manual() {
  const [id, setId] = useState(MANUAL[0]!.id)
  const section = MANUAL.find((s) => s.id === id) ?? MANUAL[0]!
  return (
    <section aria-label="Manual" className="manual">
      <nav className="manual-toc" aria-label="Manual contents">
        {MANUAL.map((s) => (
          <button
            key={s.id}
            type="button"
            className="manual-link"
            aria-current={s.id === section.id}
            onClick={() => setId(s.id)}
          >
            {s.title}
          </button>
        ))}
      </nav>
      <article className="card manual-body">
        <h3>{section.title}</h3>
        {section.blocks.map((b, i) =>
          typeof b === 'string' ? (
            <p key={i}>{b}</p>
          ) : 'list' in b ? (
            <ul key={i}>
              {b.list.map((li, j) => (
                <li key={j}>{li}</li>
              ))}
            </ul>
          ) : (
            <p key={i} className="notice">
              <strong>Tip: </strong>
              {b.tip}
            </p>
          ),
        )}
      </article>
    </section>
  )
}
