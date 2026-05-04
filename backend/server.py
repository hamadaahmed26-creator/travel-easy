"""TripOpt backend — Pro Mode edition.

Adds: Emergent Google Auth, Stripe Pro paywall, push notifications, watched-trip
price scheduler, and in-app alerts inbox. Original optimisation engine intact.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import random
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Literal, Optional
from urllib.parse import quote_plus

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from emergentintegrations.payments.stripe.checkout import (
    CheckoutSessionRequest,
    StripeCheckout,
)
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from airport_data import (
    POPULAR_DEPARTURES,
    POPULAR_DESTINATIONS,
    load_airports,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="TripOpt API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("tripopt")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
EMERGENT_AUTH_SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
PRO_PRICE_GBP = 2.99  # £2.99 = 30 days of Pro
PRO_DAYS = 30
FREE_WATCH_LIMIT = 1

# Populated at startup from airport_data.load_airports().
# UK_AIRPORTS / DESTINATIONS keep their old names so the rest of the file is
# unchanged structurally, but they now contain the global ~4400-airport set.
UK_AIRPORTS: list[dict] = []
DESTINATIONS: list[dict] = []
_AIRPORTS_BY_CODE: dict[str, dict] = {}

AIRLINES = [
    {"code": "BA", "name": "British Airways", "tier": "full"},
    {"code": "FR", "name": "Ryanair", "tier": "budget"},
    {"code": "U2", "name": "easyJet", "tier": "budget"},
    {"code": "VS", "name": "Virgin Atlantic", "tier": "full"},
    {"code": "TO", "name": "TUI Airways", "tier": "charter"},
    {"code": "W6", "name": "Wizz Air", "tier": "budget"},
    {"code": "KL", "name": "KLM", "tier": "full"},
]

HOTEL_BRANDS = [
    ("budget", "Ibis Budget", 3.6), ("budget", "Premier Inn", 4.1),
    ("budget", "B&B Hotels", 3.8), ("budget", "Travelodge", 3.7),
    ("mid", "NH Hotels", 4.3), ("mid", "Mercure", 4.2),
    ("mid", "Holiday Inn", 4.0), ("mid", "Novotel", 4.4),
    ("mid", "Hilton Garden Inn", 4.5), ("mid", "Marriott Courtyard", 4.4),
]


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class OptimizeRequest(BaseModel):
    departure: str
    destination: Optional[str] = None
    budget: int = Field(..., ge=100, le=5000)
    trip_length: int = Field(..., ge=2, le=21)
    flexibility_days: int = Field(0, ge=0, le=14)
    weather: Literal["sun", "city", "any"] = "any"
    hotel_standard: Literal["budget", "mid", "any"] = "any"
    start_window_days: int = Field(30, ge=1, le=180)


class FlightOption(BaseModel):
    airline: str; airline_code: str; flight_number: str
    depart_time: str; return_time: str; price: float; stops: int


class HotelOption(BaseModel):
    name: str; rating: float; distance_km: float
    nightly_rate: float; total: float; standard: str


class TripOption(BaseModel):
    id: str; rank_label: str
    departure: str; departure_city: str
    destination: str; destination_city: str; destination_country: str
    weather: str
    check_in: str; check_out: str; nights: int
    flight: FlightOption; hotel: HotelOption
    total_price: float; currency: str = "GBP"
    rating_score: float; risk_score: float
    recommendation: Literal["book_now", "wait"]
    confidence: int; rationale: str
    headline: str; savings_vs_budget: float
    affiliate_flight_url: str; affiliate_hotel_url: str
    price_history: List[float]; price_forecast: List[float]


class OptimizeResponse(BaseModel):
    request_id: str; generated_at: str
    options: List[TripOption]
    searched_combinations: int; median_total: float


class User(BaseModel):
    user_id: str; email: str; name: str
    picture: Optional[str] = None
    pro_until: Optional[str] = None  # ISO datetime; None = free
    is_pro: bool = False
    created_at: str


class SaveTripRequest(BaseModel):
    trip: TripOption


class SavedTrip(BaseModel):
    id: str; user_id: str; saved_at: str
    trip: TripOption
    is_watching: bool = False
    last_seen_total: Optional[float] = None
    last_seen_recommendation: Optional[str] = None


class CheckoutRequest(BaseModel):
    origin_url: str  # frontend window.location.origin


class PushRegisterRequest(BaseModel):
    expo_token: str
    platform: str = "unknown"


class Notification(BaseModel):
    id: str; user_id: str
    title: str; body: str
    saved_trip_id: Optional[str] = None
    data: dict = {}
    created_at: str
    read: bool = False


# ---------------------------------------------------------------------------
# Pricing engine (unchanged from MVP)
# ---------------------------------------------------------------------------
def _seed(*parts: str) -> int:
    h = hashlib.md5("|".join(parts).encode()).hexdigest()
    return int(h[:8], 16)


def _rng(*parts: str) -> random.Random:
    return random.Random(_seed(*parts))


def _airport(code: str): return _AIRPORTS_BY_CODE.get(code)
def _destination(code: str): return next((d for d in DESTINATIONS if d["code"] == code), None)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in km."""
    from math import asin, cos, radians, sin, sqrt
    r = 6371.0
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1); dl = radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * r * asin(sqrt(a))


