// Frontend behaviour tests. fetch is mocked; all data here is synthetic and test-only.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { histogram } from './components/charts'
import { fmtMW } from './format'
import type { Analysis, Row } from './types'

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver

function analysis(rows: Row[], warnings: string[] = []): Analysis {
  const matched = rows.filter((r) => r.status === 'matched').length
  return {
    meta: {
      first_day: '2026-01-02', last_day: '2026-01-02', cutoff: '09:50',
      fetched_at: '2026-10-25T10:00:00Z', mape_min_actual_mw: 1000, runs_used: { '09:30': matched },
      quality: { actual_rows: 48, actual_rows_dropped: 0, actual_duplicates: 0, forecast_rows: 24, forecast_rows_dropped: 0, forecast_conflicts: 0 },
      warnings,
    },
    summary: {
      expected_intervals: rows.length, matched_intervals: matched,
      missing_actual: rows.length - matched, no_eligible_forecast: 0,
      coverage: rows.length ? matched / rows.length : null,
      mae: matched ? 100 : null, rmse: matched ? 100 : null, bias: matched ? 100 : null, mape: null,
      mape_intervals: 0, error_p10: matched ? 100 : null, error_p50: matched ? 100 : null,
      error_p90: matched ? 100 : null, abs_error_p95: matched ? 100 : null,
    },
    daily: [{ date: '2026-01-02', expected: rows.length, matched, mae: 100, bias: 100 }],
    rows,
  }
}

const row = (h: number, actual: number | null): Row => ({
  start_time: `2026-01-02T${String(h).padStart(2, '0')}:00:00Z`,
  actual, forecast: 1100, publish_time: '2026-01-01T09:30:00Z', lead_hours: 14.5 + h,
  error: actual == null ? null : 1100 - actual,
  status: actual == null ? 'missing_actual' : 'matched',
})

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('App states', () => {
  it('shows a loading state before data arrives', () => {
    mockFetch(() => new Promise(() => {}))
    render(<App />)
    expect(screen.getByText(/Loading January 2026 data/)).toBeInTheDocument()
  })

  it('shows the API error message and no metrics on failure', async () => {
    mockFetch(async () => new Response(JSON.stringify({ detail: 'Elexon data is unavailable right now: timed out' }), { status: 503 }))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Elexon data is unavailable right now')
    expect(screen.queryByText('Mean absolute error')).not.toBeInTheDocument()
  })

  it('shows a network error when the API is unreachable', async () => {
    mockFetch(async () => { throw new TypeError('Failed to fetch') })
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the analysis service')
  })

  it('renders KPIs from the response', async () => {
    mockFetch(async () => new Response(JSON.stringify(analysis([row(0, 1000), row(1, 1000)]))))
    render(<App />)
    expect(await screen.findByText('Mean absolute error')).toBeInTheDocument()
    expect(screen.getByText('2 of 2 hours matched')).toBeInTheDocument()
  })

  it('surfaces partial-data warnings and shows gaps as dashes, not zero', async () => {
    const body = analysis([row(0, 1000), row(1, null)], ['1 of 2 hours are missing an actual or an eligible forecast.'])
    mockFetch(async () => new Response(JSON.stringify(body)))
    render(<App />)
    expect(await screen.findByText(/1 of 2 hours are missing/)).toBeInTheDocument()
    expect(screen.getByText('No actual')).toBeInTheDocument()
  })

  it('handles a period with no matched hours', async () => {
    mockFetch(async () => new Response(JSON.stringify(analysis([row(0, null)]))))
    render(<App />)
    expect(await screen.findByText(/No hours in this period have both/)).toBeInTheDocument()
  })
})

describe('helpers', () => {
  it('bins errors into 500 MW bands without losing any', () => {
    const bins = histogram([-600, -1, 0, 499, 500, 1200])
    expect(bins.map((b) => b.from)).toEqual([-1000, -500, 0, 500, 1000])
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(6)
    expect(bins.find((b) => b.from === 0)!.count).toBe(2)
  })

  it('formats missing values as a dash', () => {
    expect(fmtMW(null)).toBe('—')
    expect(fmtMW(1730.4, true)).toBe('+1,730')
  })
})
