// Mirrors backend/app/schemas.py. Timestamps are ISO 8601 UTC strings.

export type Status = 'matched' | 'missing_actual' | 'no_eligible_forecast' | 'missing_both'

export interface Row {
  start_time: string
  actual: number | null
  forecast: number | null
  publish_time: string | null
  lead_hours: number | null
  error: number | null
  status: Status
}

export interface Summary {
  expected_intervals: number
  matched_intervals: number
  missing_actual: number
  no_eligible_forecast: number
  coverage: number | null
  mae: number | null
  rmse: number | null
  bias: number | null
  mape: number | null
  mape_intervals: number
  error_p10: number | null
  error_p50: number | null
  error_p90: number | null
  abs_error_p95: number | null
}

export interface Day {
  date: string
  expected: number
  matched: number
  mae: number | null
  bias: number | null
}

export interface Meta {
  first_day: string
  last_day: string
  cutoff: string
  fetched_at: string
  mape_min_actual_mw: number
  runs_used: Record<string, number>
  quality: {
    actual_rows: number
    actual_rows_dropped: number
    actual_duplicates: number
    forecast_rows: number
    forecast_rows_dropped: number
    forecast_conflicts: number
  }
  warnings: string[]
}

export interface Analysis {
  meta: Meta
  summary: Summary
  daily: Day[]
  rows: Row[]
}

export interface Filters {
  start: string // YYYY-MM-DD, UK delivery day
  end: string
  cutoff: string // HH:MM, UK local on D-1
}