def _route_base_flight(dep: str, dest: str) -> float:
    """One-way base flight cost (£) derived from great-circle distance.

    Same airport → 0. Domestic short-hop ≥ £30. Long-haul scales sub-linearly.
    """
    a = _airport(dep)
    b = _airport(dest)
    if not a or not b:
        return 80.0
    km = _haversine_km(a["lat"], a["lng"], b["lat"], b["lng"])
    if km < 50:
        return 0.0
    # Sub-linear: short hops feel proportional, long hauls don't blow up.
    # Calibration: 1000km ≈ £75, 5000km ≈ £230, 9000km ≈ £375, 16000km ≈ £580.
    base = 28 + (km ** 0.78) * 0.45
    # Crossing oceans / regions adds a structural surcharge.
    if a["region"] != b["region"]:
        base *= 1.18
    return round(base, 2)


def _seasonal_multiplier(day: datetime) -> float:
    month = day.month
    base = 0.85 + 0.25 * abs((month - 1) % 12 - 6) / 6
    if month in (7, 8): base += 0.25
    if month == 12 and day.day >= 18: base += 0.30
    if day.weekday() in (4, 6): base += 0.08
    return base


def _flight_price(dep, dest, day, base, vol):
    rng = _rng("flt", dep, dest, day.isoformat())
    return round(base * 2 * _seasonal_multiplier(day) * rng.uniform(1 - vol, 1 + vol), 2)


def _hotel_price(dest, day, base, vol):
    rng = _rng("htl", dest, day.isoformat())
    return round(base * _seasonal_multiplier(day) * rng.uniform(1 - vol * 0.6, 1 + vol * 0.6), 2)


def _build_flight_option(dep, dest, check_in, check_out, base, vol):
    rng = _rng("fopt", dep, dest, check_in.isoformat())
    airline = rng.choice(AIRLINES)
    price = _flight_price(dep, dest, check_in, base, vol)
    if airline["tier"] == "budget": price *= 0.85
    elif airline["tier"] == "full": price *= 1.10
    flight_no = f"{airline['code']}{rng.randint(100, 9999)}"
    dep_h, dep_m = rng.randint(6, 21), rng.choice([0, 15, 30, 45])
    ret_h, ret_m = rng.randint(6, 21), rng.choice([0, 15, 30, 45])
    stops = 0 if rng.random() < 0.7 else 1
    if stops: price *= 0.82
    return FlightOption(
        airline=airline["name"], airline_code=airline["code"], flight_number=flight_no,
        depart_time=f"{check_in.strftime('%a %d %b')} · {dep_h:02d}:{dep_m:02d}",
        return_time=f"{check_out.strftime('%a %d %b')} · {ret_h:02d}:{ret_m:02d}",
        price=round(price, 2), stops=stops,
    )


