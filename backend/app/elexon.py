"""Elexon BMRS client for the two datasets this app uses.

Both stream endpoints return a bare JSON array. Rows that fail validation are
dropped and counted, so a few malformed records cannot corrupt the analysis
and the count is still visible in the response.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

import httpx

from .analytics.selection import ForecastPoint

log = logging.getLogger(__name__)


class UpstreamError(Exception):
    """Elexon could not be reached or returned something unusable."""


@dataclass
class ParseReport:
    rows: int = 0
    dropped: int = 0
    duplicates: int = 0
    samples: list[str] = field(default_factory=list)

    def drop(self, why: str) -> None:
        self.dropped += 1
        if len(self.samples) < 5:
            self.samples.append(why)


def parse_time(value) -> datetime:
    """Elexon timestamps are ISO 8601 in UTC with a trailing Z."""
    if not isinstance(value, str):
        raise ValueError(f"timestamp is {type(value).__name__}")
    t = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if t.tzinfo is None:
        raise ValueError("timestamp has no timezone")
    return t.astimezone(timezone.utc)


def parse_mw(value) -> float | None:
    """MW value, or None when missing. Never turns a missing value into 0."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"generation is {type(value).__name__}")
    return float(value)


def parse_actuals(payload) -> tuple[dict[datetime, float], ParseReport]:
    """FUELHH WIND rows -> {startTime: MW}.

    If a half-hour appears more than once, the row with the latest
    publishTime wins (treated as a revision).
    """
    if not isinstance(payload, list):
        raise UpstreamError("FUELHH response was not a list")
    report = ParseReport()
    best: dict[datetime, tuple[datetime, float]] = {}
    for row in payload:
        report.rows += 1
        try:
            if row.get("fuelType") != "WIND":
                report.drop(f"fuelType {row.get('fuelType')!r}")
                continue
            start = parse_time(row["startTime"])
            published = parse_time(row["publishTime"])
            mw = parse_mw(row.get("generation"))
        except (KeyError, ValueError, AttributeError) as e:
            report.drop(f"invalid row: {e}")
            continue
        if mw is None:
            report.drop("null generation")
            continue
        if start in best:
            report.duplicates += 1
            if published <= best[start][0]:
                continue
        best[start] = (published, mw)
    return {t: mw for t, (_, mw) in best.items()}, report


def parse_forecasts(payload) -> tuple[list[ForecastPoint], ParseReport]:
    """WINDFOR rows -> ForecastPoints. Nulls are kept as None so selection
    can fall back to an earlier run; duplicates are resolved in selection."""
    if not isinstance(payload, list):
        raise UpstreamError("WINDFOR response was not a list")
    report = ParseReport()
    out = []
    for row in payload:
        report.rows += 1
        try:
            out.append(
                ForecastPoint(
                    start_time=parse_time(row["startTime"]),
                    publish_time=parse_time(row["publishTime"]),
                    generation=parse_mw(row.get("generation")),
                )
            )
        except (KeyError, ValueError, AttributeError) as e:
            report.drop(f"invalid row: {e}")
    return out, report


class ElexonClient:
    def __init__(self, base_url: str, timeout_s: float):
        self._http = httpx.AsyncClient(base_url=base_url, timeout=timeout_s)

    async def close(self) -> None:
        await self._http.aclose()

    async def _get(self, path: str, params: dict) -> object:
        try:
            r = await self._http.get(path, params=params)
        except httpx.TimeoutException as e:
            raise UpstreamError(f"Elexon timed out on {path}") from e
        except httpx.HTTPError as e:
            raise UpstreamError(f"could not reach Elexon ({type(e).__name__})") from e
        if r.status_code == 429:
            raise UpstreamError("Elexon rate limit hit, try again shortly")
        if r.status_code != 200:
            raise UpstreamError(f"Elexon returned HTTP {r.status_code} for {path}")
        try:
            return r.json()
        except ValueError as e:
            raise UpstreamError(f"Elexon returned non-JSON for {path}") from e

    async def actuals(self, first_day: date, last_day: date):
        payload = await self._get(
            "/datasets/FUELHH/stream",
            {
                "settlementDateFrom": first_day.isoformat(),
                "settlementDateTo": last_day.isoformat(),
                "fuelType": "WIND",
            },
        )
        return parse_actuals(payload)

    async def forecasts(self, published_from: datetime, published_to: datetime):
        payload = await self._get(
            "/datasets/WINDFOR/stream",
            {
                "publishDateTimeFrom": published_from.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "publishDateTimeTo": published_to.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        )
        return parse_forecasts(payload)
