from datetime import date, time

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    elexon_timeout_s: float = 30.0

    # Purchase decisions made 1-31 Jan 2026 are for delivery days 2 Jan - 1 Feb.
    delivery_first_day: date = date(2026, 1, 2)
    delivery_last_day: date = date(2026, 2, 1)

    # UK local time on D-1. 09:50 is Nord Pool's GB day-ahead auction gate closure.
    default_cutoff: time = time(9, 50)

    # MAPE ignores hours where actual wind is below this (see metrics.summarise).
    mape_min_actual_mw: float = 1000.0

    # How long fetched Elexon data is reused. January 2026 is historical, so
    # this mainly bounds how stale a revised upstream value could be.
    cache_ttl_s: int = 6 * 3600

    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