def _build_hotel_option(dest, check_in, nights, base, vol, standard_filter):
    rng = _rng("hopt", dest, check_in.isoformat(), standard_filter)
    candidates = [b for b in HOTEL_BRANDS if standard_filter in ("any", b[0])] or HOTEL_BRANDS
    standard, brand, base_rating = rng.choice(candidates)
    nightly = _hotel_price(dest, check_in, base, vol)
    if standard == "mid": nightly *= 1.45
    rating = round(min(5.0, base_rating + rng.uniform(-0.2, 0.3)), 1)
    distance = round(rng.uniform(0.3, 4.5), 1)
    suffix = rng.choice(["Central", "Plaza", "Old Town", "Riverside", "Airport", "Downtown"])
    return HotelOption(
        name=f"{brand} {suffix}", rating=rating, distance_km=distance,
        nightly_rate=round(nightly, 2), total=round(nightly * nights, 2), standard=standard,
    )


def _affiliate_flight(dep, dest, check_in, check_out):
    return f"https://www.skyscanner.net/transport/flights/{dep.lower()}/{dest.lower()}/{check_in.strftime('%y%m%d')}/{check_out.strftime('%y%m%d')}/"


def _affiliate_hotel(city, check_in, check_out):
    return f"https://www.booking.com/searchresults.html?ss={quote_plus(city)}&checkin={check_in.strftime('%Y-%m-%d')}&checkout={check_out.strftime('%Y-%m-%d')}"


def _price_history_and_forecast(base_total, vol, dest_code):
    rng = _rng("series", dest_code, str(round(base_total, 2)))
    history = []
    val = base_total * rng.uniform(0.92, 1.08)
    for _ in range(30):
        val *= rng.uniform(1 - vol * 0.05, 1 + vol * 0.05)
        history.append(round(val, 2))
    trend = (base_total - statistics.mean(history)) / max(1.0, statistics.mean(history))
    forecast = []
    forecast_val = base_total
    for i in range(14):
        forecast_val *= rng.uniform(1 - vol * 0.04, 1 + vol * 0.06 + max(0, trend) * 0.01)
        forecast.append(round(forecast_val, 2))
    return history, forecast, trend


def _evaluate_destination(req: OptimizeRequest, dest: dict):
    today = datetime.now(timezone.utc).date()
    start = today + timedelta(days=req.start_window_days)
    flex = max(req.flexibility_days, 3)
    out = []
    base_flight = _route_base_flight(req.departure, dest["code"])
    for offset in range(-flex, flex + 1):
        ci_d = start + timedelta(days=offset)
        co_d = ci_d + timedelta(days=req.trip_length)
        ci = datetime.combine(ci_d, datetime.min.time())
        co = datetime.combine(co_d, datetime.min.time())
        flight = _build_flight_option(req.departure, dest["code"], ci, co, base_flight, dest["volatility"])
        hotel = _build_hotel_option(dest["code"], ci, req.trip_length, dest["base_hotel"], dest["volatility"], req.hotel_standard)
        total = round(flight.price + hotel.total, 2)
        out.append({"check_in": ci, "check_out": co, "flight": flight, "hotel": hotel, "total": total})
    return out


