import logging
from datetime import date, time

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .elexon import ElexonClient, UpstreamError
from .schemas import Analysis, Health
from .service import DataStore, analyse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title="REint Wind Forecast Intelligence API",
    description="Day-ahead GB wind forecast accuracy from Elexon BMRS (FUELHH, WINDFOR).",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET"], allow_headers=["*"]
)

# Created on first use rather than at startup so the app also works on
# serverless hosts that do not run ASGI lifespan events.
_store: DataStore | None = None


def store() -> DataStore:
    global _store
    if _store is None:
        _store = DataStore(ElexonClient(settings.elexon_base_url, settings.elexon_timeout_s), settings)
    return _store


@app.get("/api/health", response_model=Health)
def health():
    raw = store()._raw
    return Health(status="ok", data_loaded=raw is not None, fetched_at=raw.fetched_at if raw else None)


@app.get("/api/analysis", response_model=Analysis)
async def analysis(
    start: date | None = Query(None, description="First delivery day (UK local), default window start"),
    end: date | None = Query(None, description="Last delivery day (UK local), default window end"),
    cutoff: str | None = Query(
        None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
        description="Decision cutoff on D-1 as HH:MM UK local time, default 09:50",
    ),
):
    first = start or settings.delivery_first_day
    last = end or settings.delivery_last_day
    if not (settings.delivery_first_day <= first <= last <= settings.delivery_last_day):
        raise HTTPException(
            422,
            f"start and end must satisfy {settings.delivery_first_day} <= start <= end <= "
            f"{settings.delivery_last_day}",
        )
    cut = time.fromisoformat(cutoff) if cutoff else settings.default_cutoff

    try:
        raw, stale_warning = await store().get()
    except UpstreamError as e:
        logging.getLogger(__name__).error("upstream failure: %s", e)
        raise HTTPException(503, f"Elexon data is unavailable right now: {e}") from e

    result = analyse(raw, first, last, cut, settings)
    if stale_warning:
        result["meta"]["warnings"].insert(0, stale_warning)
    return result
