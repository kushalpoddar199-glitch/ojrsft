"""Unit tests for the analytical core. All data here is synthetic and test-only."""

import math
from datetime import date, datetime, time, timezone

import pytest

from app.analytics.metrics import (
    MATCHED, MISSING_ACTUAL, MISSING_BOTH, NO_FORECAST, join_intervals, percentile, summarise,
)
from app.analytics.selection import (
    ForecastPoint, decision_cutoff, delivery_date, expected_intervals,
    select_day_ahead_forecasts,
)

CUTOFF = time(9, 50)


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


# --- cutoff and timezone -----------------------------------------------------

def test_cutoff_in_winter_is_same_as_utc():
    # 10 Jan delivery -> 09 Jan 09:50 GMT
    assert decision_cutoff(utc(2026, 1, 10, 12, 0), CUTOFF) == utc(2026, 1, 9, 9, 50)


def test_cutoff_in_summer_shifts_back_an_hour():
    # 1 Jul delivery -> 30 Jun 09:50 BST = 08:50 UTC
    assert decision_cutoff(utc(2026, 7, 1, 12, 0), CUTOFF) == utc(2026, 6, 30, 8, 50)


def test_cutoff_on_day_after_spring_clock_change():
    # Clocks go forward 29 Mar 2026; 29 Mar 09:50 is already BST
    assert decision_cutoff(utc(2026, 3, 30, 0, 0), CUTOFF) == utc(2026, 3, 29, 8, 50)


def test_late_evening_bst_interval_belongs_to_next_local_day():
    # 23:30 UTC on 30 Jun is 00:30 BST on 1 Jul
    t = utc(2026, 6, 30, 23, 30)
    assert delivery_date(t) == date(2026, 7, 1)
    assert decision_cutoff(t, CUTOFF) == utc(2026, 6, 30, 8, 50)


@pytest.mark.parametrize("day,count", [
    (date(2026, 1, 15), 48),
    (date(2026, 3, 29), 46),   # spring forward
    (date(2026, 10, 25), 50),  # fall back
])
def test_interval_counts_follow_local_days(day, count):
    assert len(expected_intervals(day, day)) == count


def test_january_window_has_48_per_day():
    ts = expected_intervals(date(2026, 1, 2), date(2026, 2, 1))
    assert len(ts) == 31 * 48
    assert ts[0] == utc(2026, 1, 2, 0, 0)
    assert ts[-1] == utc(2026, 2, 1, 23, 30)


# --- forecast selection -------------------------------------------------------

T = utc(2026, 1, 10, 12, 0)  # cutoff 2026-01-09 09:50 UTC


def test_latest_eligible_forecast_is_selected():
    fs = [
        ForecastPoint(T, utc(2026, 1, 8, 20, 0), 1000.0),
        ForecastPoint(T, utc(2026, 1, 9, 9, 30), 1200.0),
        ForecastPoint(T, utc(2026, 1, 9, 3, 0), 1100.0),
    ]
    sel = select_day_ahead_forecasts(fs, CUTOFF)[T]
    assert sel.generation == 1200.0
    assert sel.publish_time == utc(2026, 1, 9, 9, 30)


def test_forecast_published_exactly_at_cutoff_is_eligible():
    fs = [ForecastPoint(T, utc(2026, 1, 9, 9, 50), 900.0)]
    assert select_day_ahead_forecasts(fs, CUTOFF)[T].generation == 900.0


def test_forecasts_after_cutoff_are_excluded_even_if_more_accurate():
    fs = [
        ForecastPoint(T, utc(2026, 1, 9, 8, 0), 1000.0),
        ForecastPoint(T, utc(2026, 1, 9, 9, 51), 5000.0),
        ForecastPoint(T, utc(2026, 1, 10, 11, 0), 5000.0),
    ]
    sel = select_day_ahead_forecasts(fs, CUTOFF)[T]
    assert sel.generation == 1000.0
    assert sel.publish_time <= sel.cutoff


def test_interval_with_only_late_forecasts_has_no_selection():
    fs = [ForecastPoint(T, utc(2026, 1, 9, 10, 0), 1000.0)]
    assert T not in select_day_ahead_forecasts(fs, CUTOFF)


def test_null_latest_value_falls_back_to_previous_run():
    fs = [
        ForecastPoint(T, utc(2026, 1, 9, 6, 0), 800.0),
        ForecastPoint(T, utc(2026, 1, 9, 9, 0), None),
    ]
    sel = select_day_ahead_forecasts(fs, CUTOFF)[T]
    assert sel.generation == 800.0
    assert sel.publish_time == utc(2026, 1, 9, 6, 0)


