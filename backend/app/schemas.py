from datetime import date, datetime

from pydantic import BaseModel


class Quality(BaseModel):
    actual_rows: int
    actual_rows_dropped: int
    actual_duplicates: int
    forecast_rows: int
    forecast_rows_dropped: int
    forecast_conflicts: int


class Meta(BaseModel):
    first_day: date
    last_day: date
    cutoff: str
    fetched_at: datetime
    mape_min_actual_mw: float
    runs_used: dict[str, int]  # selected run publish time (UK local) -> hours
    quality: Quality
    warnings: list[str]


class Summary(BaseModel):
    expected_intervals: int
    matched_intervals: int
    missing_actual: int
    no_eligible_forecast: int
    coverage: float | None
    mae: float | None
    rmse: float | None
    bias: float | None
    mape: float | None
    mape_intervals: int
    error_p10: float | None
    error_p50: float | None
    error_p90: float | None
    abs_error_p95: float | None


class Day(BaseModel):
    date: date
    expected: int
    matched: int
    mae: float | None
    bias: float | None


class Row(BaseModel):
    start_time: datetime
    actual: float | None
    forecast: float | None
    publish_time: datetime | None
    lead_hours: float | None
    error: float | None
    status: str


class Analysis(BaseModel):
    meta: Meta
    summary: Summary
    daily: list[Day]
    rows: list[Row]


class Health(BaseModel):
    status: str
    data_loaded: bool
    fetched_at: datetime | None