def _optimise(req: OptimizeRequest) -> OptimizeResponse:
    dep_meta = _airport(req.departure)
    if not dep_meta:
        raise HTTPException(status_code=400, detail=f"Unknown departure airport {req.departure}")
    if req.destination:
        if req.destination == req.departure:
            raise HTTPException(status_code=400, detail="Destination must differ from departure")
        dests = [d for d in DESTINATIONS if d["code"] == req.destination]
        if not dests:
            raise HTTPException(status_code=400, detail=f"Unknown destination {req.destination}")
    else:
        # "Anywhere" — exclude same airport / same city as the departure.
        dep_meta_full = _airport(req.departure)
        def _norm_city(s: str) -> str:
            return (s or "").split("(")[0].strip().lower()
        dep_city_norm = _norm_city(dep_meta_full.get("city", "")) if dep_meta_full else ""
        dests = [
            d for d in DESTINATIONS
            if d["code"] != req.departure and _norm_city(d["city"]) != dep_city_norm
        ]
    if req.weather != "any":
        dests = [d for d in dests if d["weather"] == req.weather or d["weather"] == "both"]
    all_candidates = []
    for d in dests:
        for c in _evaluate_destination(req, d):
            c["dest"] = d
            all_candidates.append(c)
    if not all_candidates:
        raise HTTPException(status_code=404, detail="No trip combinations found for these filters")
    totals = [c["total"] for c in all_candidates]
    median_total = round(statistics.median(totals), 2)
    mean_total = statistics.mean(totals)
    in_budget = [c for c in all_candidates if c["total"] <= req.budget]
    pool = in_budget if in_budget else all_candidates
    for c in pool:
        c["value_score"] = round((c["hotel"].rating * 100) / (c["total"] / 100) - c["hotel"].distance_km * 2 - c["flight"].stops * 5, 2)
        history, forecast, trend = _price_history_and_forecast(c["total"], c["dest"]["volatility"], c["dest"]["code"])
        c["history"], c["forecast"], c["trend"] = history, forecast, trend
        c["risk_score"] = round(min(100, max(0, c["dest"]["volatility"] * 200 + max(0, trend) * 100)), 1)
    cheapest = min(pool, key=lambda c: c["total"])
    best_value = max(pool, key=lambda c: c["value_score"])
    lowest_risk = min(pool, key=lambda c: c["risk_score"])
    chosen, seen = [], set()
    for label, cand in (("Cheapest", cheapest), ("Best Value", best_value), ("Lowest Risk", lowest_risk)):
        key = (cand["dest"]["code"], cand["check_in"].isoformat())
        if key in seen:
            for alt in sorted(pool, key=lambda c: c["total"]):
                ak = (alt["dest"]["code"], alt["check_in"].isoformat())
                if ak not in seen:
                    cand, key = alt, ak; break
        seen.add(key); chosen.append((label, cand))
    options: List[TripOption] = []
    for label, c in chosen:
        history, forecast = c["history"], c["forecast"]
        avg30 = statistics.mean(history)
        forecast_change = (forecast[-1] - c["total"]) / c["total"]
        if c["total"] < avg30 * 0.95 or forecast_change > 0.05:
            recommendation = "book_now"
            confidence = int(min(96, 60 + abs((avg30 - c["total"]) / avg30) * 200 + max(0, forecast_change) * 200))
            rationale = f"Current total is below the 30-day average and forecast suggests +{round(forecast_change*100)}% in 14 days."
        elif c["total"] > avg30 * 1.05 and forecast_change < -0.02:
            recommendation = "wait"
            confidence = int(min(92, 55 + (c["total"] - avg30) / avg30 * 200 + abs(forecast_change) * 150))
            rationale = f"Prices look elevated vs the 30-day average. Forecast suggests {round(forecast_change*100)}% in 14 days."
        else:
            recommendation = "book_now" if c["total"] <= mean_total else "wait"
            confidence = 65
            rationale = "Prices are stable. " + ("Solid value vs the search median." if recommendation == "book_now" else "Slightly above search median; you may find better.")
        savings = round(req.budget - c["total"], 2)
        if savings >= 0:
            headline = f"£{req.budget} budget → {c['dest']['city']} for £{int(round(c['total']))}. You save £{int(round(savings))}."
        else:
            headline = f"£{int(round(c['total']))} to {c['dest']['city']} · £{int(round(-savings))} over your £{req.budget} budget."
        options.append(TripOption(
            id=str(uuid.uuid4()), rank_label=label,
            departure=req.departure, departure_city=dep_meta["city"],
            destination=c["dest"]["code"], destination_city=c["dest"]["city"], destination_country=c["dest"]["country"],
            weather=c["dest"]["weather"],
            check_in=c["check_in"].strftime("%Y-%m-%d"), check_out=c["check_out"].strftime("%Y-%m-%d"),
            nights=req.trip_length, flight=c["flight"], hotel=c["hotel"],
            total_price=c["total"], rating_score=round(c["value_score"], 1), risk_score=c["risk_score"],
            recommendation=recommendation, confidence=confidence, rationale=rationale,
            headline=headline, savings_vs_budget=savings,
            affiliate_flight_url=_affiliate_flight(req.departure, c["dest"]["code"], c["check_in"], c["check_out"]),
            affiliate_hotel_url=_affiliate_hotel(c["dest"]["city"], c["check_in"], c["check_out"]),
            price_history=history, price_forecast=forecast,
        ))
    return OptimizeResponse(
        request_id=str(uuid.uuid4()), generated_at=datetime.now(timezone.utc).isoformat(),
        options=options, searched_combinations=len(all_candidates), median_total=median_total,
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _user_to_model(user_doc: dict) -> User:
    pro_until = user_doc.get("pro_until")
    is_pro = False
    pu_str = None
    if pro_until:
        if isinstance(pro_until, str):
            dt = datetime.fromisoformat(pro_until)
        else:
            dt = pro_until
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        is_pro = dt > datetime.now(timezone.utc)
        pu_str = dt.isoformat()
    created = user_doc.get("created_at")
    if isinstance(created, datetime):
        created = created.isoformat()
    return User(
        user_id=user_doc["user_id"], email=user_doc["email"],
        name=user_doc.get("name", user_doc["email"].split("@")[0]),
        picture=user_doc.get("picture"),
        pro_until=pu_str, is_pro=is_pro,
        created_at=created or datetime.now(timezone.utc).isoformat(),
    )


# ---------------------------------------------------------------------------
# Routes — Public
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "TripOpt", "status": "ok"}


