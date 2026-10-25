import { fmtMW } from '../format'
import type { Meta } from '../types'

export function Methodology({ meta }: { meta: Meta | null }) {
  return (
    <section className="card method" aria-label="Methodology">
      <details>
        <summary>Methodology and assumptions</summary>

        <h3>Data</h3>
        <ul>
          <li>
            Actual: Elexon <code>FUELHH</code>, <code>fuelType = WIND</code>. Half-hourly average MW of
            GB wind generation outturn.
          </li>
          <li>
            Forecast: Elexon <code>WINDFOR</code>. Hourly MW forecasts, published up to 8 times a day,
            each run looking roughly 2–3 days ahead.
          </li>
          <li>No other data is used. Results describe this forecast against this outturn only.</li>
        </ul>

        <h3>Which forecast counts</h3>
        <p>
          The team buys in the day-ahead market on the day before delivery (D-1). For every delivery hour
          on day D, the app uses the most recent forecast run published at or before the cutoff on D-1, in
          UK local time{meta ? ` (currently ${meta.cutoff})` : ''}. Runs published after the cutoff are never
          used, even when they would score better, because they were not available when the purchase was
          made. If the latest eligible run has no value for an hour, the previous eligible run is used. If
          none exists, the hour is reported as having no eligible forecast.
        </p>
        <p>
          The default 09:50 is Nord Pool&apos;s GB day-ahead auction gate closure. 09:20 (EPEX hourly) and
          15:30 (EPEX half-hourly) are provided for comparison. An earlier cutoff can only use older
          forecasts, so it generally shows larger errors.
        </p>

        <h3>Period</h3>
        <p>
          Purchase decisions made 1–31 January 2026 cover delivery days 2 January – 1 February 2026
          (31 UK days, 744 hours).
        </p>

        <h3>Time alignment</h3>
        <p>
          WINDFOR is hourly and FUELHH is half-hourly, so comparisons are hourly: each forecast hour is
          compared with the mean of the two FUELHH half-hours in that hour. An hour with only one half
          present has no actual. All timestamps are handled in UTC and shown in UK local time; delivery
          days are UK local days.
        </p>

        <h3>Metrics</h3>
        <ul>
          <li>Error = forecast − actual (MW). Positive: the forecast was too high.</li>
          <li>MAE: mean of |error|. RMSE: square root of mean error², more sensitive to large misses.</li>
          <li>Bias: mean error. A persistent positive bias means less wind arrived than forecast.</li>
          <li>
            MAPE: mean of |error| / actual, only over hours with actual ≥{' '}
            {meta ? fmtMW(meta.mape_min_actual_mw) : '1,000'} MW. At very low output, percentage error
            stops being meaningful.
          </li>
          <li>
            80% range: 10th to 90th percentile of error over the selected period. It is descriptive and
            in-sample, not a calibrated prediction interval.
          </li>
          <li>Coverage: matched hours ÷ all hours in the period.</li>
        </ul>

        <h3>Missing data</h3>
        <p>
          Missing or invalid values are never treated as zero. Rows failing validation are dropped and
          counted. If a half-hour is reported twice, the most recently published value is used. If
          Elexon is unreachable, the app reports an error rather than an empty month.
        </p>

        <h3>What this does not show</h3>
        <p>
          Forecast error in MW is not a cost. No price data is included, so this tool does not estimate
          procurement cost or savings. The cause of any bias (for example, differences in wind farm
          coverage between the two datasets, or curtailment) cannot be determined from these two
          datasets alone.
        </p>

        {meta && (
          <>
            <h3>Data quality for this load</h3>
            <p className="num">
              FUELHH rows {meta.quality.actual_rows} (dropped {meta.quality.actual_rows_dropped}, revised{' '}
              {meta.quality.actual_duplicates}) · WINDFOR rows {meta.quality.forecast_rows} (dropped{' '}
              {meta.quality.forecast_rows_dropped}, conflicting {meta.quality.forecast_conflicts})
            </p>
          </>
        )}
      </details>
    </section>
  )
}
