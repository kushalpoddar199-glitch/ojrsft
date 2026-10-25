import type { Filters } from '../types'

export const WINDOW = { start: '2026-01-02', end: '2026-02-01' }
export const DEFAULT_FILTERS: Filters = { ...WINDOW, cutoff: '09:50' }

export const CUTOFFS = [
  { value: '09:20', label: '09:20 · EPEX GB hourly auction' },
  { value: '09:50', label: '09:50 · Nord Pool GB auction (default)' },
  { value: '15:30', label: '15:30 · EPEX GB half-hourly auction' },
]

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  loading: boolean
}

export function FilterBar({ filters, onChange, loading }: Props) {
  const set = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch }
    // Keep the range valid whichever end the user moves.
    if (patch.start && next.end < next.start) next.end = next.start
    if (patch.end && next.start > next.end) next.start = next.end
    onChange(next)
  }
  const isDefault =
    filters.start === DEFAULT_FILTERS.start &&
    filters.end === DEFAULT_FILTERS.end &&
    filters.cutoff === DEFAULT_FILTERS.cutoff

  return (
    <div className="filters" role="search" aria-label="Analysis filters">
      <label className="field">
        Delivery from
        <input type="date" min={WINDOW.start} max={WINDOW.end} value={filters.start}
          onChange={(e) => e.target.value && set({ start: e.target.value })} />
      </label>
      <label className="field">
        Delivery to
        <input type="date" min={WINDOW.start} max={WINDOW.end} value={filters.end}
          onChange={(e) => e.target.value && set({ end: e.target.value })} />
      </label>
      <label className="field">
        Decision cutoff (UK time, day before delivery)
        <select value={filters.cutoff} onChange={(e) => set({ cutoff: e.target.value })}>
          {CUTOFFS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      <button className="btn" type="button" onClick={() => onChange(DEFAULT_FILTERS)} disabled={isDefault}>
        Reset
      </button>
      <span className="spacer" />
      <span className="loading-dot" aria-live="polite">{loading ? 'Updating…' : ''}</span>
    </div>
  )
}
