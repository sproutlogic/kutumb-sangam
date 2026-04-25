"""
FastAPI entrypoint: tree APIs + scheduled matcher worker.
Run from the `backend` directory: uvicorn main:app --reload
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import (
    admin, auth_router, calendar, kutumb_pro, legacy_box, matrimony,
    notifications, pandit, payments, person, radar, sales, time_bank, tree, union, verification,
)
from workers.matcher import create_matcher_scheduler
from config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = create_matcher_scheduler()
    scheduler.start()
    logger.info("APScheduler started (daily gotra collision job registered)")
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")


app = FastAPI(
    title="Kutumb Sangam API",
    description="Vanshavali tree and matchmaking backend",
    lifespan=lifespan,
)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router)
app.include_router(auth_router.router)
app.include_router(tree.router)
app.include_router(person.router)
app.include_router(matrimony.router)
app.include_router(union.router)
app.include_router(verification.router)
app.include_router(pandit.router)
app.include_router(notifications.router)
app.include_router(sales.router)
app.include_router(payments.router)
app.include_router(kutumb_pro.router)
app.include_router(calendar.router)
app.include_router(legacy_box.router)
app.include_router(radar.router)
app.include_router(time_bank.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
