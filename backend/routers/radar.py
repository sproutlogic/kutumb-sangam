"""
Kutumb Radar APIs.

PUT /api/radar/location   — upsert my location + consent flag
GET /api/radar/nearby     — get consenting members within radius_km
                            (same vansha + in-laws via unions table)
"""

from __future__ import annotations

import logging
import math
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from constants import MEMBER_LOCATIONS_TABLE, UNIONS_TABLE, USERS_TABLE
from db import get_supabase
from middleware.auth import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/radar", tags=["radar"])


class LocationBody(BaseModel):
    vansha_id: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_m: int | None = None
    sharing_consent: bool = True


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.put("/location")
def update_location(body: LocationBody, user: CurrentUser) -> dict[str, Any]:
    sb = get_supabase()
    row = {
        "user_id": str(user["id"]),
        "vansha_id": body.vansha_id,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "accuracy_m": body.accuracy_m,
        "sharing_consent": body.sharing_consent,
        "updated_at": "now()",
    }
    sb.table(MEMBER_LOCATIONS_TABLE).upsert(row).execute()
    return {"ok": True, "sharing": body.sharing_consent}


@router.get("/nearby")
def get_nearby(
    vansha_id: str = Query(...),
    radius_km: float = Query(default=10.0, ge=0.5, le=100),
    user: CurrentUser = None,
) -> dict[str, Any]:
    """Return kutumb members + in-laws within radius_km of the requesting user."""
    user_id = str(user["id"])
    sb = get_supabase()

    # Get MY location
    my_loc = (
        sb.table(MEMBER_LOCATIONS_TABLE)
        .select("latitude,longitude,sharing_consent")
        .eq("user_id", user_id)
        .eq("vansha_id", vansha_id)
        .limit(1)
        .execute()
    )
    if not my_loc.data or not my_loc.data[0].get("sharing_consent"):
        raise HTTPException(
            status_code=403,
            detail="Enable location sharing to use Kutumb Radar.",
        )
    my_lat = my_loc.data[0]["latitude"]
    my_lon = my_loc.data[0]["longitude"]

    # Collect all vansha_ids to search: my vansha + in-law vanshas
    related_vanshas: set[str] = {vansha_id}
    try:
        unions = (
            sb.table(UNIONS_TABLE)
            .select("vansha_id")
            .or_(f"spouse1_vansha_id.eq.{vansha_id},spouse2_vansha_id.eq.{vansha_id}")
            .execute()
        )
        for u in (unions.data or []):
            if u.get("vansha_id"):
                related_vanshas.add(u["vansha_id"])
    except Exception:
        pass  # unions table may not have spouse vansha columns; skip

    # Fetch all consenting locations across related vanshas
    all_locs = (
        sb.table(MEMBER_LOCATIONS_TABLE)
        .select("user_id,vansha_id,latitude,longitude,updated_at")
        .in_("vansha_id", list(related_vanshas))
        .eq("sharing_consent", True)
        .execute()
    )

    # Fetch names for those user_ids
    loc_rows = [r for r in (all_locs.data or []) if r["user_id"] != user_id]
    if not loc_rows:
        return {"my_location": {"lat": my_lat, "lon": my_lon}, "members": []}

    loc_user_ids = list({r["user_id"] for r in loc_rows})
    users_res = (
        sb.table(USERS_TABLE)
        .select("id,full_name")
        .in_("id", loc_user_ids)
        .execute()
    )
    name_map = {u["id"]: u.get("full_name") or "Kutumb Member" for u in (users_res.data or [])}

    members = []
    for loc in loc_rows:
        dist = _haversine_km(my_lat, my_lon, loc["latitude"], loc["longitude"])
        if dist <= radius_km:
            relation = "kutumb" if loc["vansha_id"] == vansha_id else "in-law"
            members.append({
                "user_id": loc["user_id"],
                "name": name_map.get(loc["user_id"], "Kutumb Member"),
                "distance_km": round(dist, 2),
                "relation": relation,
                "updated_at": loc["updated_at"],
            })

    members.sort(key=lambda x: x["distance_km"])
    return {"my_location": {"lat": my_lat, "lon": my_lon}, "members": members}
