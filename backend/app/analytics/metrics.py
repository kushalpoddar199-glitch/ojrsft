"""Join actuals to selected forecasts and compute accuracy metrics.

Error convention throughout: error = forecast - actual (MW).
Positive error means the forecast over-predicted wind, i.e. less wind turned
up than planned for.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime

from .selection import SelectedForecast

MATCHED = "matched"
MISSING_ACTUAL = "missing_actual"
NO_FORECAST = "no_eligible_forecast"
MISSING_BOTH = "missing_both"


@dataclass(frozen=True)
class IntervalResult:
    start_time: datetime
    actual: float | None
    forecast: float | None
    publish_time: datetime | None
    status: str

    @property
    def error(self) -> float | None:
        if self.actual is None or self.forecast is None:
            return None
        return self.forecast - self.actual

    @property
    def lead_hours(self) -> float | None:
        """How far ahead of delivery the selected forecast was published."""
        if self.publish_time is None:
            return None
        return (self.start_time - self.publish_time).total_seconds() / 3600


def join_intervals(
    expected: list[datetime],
    actuals: dict[datetime, float],
    forecasts: dict[datetime, SelectedForecast],
) -> list[IntervalResult]:
    """One row per expected interval. Gaps stay as None, never as 0."""
    rows = []
    for t in expected:
        a = actuals.get(t)
        f = forecasts.get(t)
        if a is not None and f is not None:
            status = MATCHED
        elif a is None and f is None:
            status = MISSING_BOTH
        elif a is None:
            status = MISSING_ACTUAL
        else:
            status = NO_FORECAST
        rows.append(
            IntervalResult(
                start_time=t,
                actual=a,
                forecast=f.generation if f else None,
                publish_time=f.publish_time if f else None,
                status=status,
            )
        )
    return rows


def percentile(sorted_values: list[float], q: float) -> float:
    """Linear-interpolation percentile (same as numpy's default)."""
    if not sorted_values:
        raise ValueError("empty")
    pos = (len(sorted_values) - 1) * q
    lo = math.floor(pos)
    hi = math.ceil(pos)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo)


def summarise(rows: list[IntervalResult], mape_min_actual_mw: float) -> dict:
    """Aggregate metrics over matched intervals.

    MAPE only uses intervals where actual >= mape_min_actual_mw. Near-zero
    wind makes percentage error meaningless (a 200 MW miss on 50 MW is 400%),
    so those intervals are excluded from MAPE alone and the count is reported.
    """
    errors = [r.error for r in rows if r.error is not None]
    expected = len(rows)
    counts = {
        "expected_intervals": expected,
        "matched_intervals": len(errors),
        "missing_actual": sum(r.status in (MISSING_ACTUAL, MISSING_BOTH) for r in rows),
        "no_eligible_forecast": sum(r.status in (NO_FORECAST, MISSING_BOTH) for r in rows),
        "coverage": len(errors) / expected if expected else None,
    }
    if not errors:
        return {
            **counts,
            "mae": None, "rmse": None, "bias": None, "mape": None,
            "mape_intervals": 0,
            "error_p10": None, "error_p50": None, "error_p90": None,
            "abs_error_p95": None,
        }

    n = len(errors)
    abs_errors = sorted(abs(e) for e in errors)
    signed = sorted(errors)
    ape = [
        abs(r.error) / r.actual
        for r in rows
        if r.error is not None and r.actual >= mape_min_actual_mw
    ]
    return {
        **counts,
        "mae": sum(abs_errors) / n,
        "rmse": math.sqrt(sum(e * e for e in errors) / n),
        "bias": sum(errors) / n,
        "mape": sum(ape) / len(ape) if ape else None,
        "mape_intervals": len(ape),
        "error_p10": percentile(signed, 0.10),
        "error_p50": percentile(signed, 0.50),
        "error_p90": percentile(signed, 0.90),
        "abs_error_p95": percentile(abs_errors, 0.95),
    }