@api.get("/airports")
async def airports():
    """Curated 'popular' departure list shown when picker first opens."""
    items = [_AIRPORTS_BY_CODE[c] for c in POPULAR_DEPARTURES if c in _AIRPORTS_BY_CODE]
    return {"airports": items}


@api.get("/destinations")
async def destinations():
    """Curated 'popular' destination list shown when picker first opens."""
    items = [_AIRPORTS_BY_CODE[c] for c in POPULAR_DESTINATIONS if c in _AIRPORTS_BY_CODE]
    return {"destinations": items}


@api.get("/airports/search")
async def search_airports(q: str = Query("", min_length=0, max_length=50),
                          limit: int = Query(40, ge=1, le=100)):
    """Live fuzzy search across IATA, city, country, name (~4400 airports)."""
    query = q.strip().lower()
    if not query:
        items = [_AIRPORTS_BY_CODE[c] for c in POPULAR_DEPARTURES if c in _AIRPORTS_BY_CODE]
        return {"results": items[:limit]}
    scored: list[tuple[int, dict]] = []
    for a in UK_AIRPORTS:
        code = a["code"].lower()
        city = a["city"].lower()
        name = a["name"].lower()
        country = (a.get("country") or "").lower()
        country_name = (a.get("country_name") or "").lower()
        score = 0
        if code == query:
            score = 100
        elif code.startswith(query):
            score = 90
        elif city == query:
            score = 95
        elif city.startswith(query):
            score = 85
        elif country_name == query:
            score = 80
        elif country_name.startswith(query):
            score = 75
        elif query in city:
            score = 70
        elif query in country_name:
            score = 65
        elif country.startswith(query):
            score = 60
        elif query in name:
            score = 50
        elif query in country:
            score = 45
        if score:
            if a.get("is_large"):
                score += 5
            scored.append((score, a))
    scored.sort(key=lambda t: -t[0])
    return {"results": [a for _, a in scored[:limit]]}


@api.post("/optimize", response_model=OptimizeResponse)
async def optimize(req: OptimizeRequest):
    logger.info("Optimise request: %s", req.model_dump())
    result = _optimise(req)
    await db.optimisations.insert_one({
        "request_id": result.request_id, "request": req.model_dump(),
        "generated_at": result.generated_at, "median_total": result.median_total,
        "searched_combinations": result.searched_combinations,
    })
    return result


# ---------------------------------------------------------------------------
# Routes — Auth
# ---------------------------------------------------------------------------
class SessionExchangeRequest(BaseModel):
    session_id: str


@api.post("/auth/session")
async def auth_session(req: SessionExchangeRequest):
    """Exchange Emergent session_id for a persistent session_token."""
    async with httpx.AsyncClient(timeout=15.0) as http:
        try:
            resp = await http.get(EMERGENT_AUTH_SESSION_DATA_URL, headers={"X-Session-ID": req.session_id})
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Auth provider unreachable: {e}")
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail=f"Auth exchange failed: {resp.text}")
    data = resp.json()
    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    now = datetime.now(timezone.utc)
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name", existing.get("name")),
                      "picture": data.get("picture", existing.get("picture")),
                      "last_login": now}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email,
            "name": data.get("name", email.split("@")[0]),
            "picture": data.get("picture"),
            "pro_until": None,
            "created_at": now, "last_login": now,
        })
    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": now + timedelta(days=7), "created_at": now,
    })
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": _user_to_model(user_doc).model_dump()}


