"""API and parsing tests. Upstream is replaced by a stub; all data is synthetic."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import main
from app.config import Settings
from app.elexon import UpstreamError, parse_actuals, parse_forecasts
from app.service import DataStore

UTC = timezone.utc


def fuel_rows(day0="2026-01-02", days=2, mw=1000):
    start = datetime.fromisoformat(day0).replace(tzinfo=UTC)
    out = []
    for i in range(days * 48):
        t = start + timedelta(minutes=30 * i)
        out.append({
            "dataset": "FUELHH", "fuelType": "WIND", "generation": mw,
            "startTime": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "publishTime": (t + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })
    return out


def wind_rows(day0="2026-01-02", days=2, mw=1100):
    """One run at 09:30 UTC on each D-1, plus a late 15:30 run that must be ignored."""
    out = []
    start = datetime.fromisoformat(day0).replace(tzinfo=UTC)
    for d in range(days):
        day = start + timedelta(days=d)
        for pub, val in [(day - timedelta(hours=14, minutes=30), mw), (day - timedelta(hours=8, minutes=30), 99999)]:
            for h in range(24):
                out.append({
                    "dataset": "WINDFOR", "generation": val,
                    "startTime": (day + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "publishTime": pub.strftime("%Y-%m-%dT%H:%M:%SZ"),
                })
    return out


class StubClient:
    def __init__(self, fuel=None, wind=None, fail=False):
        self.fuel, self.wind, self.fail, self.calls = fuel, wind, fail, 0

    async def actuals(self, first, last):
        self.calls += 1
        if self.fail:
            raise UpstreamError("Elexon timed out on /datasets/FUELHH/stream")
        return parse_actuals(self.fuel)

    async def forecasts(self, a, b):
        if self.fail:
            raise UpstreamError("Elexon timed out on /datasets/WINDFOR/stream")
        return parse_forecasts(self.wind)


SETTINGS = Settings(delivery_first_day="2026-01-02", delivery_last_day="2026-01-03")


@pytest.fixture
def api(monkeypatch):
    def make(stub):
        monkeypatch.setattr(main, "settings", SETTINGS)
        monkeypatch.setattr(main, "_store", DataStore(stub, SETTINGS))
        return TestClient(main.app)
    return make


def test_health(api):
    r = api(StubClient(fuel_rows(), wind_rows())).get("/api/health")
    assert r.status_code == 200 and r.json()["data_loaded"] is False


def test_analysis_uses_pre_cutoff_run_only(api):
    body = api(StubClient(fuel_rows(), wind_rows())).get("/api/analysis").json()
    s = body["summary"]
    assert s["expected_intervals"] == 48 and s["matched_intervals"] == 48
    assert s["mae"] == pytest.approx(100.0) and s["bias"] == pytest.approx(100.0)
    assert all(r["forecast"] == 1100 for r in body["rows"])
    assert body["meta"]["runs_used"] == {"09:30": 48}


def test_later_cutoff_picks_later_run(api):
    body = api(StubClient(fuel_rows(), wind_rows())).get("/api/analysis?cutoff=16:00").json()
    assert all(r["forecast"] == 99999 for r in body["rows"])


def test_date_filter_narrows_results(api):
    body = api(StubClient(fuel_rows(), wind_rows())).get("/api/analysis?start=2026-01-03&end=2026-01-03").json()
    assert body["summary"]["expected_intervals"] == 24
    assert len(body["daily"]) == 1


@pytest.mark.parametrize("query", [
    "start=2025-12-31", "end=2026-02-05", "start=2026-01-03&end=2026-01-02",
    "cutoff=25:00", "cutoff=9am", "start=not-a-date",
])
def test_invalid_inputs_are_rejected(api, query):
    assert api(StubClient(fuel_rows(), wind_rows())).get(f"/api/analysis?{query}").status_code == 422


def test_upstream_failure_is_503_not_an_empty_month(api):
    r = api(StubClient(fail=True)).get("/api/analysis")
    assert r.status_code == 503
    assert "unavailable" in r.json()["detail"]


def test_empty_upstream_response_is_an_error(api):
    assert api(StubClient(fuel=[], wind=[])).get("/api/analysis").status_code == 503


def test_stale_cache_is_served_with_warning(api, monkeypatch):
    stub = StubClient(fuel_rows(), wind_rows())
    client = api(stub)
    assert client.get("/api/analysis").status_code == 200
    stub.fail = True
    monkeypatch.setattr(SETTINGS, "cache_ttl_s", -1)  # force a refresh attempt
    body = client.get("/api/analysis").json()
    assert body["meta"]["warnings"][0].startswith("Could not refresh from Elexon")
    assert body["summary"]["matched_intervals"] == 48


def test_missing_actuals_reported_not_zeroed(api):
    fuel = [r for r in fuel_rows() if not r["startTime"].startswith("2026-01-02T05")]
    body = api(StubClient(fuel, wind_rows())).get("/api/analysis").json()
    hour5 = next(r for r in body["rows"] if r["start_time"].startswith("2026-01-02T05:00"))
    assert hour5["actual"] is None and hour5["status"] == "missing_actual"
    assert body["summary"]["coverage"] == pytest.approx(47 / 48)
    assert body["meta"]["warnings"]


# --- parsing ------------------------------------------------------------------

def test_parse_actuals_drops_bad_rows_and_keeps_latest_revision():
    rows = fuel_rows(days=1)[:2]
    revised = dict(rows[0], generation=1234, publishTime="2026-01-02T01:00:00Z")
    bad = [
        dict(rows[1], generation=None),
        dict(rows[1], generation="lots"),
        dict(rows[1], startTime="yesterday"),
        dict(rows[1], fuelType="CCGT"),
        {"unexpected": True},
    ]
    actuals, rep = parse_actuals(rows + [revised] + bad)
    assert actuals[datetime(2026, 1, 2, tzinfo=UTC)] == 1234.0
    assert rep.duplicates == 1 and rep.dropped == 5
    assert len(actuals) == 2


def test_parse_rejects_non_list_payload():
    with pytest.raises(UpstreamError):
        parse_actuals({"error": "nope"})
    with pytest.raises(UpstreamError):
        parse_forecasts("oops")


def test_parse_forecasts_keeps_nulls_as_none():
    rows = wind_rows(days=1)[:1]
    pts, rep = parse_forecasts([dict(rows[0], generation=None)])
    assert pts[0].generation is None and rep.dropped == 0
