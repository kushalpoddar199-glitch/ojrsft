import { useMemo, useState } from 'react'
import { fmtDateTime, fmtMW } from '../format'
import type { Row, Status } from '../types'

const STATUS_LABEL: Record<Status, string> = {
  matched: 'Matched',
  missing_actual: 'No actual',
  no_eligible_forecast: 'No eligible forecast',
  missing_both: 'No data',
}

type Key = 'start_time' | 'actual' | 'forecast' | 'error' | 'abs'
const COLUMNS: { key: Key; label: string }[] = [
  { key: 'start_time', label: 'Hour starting (UK)' },
  { key: 'actual', label: 'Actual MW' },
  { key: 'forecast', label: 'Forecast MW' },
  { key: 'error', label: 'Error MW' },
  { key: 'abs', label: 'Abs. error MW' },
]
const PAGE = 24

const value = (r: Row, k: Key): number | string | null =>
  k === 'abs' ? (r.error == null ? null : Math.abs(r.error)) : r[k]

export function RecordsTable({ rows, selected, onSelect }: {
  rows: Row[]; selected: string | null; onSelect: (t: string) => void
}) {
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: 'start_time', desc: false })
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    const out = [...rows]
    out.sort((a, b) => {
      const va = value(a, sort.key), vb = value(b, sort.key)
      // Missing values always sort last, whichever direction.
      if (va == null) return vb == null ? 0 : 1
      if (vb == null) return -1
      const c = va < vb ? -1 : va > vb ? 1 : 0
      return sort.desc ? -c : c
    })
    return out
  }, [rows, sort])

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE))
  const current = Math.min(page, pages - 1)
  const visible = sorted.slice(current * PAGE, current * PAGE + PAGE)

  const toggle = (key: Key) => {
    setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'start_time' }))
    setPage(0)
  }

  return (
    <section className="card" aria-labelledby="tbl-title">
      <div className="card-head">
        <div>
          <h2 id="tbl-title">Hourly records</h2>
          <p>Every hour in the period, including gaps. Sort by largest error to find the worst misses.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col"
                  aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                  <button type="button" onClick={() => toggle(c.key)}>
                    {c.label}{sort.key === c.key && <span aria-hidden="true">{sort.desc ? '↓' : '↑'}</span>}
                  </button>
                </th>
              ))}
              <th scope="col">Forecast run (UK)</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.start_time}
                className={`clickable${r.start_time === selected ? ' selected' : ''}`}
                onClick={() => onSelect(r.start_time)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(r.start_time)}
                tabIndex={0} aria-selected={r.start_time === selected}>
                <td className="text">{fmtDateTime(r.start_time)}</td>
                <td>{fmtMW(r.actual)}</td>
                <td>{fmtMW(r.forecast)}</td>
                <td className={r.error == null ? '' : r.error > 0 ? 'pos' : 'neg'}>{fmtMW(r.error, true)}</td>
                <td>{fmtMW(r.error == null ? null : Math.abs(r.error))}</td>
                <td className="text">{r.publish_time ? fmtDateTime(r.publish_time) : '—'}</td>
                <td className="text">
                  <span className={`pill ${r.status === 'matched' ? 'pill-ok' : 'pill-gap'}`}>{STATUS_LABEL[r.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span>{sorted.length} hours · page {current + 1} of {pages}</span>
        <div>
          <button className="btn" type="button" onClick={() => setPage(current - 1)} disabled={current === 0}>Previous</button>
          <button className="btn" type="button" onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>Next</button>
        </div>
      </div>
    </section>
  )
}

export function IntervalDetail({ row, cutoff, onClear }: { row: Row; cutoff: string; onClear: () => void }) {
  return (
    <section className="card" aria-labelledby="detail-title" aria-live="polite">
      <div className="card-head">
        <div>
          <h2 id="detail-title">Hour starting {fmtDateTime(row.start_time)} UK</h2>
          <p>{STATUS_LABEL[row.status]}{row.publish_time ? ` · decision at D-1 ${cutoff} used the run below` : ''}</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={onClear}>Clear selection</button>
      </div>
      <dl className="detail">
        <div><dt>Actual</dt><dd>{fmtMW(row.actual)} MW</dd></div>
        <div><dt>Forecast</dt><dd>{fmtMW(row.forecast)} MW</dd></div>
        <div><dt>Error (F − A)</dt><dd>{fmtMW(row.error, true)} MW</dd></div>
        <div><dt>Forecast run</dt><dd>{row.publish_time ? fmtDateTime(row.publish_time) : '—'}</dd></div>
        <div><dt>Lead time</dt><dd>{row.lead_hours == null ? '—' : `${row.lead_hours.toFixed(1)} h`}</dd></div>
        <div><dt>Percentage error</dt><dd>{row.error != null && row.actual ? `${((row.error / row.actual) * 100).toFixed(1)}%` : '—'}</dd></div>
      </dl>
    </section>
  )
}
