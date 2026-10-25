import { useEffect, useState } from 'react'
import { fetchAnalysis } from './api'
import type { Analysis, Filters } from './types'

type State =
  | { status: 'loading'; data: Analysis | null }
  | { status: 'ready'; data: Analysis }
  | { status: 'error'; data: null; message: string }

/** Refetch whenever filters change. Earlier data stays on screen (dimmed)
 *  while the next request runs; an in-flight request is cancelled if
 *  superseded. On error the old data is dropped, since it no longer matches
 *  the filters on screen. */
export function useAnalysis(filters: Filters): State {
  const [state, setState] = useState<State>({ status: 'loading', data: null })
  const { start, end, cutoff } = filters

  useEffect(() => {
    const ctrl = new AbortController()
    setState((s) => ({ status: 'loading', data: s.data }))
    fetchAnalysis({ start, end, cutoff }, ctrl.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((e: Error) => {
        if (e.name === 'AbortError') return
        setState({ status: 'error', data: null, message: e.message })
      })
    return () => ctrl.abort()
  }, [start, end, cutoff])

  return state
}