def test_duplicate_records_are_deterministic_regardless_of_order():
    pub = utc(2026, 1, 9, 9, 0)
    a = [ForecastPoint(T, pub, 1000.0), ForecastPoint(T, pub, 1000.0)]
    assert select_day_ahead_forecasts(a, CUTOFF)[T].had_conflict is False

    b = [ForecastPoint(T, pub, 1000.0), ForecastPoint(T, pub, 1050.0)]
    r1 = select_day_ahead_forecasts(b, CUTOFF)[T]
    r2 = select_day_ahead_forecasts(list(reversed(b)), CUTOFF)[T]
    assert r1 == r2
    assert r1.had_conflict is True


def test_each_interval_uses_its_own_cutoff():
    t1 = utc(2026, 1, 10, 0, 0)   # cutoff 9 Jan 09:50
    t2 = utc(2026, 1, 11, 0, 0)   # cutoff 10 Jan 09:50
    pub = utc(2026, 1, 9, 12, 0)  # after t1's cutoff, before t2's
    sel = select_day_ahead_forecasts(
        [ForecastPoint(t1, pub, 1.0), ForecastPoint(t2, pub, 2.0)], CUTOFF
    )
    assert t1 not in sel
    assert sel[t2].generation == 2.0


def test_empty_forecasts():
    assert select_day_ahead_forecasts([], CUTOFF) == {}


# --- join and metrics ---------------------------------------------------------

def _rows(actuals, forecasts):
    """Build joined rows from {hour: value} dicts on a fixed test day."""
    times = [utc(2026, 1, 10, h, 0) for h in range(len(actuals))]
    pub = utc(2026, 1, 9, 9, 0)
    a = {t: v for t, v in zip(times, actuals) if v is not None}
    f = {
        t: select_day_ahead_forecasts([ForecastPoint(t, pub, v)], CUTOFF)[t]
        for t, v in zip(times, forecasts) if v is not None
    }
    return join_intervals(times, a, f)


def test_join_aligns_on_delivery_interval_and_flags_gaps():
    rows = _rows([100.0, None, 300.0, None], [110.0, 200.0, None, None])
    assert [r.status for r in rows] == [MATCHED, MISSING_ACTUAL, NO_FORECAST, MISSING_BOTH]
    assert rows[0].error == 10.0
    assert rows[1].actual is None and rows[1].error is None  # not zero


def test_metrics_on_known_values():
    # errors: +100, -100, +200, -200
    rows = _rows([1000.0, 1000.0, 2000.0, 2000.0], [1100.0, 900.0, 2200.0, 1800.0])
    s = summarise(rows, mape_min_actual_mw=0)
    assert s["mae"] == pytest.approx(150.0)
    assert s["rmse"] == pytest.approx(math.sqrt((100**2 * 2 + 200**2 * 2) / 4))
    assert s["bias"] == pytest.approx(0.0)
    assert s["mape"] == pytest.approx((0.1 + 0.1 + 0.1 + 0.1) / 4)
    assert s["coverage"] == 1.0


def test_gaps_do_not_corrupt_metrics():
    rows = _rows([1000.0, None, 1000.0, 1000.0], [1100.0, 5000.0, None, 1300.0])
    s = summarise(rows, mape_min_actual_mw=0)
    assert s["matched_intervals"] == 2
    assert s["mae"] == pytest.approx(200.0)
    assert s["bias"] == pytest.approx(200.0)
    assert s["coverage"] == pytest.approx(0.5)
    assert s["missing_actual"] == 1
    assert s["no_eligible_forecast"] == 1


def test_mape_skips_low_actuals():
    rows = _rows([50.0, 2000.0], [250.0, 2200.0])
    s = summarise(rows, mape_min_actual_mw=500)
    assert s["mape_intervals"] == 1
    assert s["mape"] == pytest.approx(0.1)
    assert s["mae"] == pytest.approx(200.0)  # MAE still uses both


def test_summary_of_nothing_matched():
    s = summarise(_rows([None, None], [None, None]), mape_min_actual_mw=0)
    assert s["matched_intervals"] == 0
    assert s["mae"] is None and s["coverage"] == 0.0


def test_summary_of_empty_period():
    s = summarise([], mape_min_actual_mw=0)
    assert s["expected_intervals"] == 0 and s["coverage"] is None


def test_percentile_matches_linear_interpolation():
    assert percentile([0.0, 10.0], 0.5) == 5.0
    assert percentile([1.0, 2.0, 3.0, 4.0, 5.0], 0.9) == pytest.approx(4.6)
