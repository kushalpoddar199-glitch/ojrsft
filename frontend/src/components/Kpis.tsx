import { fmtMW, fmtPct } from '../format'
import type { Meta, Summary } from '../types'

function Info({ text }: { text: string }) {
  return (
    <span className="info" tabIndex={0} aria-label={text}>
      i<span className="tip" aria-hidden="true">{text}</span>
    </span>
  )
}

function Kpi(props: { label: string; value: string; unit?: string; note: string; info: string; compact?: boolean }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{props.label} <Info text={props.info} /></div>
      <div className={`kpi-value${props.compact ? ' compact' : ''}`}>{props.value}{props.unit && <small>{props.unit}</small>}</div>
      <div className="kpi-note">{props.note}</div>
    </div>
  )
}

function biasNote(bias: number | null) {
  if (bias == null) return 'No matched hours'
  if (Math.abs(bias) < 100) return 'No material systematic lean'
  return bias > 0
    ? 'Forecast ran above actual: wind under-delivered on average'
    : 'Forecast ran below actual: wind over-delivered on average'
}

export function Kpis({ s, meta }: { s: Summary; meta: Meta }) {
  return (
    <section className="kpis" aria-label="Accuracy summary">
      <Kpi label="Mean absolute error" value={fmtMW(s.mae)} unit="MW"
        note={s.mape != null ? `${fmtPct(s.mape)} of actual (MAPE)` : 'MAPE not applicable'}
        info={`Average size of the miss, ignoring direction. MAPE uses only hours with actual wind ≥ ${fmtMW(meta.mape_min_actual_mw)} MW (${s.mape_intervals} hours).`} />
      <Kpi label="RMSE" value={fmtMW(s.rmse)} unit="MW"
        note="Weights large misses more heavily"
        info="Root mean squared error. Higher than MAE when a few hours have very large misses." />
      <Kpi label="Bias" value={fmtMW(s.bias, true)} unit="MW"
        note={biasNote(s.bias)}
        info="Mean of forecast − actual. Positive means the forecast was too high, so less wind arrived than was planned for." />
      <Kpi label="80% of hours within" value={s.error_p10 == null ? '—' : `${fmtMW(s.error_p10, true)} to ${fmtMW(s.error_p90, true)}`} unit="MW" compact
        note="10th–90th percentile of forecast − actual"
        info="In 8 of 10 hours, the forecast error fell inside this range over the selected period. Historical and in-sample, not a guarantee." />
      <Kpi label="Coverage" value={fmtPct(s.coverage, 0)}
        note={`${s.matched_intervals} of ${s.expected_intervals} hours matched`}
        info="Hours with both an actual and a forecast published before the cutoff, divided by all hours in the period." />
    </section>
  )
}
