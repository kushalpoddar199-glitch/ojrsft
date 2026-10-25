import { fmtCalendarDay, fmtDateTime } from '../format'
import type { Meta } from '../types'

export function Header({ meta }: { meta: Meta | null }) {
  return (
    <header className="header">
      <div>
        <div className="brand">
          <span className="brand-mark">REint</span>
          <h1>Wind Forecast Intelligence</h1>
        </div>
        <p className="header-sub">
          Day-ahead GB wind forecasts vs outturn · purchase decisions made in January 2026
        </p>
      </div>
      <div className="source">
        <div>
          Source: Elexon BMRS{' '}
          <a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream" target="_blank" rel="noreferrer">FUELHH</a>
          {' + '}
          <a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream" target="_blank" rel="noreferrer">WINDFOR</a>
        </div>
        {meta && (
          <div>
            Delivery {fmtCalendarDay(meta.first_day)} – {fmtCalendarDay(meta.last_day)} 2026 · retrieved{' '}
            {fmtDateTime(meta.fetched_at)} UK
          </div>
        )}
      </div>
    </header>
  )
}
