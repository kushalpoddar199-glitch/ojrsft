import { useMemo, useState } from 'react'
import {
  Area, Bar, BarChart, Brush, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fmtCalendarDay, fmtDateTime, fmtDay, fmtHour, fmtMW } from '../format'
import type { Day, Row, Summary } from '../types'

const AXIS = { stroke: '#cdd2da', tick: { fill: '#6b7689', fontSize: 12 }, tickLine: false }
const mwTick = (v: number) => `${(v / 1000).toLocaleString('en-GB')} GW`

interface ChartProps {
  rows: Row[]
  selected: string | null
  onSelect: (t: string) => void
}

function useTimeTick(rows: Row[]) {
  const singleDay = rows.length <= 25
  return singleDay ? fmtHour : fmtDay
}

/** Recharts passes the hovered category label on click. */
function pickLabel(onSelect: (t: string) => void) {
  return (state: { activeLabel?: string | number } | null) => {
    if (state && typeof state.activeLabel === 'string') onSelect(state.activeLabel)
  }
}

// ---------------------------------------------------------------------------

export function ForecastChart({ rows, selected, onSelect, summary }: ChartProps & { summary: Summary }) {
  const [showBand, setShowBand] = useState(true)
  const tick = useTimeTick(rows)
  const canBand = summary.error_p10 != null && summary.error_p90 != null

  const data = useMemo(
    () => rows.map((r) => ({
      ...r,
      // actual = forecast - error, so the 10th-90th percentile errors bound
      // where the outturn landed in 80% of comparable hours. Output can't go
      // below zero, so the band is floored there.
      band: r.forecast != null && canBand
        ? [Math.max(0, r.forecast - summary.error_p90!), Math.max(0, r.forecast - summary.error_p10!)] : null,
    })),
    [rows, summary, canBand],
  )

  return (
    <section className="card" aria-labelledby="fc-title">
      <div className="card-head">
        <div>
          <h2 id="fc-title">Day-ahead forecast vs actual wind generation</h2>
          <p>Hourly average MW. Click a point to inspect that hour; drag the handles below to zoom.</p>
        </div>
        <div className="legend" aria-hidden="true">
          <span><i className="swatch-line" style={{ borderColor: 'var(--actual)' }} />Actual</span>
          <span><i className="swatch-line swatch-dash" style={{ borderColor: 'var(--forecast)' }} />Day-ahead forecast</span>
          {canBand && (
            <label className="toggle">
              <input type="checkbox" checked={showBand} onChange={(e) => setShowBand(e.target.checked)} />
              80% outturn range
            </label>
          )}
        </div>
      </div>
      <div className="chart-box tall">
        <ResponsiveContainer>
          <ComposedChart data={data} onClick={pickLabel(onSelect)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="start_time" tickFormatter={tick} minTickGap={40} {...AXIS} />
            <YAxis tickFormatter={mwTick} width={64} {...AXIS} axisLine={false} />
            <Tooltip content={<LineTip />} />
            {showBand && canBand && (
              <Area dataKey="band" stroke="none" fill="var(--band)" isAnimationActive={false} activeDot={false} />
            )}
            <Line dataKey="actual" name="Actual" stroke="var(--actual)" strokeWidth={2} dot={false}
              isAnimationActive={false} connectNulls={false} />
            <Line dataKey="forecast" name="Forecast" stroke="var(--forecast)" strokeWidth={2}
              strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls={false} />
            {selected && <ReferenceLine x={selected} stroke="var(--ink)" strokeWidth={1} />}
            {rows.length > 48 && (
              <Brush dataKey="start_time" height={24} stroke="#9aa6b8" tickFormatter={fmtDay} travellerWidth={8} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

interface TipProps { active?: boolean; payload?: { payload: Row }[] }

function LineTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="tooltip">
      <div className="t-title">{fmtDateTime(r.start_time)}</div>
      <div className="t-row"><span>Actual</span><span>{fmtMW(r.actual)} MW</span></div>
      <div className="t-row"><span>Forecast</span><span>{fmtMW(r.forecast)} MW</span></div>
      <div className="t-row"><span>Error</span><span>{fmtMW(r.error, true)} MW</span></div>
      {r.publish_time && <div className="t-row muted"><span>Run</span><span>{fmtDateTime(r.publish_time)}</span></div>}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function ErrorChart({ rows, selected, onSelect }: ChartProps) {
  const tick = useTimeTick(rows)
  return (
    <section className="card" aria-labelledby="err-title">
      <div className="card-head">
        <div>
          <h2 id="err-title">Forecast error by hour</h2>
          <p>Forecast − actual. Above zero: forecast too high (less wind than planned).</p>
        </div>
        <ErrorLegend />
      </div>
      <div className="chart-box">
        <ResponsiveContainer>
          <BarChart data={rows} onClick={pickLabel(onSelect)} barCategoryGap={0} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="start_time" tickFormatter={tick} minTickGap={40} {...AXIS} />
            <YAxis tickFormatter={mwTick} width={64} {...AXIS} axisLine={false} />
            <Tooltip content={<LineTip />} cursor={{ fill: 'rgba(20,35,60,0.06)' }} />
            <ReferenceLine y={0} stroke="var(--ink-2)" />
            <Bar dataKey="error" isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.start_time}
                  fill={(r.error ?? 0) >= 0 ? 'var(--over)' : 'var(--under)'}
                  fillOpacity={selected && selected !== r.start_time ? 0.45 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function ErrorLegend() {
  return (
    <div className="legend" aria-hidden="true">
      <span><i className="swatch-box" style={{ background: 'var(--over)' }} />Over-forecast</span>
      <span><i className="swatch-box" style={{ background: 'var(--under)' }} />Under-forecast</span>
    </div>
  )
}

// ---------------------------------------------------------------------------

const BIN_MW = 500

export function histogram(errors: number[], binMw = BIN_MW) {
  if (!errors.length) return []
  const lo = Math.floor(Math.min(...errors) / binMw) * binMw
  const hi = Math.floor(Math.max(...errors) / binMw) * binMw
  const bins: { from: number; to: number; count: number }[] = []
  for (let b = lo; b <= hi; b += binMw) bins.push({ from: b, to: b + binMw, count: 0 })
  for (const e of errors) bins[Math.floor((e - lo) / binMw)].count++
  return bins
}

export function Distribution({ rows, summary }: { rows: Row[]; summary: Summary }) {
  const bins = useMemo(
    () => histogram(rows.flatMap((r) => (r.error == null ? [] : [r.error]))),
    [rows],
  )
  return (
    <section className="card" aria-labelledby="dist-title">
      <div className="card-head">
        <div>
          <h2 id="dist-title">Error distribution</h2>
          <p>Hours per {BIN_MW} MW band of forecast − actual. Line marks the mean (bias).</p>
        </div>
        <ErrorLegend />
      </div>
      <div className="chart-box">
        {bins.length === 0 ? <p className="empty">No matched hours in this period.</p> : (
          <ResponsiveContainer>
            <BarChart data={bins} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="from" type="number" domain={['dataMin', `dataMax + ${BIN_MW}`]}
                tickFormatter={mwTick} {...AXIS} />
              <YAxis allowDecimals={false} width={40} {...AXIS} axisLine={false} />
              <Tooltip content={<BinTip />} cursor={{ fill: 'rgba(20,35,60,0.06)' }} />
              <Bar dataKey="count" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                {bins.map((b) => (
                  <Cell key={b.from} fill={b.from + BIN_MW / 2 >= 0 ? 'var(--over)' : 'var(--under)'} />
                ))}
              </Bar>
              <ReferenceLine x={0} stroke="var(--ink-2)" />
              {summary.bias != null && (
                <ReferenceLine x={summary.bias} stroke="var(--ink)" strokeDasharray="4 3"
                  label={{ value: `mean ${fmtMW(summary.bias, true)}`, position: 'top', fill: '#14233c', fontSize: 12 }} />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

function BinTip({ active, payload }: { active?: boolean; payload?: { payload: { from: number; to: number; count: number } }[] }) {
  if (!active || !payload?.length) return null
  const b = payload[0].payload
  return (
    <div className="tooltip">
      <div className="t-title">{fmtMW(b.from, true)} to {fmtMW(b.to, true)} MW</div>
      <div className="t-row"><span>Hours</span><span>{b.count}</span></div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function DailyChart({ days, onPickDay }: { days: Day[]; onPickDay: (d: string) => void }) {
  return (
    <section className="card" aria-labelledby="daily-title">
      <div className="card-head">
        <div>
          <h2 id="daily-title">Accuracy by delivery day</h2>
          <p>Daily mean absolute error. Days missing hours are shown lighter and flagged. Click a day to focus on it.</p>
        </div>
      </div>
      <div className="chart-box">
        <ResponsiveContainer>
          <BarChart data={days} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
            onClick={(s: { activeLabel?: string | number } | null) => {
              if (s && typeof s.activeLabel === 'string') onPickDay(s.activeLabel)
            }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => fmtCalendarDay(d).split(' ').slice(1).join(' ')} minTickGap={16} {...AXIS} />
            <YAxis tickFormatter={mwTick} width={64} {...AXIS} axisLine={false} />
            <Tooltip content={<DayTip />} cursor={{ fill: 'rgba(20,35,60,0.06)' }} />
            <Bar dataKey="mae" fill="var(--actual)" isAnimationActive={false} radius={[3, 3, 0, 0]}
              label={(p: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
                const d = days[p.index ?? 0]
                if (!d || d.matched === d.expected) return <g />
                const x = Number(p.x ?? 0) + Number(p.width ?? 0) / 2
                return <text x={x} y={Number(p.y ?? 0) - 4} textAnchor="middle" fontSize={11} fill="#7a4b00">{d.matched}/{d.expected}</text>
              }}>
              {days.map((d) => (
                <Cell key={d.date} fillOpacity={d.matched < d.expected ? 0.45 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function DayTip({ active, payload }: { active?: boolean; payload?: { payload: Day }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="tooltip">
      <div className="t-title">{fmtCalendarDay(d.date)}</div>
      <div className="t-row"><span>MAE</span><span>{fmtMW(d.mae)} MW</span></div>
      <div className="t-row"><span>Bias</span><span>{fmtMW(d.bias, true)} MW</span></div>
      <div className="t-row"><span>Hours matched</span><span>{d.matched}/{d.expected}</span></div>
    </div>
  )
}
