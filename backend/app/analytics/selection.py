"""Day-ahead forecast vintage selection.

The procurement team buys on D-1, so for every delivery interval on day D the
only usable forecast is one that had been published by the day-ahead decision
cutoff on D-1. A later forecast would have been more accurate, but nobody had
it when the purchase was made, so using it would overstate forecast quality.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

LONDON = ZoneInfo("Europe/London")
INTERVAL = timedelta(minutes=30)


@dataclass(frozen=True)
class ForecastPoint:
    start_time: datetime  # delivery interval start, UTC
    publish_time: datetime  # when the forecast was published, UTC
    generation: float | None  # MW; None when the source value is missing


@dataclass(frozen=True)
class SelectedForecast:
    generation: float
    publish_time: datetime
    cutoff: datetime
    # True when a single publish run held conflicting values for this interval
    had_conflict: bool = False


def delivery_date(start_time: datetime) -> date:
    """GB settlement days run midnight to midnight in UK local time."""
    return start_time.astimezone(LONDON).date()


def decision_cutoff(start_time: datetime, cutoff_local: time) -> datetime:
    """UTC instant by which the forecast for this interval must be published.

    The cutoff is a UK wall-clock time on the day before delivery, so it is
    built in Europe/London and converted, which keeps it right across BST.
    """
    day_before = delivery_date(start_time) - timedelta(days=1)
    local = datetime.combine(day_before, cutoff_local, tzinfo=LONDON)
    return local.astimezone(timezone.utc)


def select_day_ahead_forecasts(
    forecasts: list[ForecastPoint], cutoff_local: time
) -> dict[datetime, SelectedForecast]:
    """For each delivery interval, pick the latest valid forecast published at
    or before that interval's day-ahead cutoff.

    Intervals with no eligible forecast are absent from the result; callers
    report them as unavailable rather than filling them with later data.

    Null values are skipped, so if the latest run before the cutoff had no
    value we fall back to the previous run, which was also available in time.
    When one publish run holds several different values for the same
    interval, the highest is kept. This is arbitrary but independent of input
    order, and the conflict is flagged.
    """
    by_interval: dict[datetime, dict[datetime, set[float]]] = {}
    for f in forecasts:
        if f.generation is None:
            continue
        if f.publish_time > decision_cutoff(f.start_time, cutoff_local):
            continue
        runs = by_interval.setdefault(f.start_time, {})
        runs.setdefault(f.publish_time, set()).add(f.generation)

    selected: dict[datetime, SelectedForecast] = {}
    for start, runs in by_interval.items():
        latest = max(runs)
        values = runs[latest]
        selected[start] = SelectedForecast(
            generation=max(values),
            publish_time=latest,
            cutoff=decision_cutoff(start, cutoff_local),
            had_conflict=len(values) > 1,
        )
    return selected


def expected_intervals(
    first_day: date, last_day: date, step: timedelta = INTERVAL
) -> list[datetime]:
    """Every delivery interval start (UTC) from first_day to last_day
    inclusive, in UK local days. Clock-change days get 46/50 half-hours
    (23/25 hours), which falls out of stepping in UTC between local midnights.
    """
    start = datetime.combine(first_day, time(0), tzinfo=LONDON).astimezone(timezone.utc)
    end = datetime.combine(
        last_day + timedelta(days=1), time(0), tzinfo=LONDON
    ).astimezone(timezone.utc)
    out = []
    t = start
    while t < end:
        out.append(t)
        t += step
    return out


def hourly_actuals(half_hourly: dict[datetime, float]) -> dict[datetime, float]:
    """Average FUELHH half-hours (each an average MW over 30 min) into hourly
    average MW, to line up with WINDFOR, which is published hourly.

    An hour is only kept when both halves exist; one half is not treated as
    the whole hour.
    """
    out = {}
    for t, v in half_hourly.items():
        if t.minute == 0:
            second = half_hourly.get(t + INTERVAL)
            if second is not None:
                out[t] = (v + second) / 2
    return out
