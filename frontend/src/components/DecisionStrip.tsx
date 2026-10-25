import type { Meta, Summary } from '../types'

/** Says which forecast run the analysis is actually built on. */
export function DecisionStrip({ meta, s }: { meta: Meta; s: Summary }) {
  const runs = Object.entries(meta.runs_used).sort((a, b) => b[1] - a[1])
  const runText = runs.length
    ? runs.map(([t, n]) => `${t} UK run (${n} h)`).join(', ')
    : 'none'
  return (
    <section className="decision" aria-label="Decision basis">
      <span className="tag">Decision basis</span>
      <span>Buying on <b>D-1 at {meta.cutoff}</b> UK time</span>
      <span>Forecast in hand: <b>{runText}</b></span>
      <span>Latest run published at or before the cutoff; later runs ignored</span>
      {s.no_eligible_forecast > 0 && <span><b>{s.no_eligible_forecast} h</b> had no eligible forecast</span>}
    </section>
  )
}
