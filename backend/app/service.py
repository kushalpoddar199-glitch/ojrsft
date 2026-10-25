"""Fetches, caches and analyses the data for one request.

Raw Elexon data for the whole window is fetched once and held in memory.
Every request then re-runs selection and metrics on that raw data, which
takes milliseconds, so changing the cutoff or date range never refetches.
"""

from __future__ import annotations

import asyncio
import logging
import time as clock
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from .analytics.metrics import join_intervals, summarise
from .analytics.selection import (
    LONDON, ForecastPoint, delivery_date, expected_intervals, hourly_actuals,
    select_day_ahead_forecasts,
)
from .config import Settings
from .elexon import ElexonClient, ParseReport, UpstreamError

log = logging.getLogger(__name__)
HOUR = timedelta(hours=1)


@dataclass
class RawData:
    actuals_hh: dict[datetime, float]
    forecasts: list[ForecastPoint]
    actuals_report: ParseReport
    forecasts_report: ParseReport
    fetched_at: datetime
    loaded_monotonic: float


class DataStore:
    def __init__(self, client: ElexonClient, settings: Settings):
        self._client = client
        self._s = settings
        self._raw: RawData | None = None
        self._lock = asyncio.Lock()

    def forecast_publish_range(self) -> tuple[datetime, datetime]:
        """Every run that could be the selected one, for any cutoff on D-1.

        Runs reach ~66h ahead, so 4 days of lookback covers fallback to older
        runs. The range must reach the end of the last D-1: stopping short
        would silently make selection fall back to an older run.
        """
        first = self._s.delivery_first_day - timedelta(days=4)
        last = self._s.delivery_last_day  # midnight at the end of D-1
        to_utc = lambda d: datetime.combine(d, time(0), tzinfo=LONDON).astimezone(timezone.utc)
        return to_utc(first), to_utc(last)

    async def get(self) -> tuple[RawData, str | None]:
        """Cached raw data plus a warning if it is being served stale."""
        fresh = self._raw and clock.monotonic() - self._raw.loaded_monotonic < self._s.cache_ttl_s
        if fresh:
            return self._raw, None
        async with self._lock:
            if self._raw and clock.monotonic() - self._raw.loaded_monotonic < self._s.cache_ttl_s:
                return self._raw, None
            try:
                self._raw = await self._load()
                return self._raw, None
            except UpstreamError as e:
                if self._raw is None:
                    raise
                log.warning("refresh failed, serving cached data: %s", e)
                return self._raw, f"Could not refresh from Elexon ({e}); showing data fetched at {self._raw.fetched_at:%Y-%m-%d %H:%M} UTC."

    async def _load(self) -> RawData:
        pub_from, pub_to = self.forecast_publish_range()
        (actuals, a_rep), (forecasts, f_rep) = await asyncio.gather(
            self._client.actuals(self._s.delivery_first_day, self._s.delivery_last_day),
            self._client.forecasts(pub_from, pub_to),
        )
        log.info(
            "loaded %d actual half-hours (%d dropped), %d forecast points (%d dropped)",
            len(actuals), a_rep.dropped, len(forecasts), f_rep.dropped,
        )
        if not actuals or not forecasts:
            # An empty month from a working API is a data problem, not "no wind".
            raise UpstreamError("Elexon returned no data for the requested window")
        return RawData(
            actuals, forecasts, a_rep, f_rep,
            fetched_at=datetime.now(timezone.utc),
            loaded_monotonic=clock.monotonic(),
        )


def analyse(
    raw: RawData, first_day: date, last_day: date, cutoff: time, settings: Settings
) -> dict:
    expected = expected_intervals(first_day, last_day, step=HOUR)
    actuals = hourly_actuals(raw.actuals_hh)
    selected = select_day_ahead_forecasts(raw.forecasts, cutoff)
    rows = join_intervals(expected, actuals, selected)

    by_day = defaultdict(list)
    for r in rows:
        by_day[delivery_date(r.start_time)].append(r)
    daily = []
    for d, day_rows in sorted(by_day.items()):
        s = summarise(day_rows, settings.mape_min_actual_mw)
        daily.append({
            "date": d, "expected": s["expected_intervals"], "matched": s["matched_intervals"],
            "mae": s["mae"], "bias": s["bias"],
        })

    in_window = {r.start_time for r in rows}
    used = [selected[t] for t in in_window if t in selected]
    runs_used = Counter(s.publish_time.astimezone(LONDON).strftime("%H:%M") for s in used)
    conflicts = sum(s.had_conflict for s in used)

    summary = summarise(rows, settings.mape_min_actual_mw)
    warnings = []
    if summary["coverage"] is not None and summary["coverage"] < 1:
        warnings.append(
            f"{summary['expected_intervals'] - summary['matched_intervals']} of "
            f"{summary['expected_intervals']} hours are missing an actual or an eligible forecast."
        )
    if raw.actuals_report.dropped or raw.forecasts_report.dropped:
        warnings.append(
            f"Dropped {raw.actuals_report.dropped} actual and "
            f"{raw.forecasts_report.dropped} forecast rows that failed validation."
        )
    if conflicts:
        warnings.append(f"{conflicts} hours had conflicting values within one forecast run.")

    return {
        "meta": {
            "first_day": first_day,
            "last_day": last_day,
            "cutoff": cutoff.strftime("%H:%M"),
            "fetched_at": raw.fetched_at,
            "mape_min_actual_mw": settings.mape_min_actual_mw,
            "runs_used": dict(runs_used),
            "quality": {
                "actual_rows": raw.actuals_report.rows,
                "actual_rows_dropped": raw.actuals_report.dropped,
                "actual_duplicates": raw.actuals_report.duplicates,
                "forecast_rows": raw.forecasts_report.rows,
                "forecast_rows_dropped": raw.forecasts_report.dropped,
                "forecast_conflicts": conflicts,
            },
            "warnings": warnings,
        },
        "summary": summary,
        "daily": daily,
        "rows": [
            {
                "start_time": r.start_time,
                "actual": r.actual,
                "forecast": r.forecast,
                "publish_time": r.publish_time,
                "lead_hours": r.lead_hours,
                "error": r.error,
                "status": r.status,
            }
            for r in rows
        ],
    }
