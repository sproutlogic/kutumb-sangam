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
    admin, admin_plans, approval, auth_router, calendar, content, eco_services, eco_sewa,
    entitlement, gaurav_gatha, green_legacy,
    kutumb_pro, legacy_box, matrimony,
    node_claim, node_relation_labels, notifications, pandit, panchang, payments, person, prakriti, radar, referral, sachets,
    sales, time_bank, tree, tree_subscriptions, tree_v2, union, verification,
)
from workers.care_reminder import create_care_reminder_scheduler
from workers.content_gen import create_content_gen_scheduler
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
_mandatory_prod_origins = {
    "https://prakriti.ecotech.co.in",
    "https://www.prakriti.ecotech.co.in",
}
_cors_origins = sorted({*(_settings.allowed_origins_list or []), *_mandatory_prod_origins})
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router)
app.include_router(approval.router)
app.include_router(auth_router.router)
app.include_router(tree.router)
app.include_router(tree_v2.router)
app.include_router(person.router)
app.include_router(node_claim.router)
app.include_router(node_relation_labels.router)
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

# Eco-Panchang, Green Legacy & Eco-Sewa
app.include_router(panchang.router)
app.include_router(eco_services.router)
app.include_router(eco_sewa.router)
app.include_router(green_legacy.router)
app.include_router(content.router)

# Community achievement wall
app.include_router(gaurav_gatha.router)

# Tree entitlement & monetisation
app.include_router(entitlement.router)
app.include_router(tree_subscriptions.router)
app.include_router(sachets.router)
app.include_router(admin_plans.router)

# Referral / invite codes
app.include_router(referral.router)


@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> dict[str, str]:
    return {"status": "ok"}
