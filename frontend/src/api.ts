import type { Analysis, Filters } from './types'

// Same-origin by default (Vercel serves both); override for a split deployment.
const BASE = import.meta.env.VITE_API_BASE ?? ''

export class ApiError extends Error {}

export async function fetchAnalysis(f: Filters, signal?: AbortSignal): Promise<Analysis> {
  const q = new URLSearchParams({ start: f.start, end: f.end, cutoff: f.cutoff })
  let res: Response
  try {
    res = await fetch(`${BASE}/api/analysis?${q}`, { signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('Could not reach the analysis service.')
  }
  if (!res.ok) {
    let detail = `The analysis service returned an error (${res.status}).`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      // keep the generic message
    }
    throw new ApiError(detail)
  }
  return res.json()
}