@api.get("/auth/me", response_model=User)
async def auth_me(user: dict = Depends(get_current_user)):
    return _user_to_model(user)


@api.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Routes — Saved trips (per-user) + Watch
# ---------------------------------------------------------------------------
@api.post("/trips/save", response_model=SavedTrip)
async def save_trip(req: SaveTripRequest, user: dict = Depends(get_current_user)):
    saved = SavedTrip(
        id=str(uuid.uuid4()), user_id=user["user_id"],
        saved_at=datetime.now(timezone.utc).isoformat(),
        trip=req.trip, is_watching=False,
        last_seen_total=req.trip.total_price,
        last_seen_recommendation=req.trip.recommendation,
    )
    await db.saved_trips.insert_one(saved.model_dump())
    return saved


@api.get("/trips", response_model=List[SavedTrip])
async def list_trips(user: dict = Depends(get_current_user)):
    docs = await db.saved_trips.find({"user_id": user["user_id"]}, {"_id": 0}).sort("saved_at", -1).to_list(200)
    return [SavedTrip(**d) for d in docs]


@api.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str, user: dict = Depends(get_current_user)):
    res = await db.saved_trips.delete_one({"id": trip_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Saved trip not found")
    return {"deleted": trip_id}


class WatchToggleRequest(BaseModel):
    is_watching: bool


@api.post("/trips/{trip_id}/watch")
async def toggle_watch(trip_id: str, body: WatchToggleRequest, user: dict = Depends(get_current_user)):
    trip = await db.saved_trips.find_one({"id": trip_id, "user_id": user["user_id"]}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Saved trip not found")
    if body.is_watching:
        user_model = _user_to_model(user)
        if not user_model.is_pro:
            current_watching = await db.saved_trips.count_documents({
                "user_id": user["user_id"], "is_watching": True, "id": {"$ne": trip_id}
            })
            if current_watching >= FREE_WATCH_LIMIT:
                raise HTTPException(
                    status_code=402,
                    detail=f"Free tier allows {FREE_WATCH_LIMIT} watched trip. Upgrade to Pro for unlimited.",
                )
    await db.saved_trips.update_one(
        {"id": trip_id, "user_id": user["user_id"]},
        {"$set": {"is_watching": body.is_watching}},
    )
    return {"id": trip_id, "is_watching": body.is_watching}


# ---------------------------------------------------------------------------
# Routes — Stripe Pro paywall
# ---------------------------------------------------------------------------
def _build_origin_urls(origin_url: str) -> tuple[str, str]:
    base = origin_url.rstrip("/")
    success = f"{base}/upgrade?session_id={{CHECKOUT_SESSION_ID}}"
    cancel = f"{base}/upgrade"
    return success, cancel


@api.post("/payments/checkout")
async def create_checkout(req: CheckoutRequest, request: Request, user: dict = Depends(get_current_user)):
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
    success_url, cancel_url = _build_origin_urls(req.origin_url)
    metadata = {
        "user_id": user["user_id"], "email": user["email"],
        "product": "tripopt_pro_30d", "amount_gbp": str(PRO_PRICE_GBP),
    }
    checkout_req = CheckoutSessionRequest(
        amount=float(PRO_PRICE_GBP), currency="gbp",
        success_url=success_url, cancel_url=cancel_url, metadata=metadata,
    )
    session = await stripe.create_checkout_session(checkout_req)
    await db.payment_transactions.insert_one({
        "session_id": session.session_id, "user_id": user["user_id"],
        "email": user["email"], "amount_gbp": PRO_PRICE_GBP, "currency": "gbp",
        "metadata": metadata, "payment_status": "pending",
        "status": "open", "credited": False,
        "created_at": datetime.now(timezone.utc),
    })
    return {"url": session.url, "session_id": session.session_id}


@api.get("/payments/status/{session_id}")
async def payment_status(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    txn = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not txn:
        raise HTTPException(status_code=404, detail="Payment session not found")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
    status_resp = await stripe.get_checkout_status(session_id)
    new_status, new_payment = status_resp.status, status_resp.payment_status
    update = {"$set": {"status": new_status, "payment_status": new_payment,
                       "updated_at": datetime.now(timezone.utc)}}
    pro_until_iso = None
    if new_payment == "paid" and not txn.get("credited"):
        new_pro_until = datetime.now(timezone.utc) + timedelta(days=PRO_DAYS)
        existing_until = None
        cur_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
        if cur_user and cur_user.get("pro_until"):
            existing_until = cur_user["pro_until"]
            if isinstance(existing_until, str):
                existing_until = datetime.fromisoformat(existing_until)
            if existing_until.tzinfo is None:
                existing_until = existing_until.replace(tzinfo=timezone.utc)
            if existing_until > datetime.now(timezone.utc):
                new_pro_until = existing_until + timedelta(days=PRO_DAYS)
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"pro_until": new_pro_until}},
        )
        update["$set"]["credited"] = True
        update["$set"]["pro_until"] = new_pro_until
        pro_until_iso = new_pro_until.isoformat()
    await db.payment_transactions.update_one({"session_id": session_id}, update)
    return {
        "session_id": session_id, "status": new_status, "payment_status": new_payment,
        "amount_total": status_resp.amount_total, "currency": status_resp.currency,
        "credited": new_payment == "paid", "pro_until": pro_until_iso,
    }


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        return {"ok": False, "reason": "stripe not configured"}
    host_url = str(request.base_url).rstrip("/")
    stripe = StripeCheckout(api_key=api_key, webhook_url=f"{host_url}/api/webhook/stripe")
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        event = await stripe.handle_webhook(body, sig)
    except Exception as e:
        logger.warning("Webhook decode failed: %s", e)
        return {"ok": False}
    if event.payment_status == "paid":
        meta = event.metadata or {}
        user_id = meta.get("user_id")
        if user_id:
            txn = await db.payment_transactions.find_one(
                {"session_id": event.session_id, "user_id": user_id}, {"_id": 0}
            )
            if txn and not txn.get("credited"):
                new_pro_until = datetime.now(timezone.utc) + timedelta(days=PRO_DAYS)
                cur_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
                if cur_user and cur_user.get("pro_until"):
                    eu = cur_user["pro_until"]
                    if isinstance(eu, str):
                        eu = datetime.fromisoformat(eu)
                    if eu.tzinfo is None:
                        eu = eu.replace(tzinfo=timezone.utc)
                    if eu > datetime.now(timezone.utc):
                        new_pro_until = eu + timedelta(days=PRO_DAYS)
                await db.users.update_one(
                    {"user_id": user_id}, {"$set": {"pro_until": new_pro_until}}
                )
                await db.payment_transactions.update_one(
                    {"session_id": event.session_id},
                    {"$set": {"credited": True, "payment_status": "paid",
                              "pro_until": new_pro_until}},
                )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Routes — Push tokens
# ---------------------------------------------------------------------------
@api.post("/push/register")
async def register_push(req: PushRegisterRequest, user: dict = Depends(get_current_user)):
    await db.push_tokens.update_one(
        {"user_id": user["user_id"], "expo_token": req.expo_token},
        {"$set": {"user_id": user["user_id"], "expo_token": req.expo_token,
                  "platform": req.platform, "active": True,
                  "updated_at": datetime.now(timezone.utc)},
         "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"ok": True}


async def _send_expo_push(tokens: list[str], title: str, body: str, data: dict | None = None):
    if not tokens:
        return
    payload = {"to": tokens, "sound": "default", "title": title, "body": body}
    if data:
        payload["data"] = data
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.post(EXPO_PUSH_URL, json=payload,
                                   headers={"Content-Type": "application/json"})
            logger.info("Expo push response: %s", resp.status_code)
    except Exception as e:
        logger.warning("Expo push failed: %s", e)


# ---------------------------------------------------------------------------
# Routes — In-app alerts
# ---------------------------------------------------------------------------
@api.get("/notifications", response_model=List[Notification])
async def list_notifications(user: dict = Depends(get_current_user)):
    docs = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [Notification(**d) for d in docs]


@api.post("/notifications/{nid}/read")
async def mark_read(nid: str, user: dict = Depends(get_current_user)):
    res = await db.notifications.update_one(
        {"id": nid, "user_id": user["user_id"]}, {"$set": {"read": True}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Background watcher
# ---------------------------------------------------------------------------
async def _record_alert(user_id: str, title: str, body: str, saved_trip_id: str, data: dict):
    n = Notification(
        id=str(uuid.uuid4()), user_id=user_id,
        title=title, body=body, saved_trip_id=saved_trip_id, data=data,
        created_at=datetime.now(timezone.utc).isoformat(), read=False,
    )
    await db.notifications.insert_one(n.model_dump())
    push_docs = await db.push_tokens.find({"user_id": user_id, "active": True}, {"_id": 0}).to_list(20)
    tokens = [d["expo_token"] for d in push_docs]
    if tokens:
        await _send_expo_push(tokens, title, body, data={"type": "price_alert", **data})


async def check_watched_trips():
    """Re-runs optimise on every watched trip and emits alerts on material changes."""
    cursor = db.saved_trips.find({"is_watching": True}, {"_id": 0})
    async for st in cursor:
        try:
            t = st["trip"]
            req = OptimizeRequest(
                departure=t["departure"], destination=t["destination"],
                budget=int(round(t["total_price"] * 1.5)),
                trip_length=t["nights"], flexibility_days=3,
                weather="any", hotel_standard=t["hotel"]["standard"] if t["hotel"]["standard"] in ("budget", "mid") else "any",
                start_window_days=30,
            )
            res = _optimise(req)
            best = min(res.options, key=lambda o: o.total_price)
            last_total = st.get("last_seen_total") or t["total_price"]
            change_pct = (best.total_price - last_total) / last_total
            new_reco = best.recommendation
            old_reco = st.get("last_seen_recommendation") or t["recommendation"]
            await db.saved_trips.update_one(
                {"id": st["id"]},
                {"$set": {"last_seen_total": best.total_price,
                          "last_seen_recommendation": new_reco,
                          "last_checked_at": datetime.now(timezone.utc)}},
            )
            triggered = False
            if change_pct <= -0.05:
                title = f"Price drop on your {t['destination_city']} trip"
                body = f"£{int(round(last_total))} → £{int(round(best.total_price))} ({int(round(change_pct*100))}%). {best.recommendation.replace('_', ' ').title()}."
                triggered = True
            elif change_pct >= 0.07:
                title = f"Prices rising for {t['destination_city']}"
                body = f"£{int(round(last_total))} → £{int(round(best.total_price))} (+{int(round(change_pct*100))}%). {best.recommendation.replace('_', ' ').title()}."
                triggered = True
            elif new_reco != old_reco:
                title = f"Recommendation changed: {t['destination_city']}"
                body = f"Now {new_reco.replace('_', ' ')} at £{int(round(best.total_price))} ({best.confidence}% confidence)."
                triggered = True
            if triggered:
                await _record_alert(st["user_id"], title, body, st["id"],
                                    {"saved_trip_id": st["id"], "total": best.total_price})
        except Exception as e:
            logger.warning("Watcher failed for trip %s: %s", st.get("id"), e)


@api.post("/_admin/run-watcher")
async def run_watcher_now():
    """Manual trigger for the price watcher (used by tests/cron)."""
    await check_watched_trips()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Wire up
# ---------------------------------------------------------------------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware, allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)

scheduler = AsyncIOScheduler()


@app.on_event("startup")
async def _startup():
    global _AIRPORTS_BY_CODE, UK_AIRPORTS, DESTINATIONS
    by_code, lst = await load_airports()
    _AIRPORTS_BY_CODE = by_code
    UK_AIRPORTS[:] = lst
    # Build the destination pool used by "Anywhere" searches: large airports
    # only (~700 globally), one per IATA. Each has weather/base_hotel/volatility
    # already enriched by airport_data.load_airports().
    seen_codes = set()
    DESTINATIONS[:] = []
    for a in lst:
        if not a.get("is_large"):
            continue
        if a["code"] in seen_codes:
            continue
        seen_codes.add(a["code"])
        DESTINATIONS.append(a)
    logger.info("Airports loaded: %d total, %d destinations", len(UK_AIRPORTS), len(DESTINATIONS))

    scheduler.add_job(check_watched_trips, "interval", hours=6, id="watcher",
                      next_run_time=datetime.now(timezone.utc) + timedelta(minutes=5))
    scheduler.start()
    logger.info("Scheduler started (price watcher every 6h)")


@app.on_event("shutdown")
async def _shutdown():
    if scheduler.running:
        scheduler.shutdown(wait=False)
    client.close()
