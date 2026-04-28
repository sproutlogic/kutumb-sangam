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
    admin, approval, auth_router, calendar, content, eco_sewa, eco_services, green_legacy,
    kutumb_pro, legacy_box, matrimony,
    notifications, pandit, panchang, payments, person, prakriti, radar, sales, time_bank, tree, union, verification,
)
from workers.care_reminder import create_care_reminder_scheduler
from workers.content_gen import create_content_gen_scheduler
from workers.matcher import create_matcher_scheduler
from workers.panchang_seeder import create_panchang_scheduler
from config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed panchang on startup so the calendar is never empty after a deploy.
    # The seeder skips dates already in DB, so this is fast on subsequent restarts.
    try:
        from workers.panchang_seeder import seed_panchang_window
        seeded = seed_panchang_window(window_days=90)
        logger.info("Startup panchang seed: %d rows upserted", seeded)
    except Exception:
        logger.exception("Startup panchang seed failed — calendar will compute on-demand")

    scheduler = create_matcher_scheduler()
    create_panchang_scheduler(scheduler)
    create_content_gen_scheduler(scheduler)
    create_care_reminder_scheduler(scheduler)
    scheduler.start()
    logger.info(
        "APScheduler started — gotra matcher, panchang seeder, content gen, care reminder registered"
    )
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
app.include_router(approval.router)
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
app.include_router(prakriti.router)

# Eco-Panchang & Green Legacy
app.include_router(panchang.router)
app.include_router(eco_sewa.router)
app.include_router(eco_services.router)
app.include_router(green_legacy.router)
app.include_router(content.router)


@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> dict[str, str]:
    return {"status": "ok"}
