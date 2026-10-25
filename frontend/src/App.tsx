import { useState } from 'react'
import { ForecastChart, ErrorChart, Distribution, DailyChart } from './components/charts'
import { DecisionStrip } from './components/DecisionStrip'
import { DEFAULT_FILTERS, FilterBar } from './components/FilterBar'
import { Header } from './components/Header'
import { Kpis } from './components/Kpis'
import { Methodology } from './components/Methodology'
import { IntervalDetail, RecordsTable } from './components/RecordsTable'
import type { Filters } from './types'
import { useAnalysis } from './useAnalysis'

export default function App() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [selected, setSelected] = useState<string | null>(null)
  const state = useAnalysis(filters)
  const data = state.data

  const changeFilters = (f: Filters) => {
    setFilters(f)
    setSelected(null)
  }
  const selectedRow = data?.rows.find((r) => r.start_time === selected) ?? null

  return (
    <div className="page">
      <Header meta={data?.meta ?? null} />
      <FilterBar filters={filters} onChange={changeFilters} loading={state.status === 'loading'} />

      {state.status === 'error' && (
        <div className="banner banner-err" role="alert">
          <strong>Data unavailable.</strong> {state.message} Results are not shown because they could
          not be calculated from current data.{' '}
          <button className="btn btn-ghost" type="button" onClick={() => setFilters({ ...filters })}>Retry</button>
        </div>
      )}
      {data?.meta.warnings.map((w) => (
        <div key={w} className="banner banner-warn" role="status"><strong>Partial data.</strong> {w}</div>
      ))}

      {!data && state.status === 'loading' && (
        <div className="card skeleton" role="status">Loading January 2026 data from Elexon…</div>
      )}

      {data && (
        <main className={`stack ${state.status === 'loading' ? 'dim' : ''}`} aria-busy={state.status === 'loading'}>
          <DecisionStrip meta={data.meta} s={data.summary} />
          <Kpis s={data.summary} meta={data.meta} />
          {data.summary.matched_intervals === 0 ? (
            <div className="card empty">No hours in this period have both an actual and an eligible forecast.</div>
          ) : (
            <>
              <ForecastChart rows={data.rows} selected={selected} onSelect={setSelected} summary={data.summary} />
              {selectedRow && (
                <IntervalDetail row={selectedRow} cutoff={data.meta.cutoff} onClear={() => setSelected(null)} />
              )}
              <div className="grid-2">
                <ErrorChart rows={data.rows} selected={selected} onSelect={setSelected} />
                <Distribution rows={data.rows} summary={data.summary} />
              </div>
              {data.daily.length > 1 && (
                <DailyChart days={data.daily} onPickDay={(d) => changeFilters({ ...filters, start: d, end: d })} />
              )}
            </>
          )}
          <RecordsTable rows={data.rows} selected={selected} onSelect={setSelected} />
        </main>
      )}
      <div className="stack" style={{ marginTop: 16 }}>
        <Methodology meta={data?.meta ?? null} />
      </div>
      <p className="footer">
        Pilot analytics tool. Forecast error in MW is not a measure of procurement cost. Data: Elexon BMRS.
      </p>
    </div>
  )
}
