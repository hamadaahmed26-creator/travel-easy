"""TripOpt backend — Total Trip Optimiser.

Generates deterministic mock flight + hotel data for UK departures and runs a
portfolio-style optimiser across a date range. Returns ranked trip options
(Cheapest, Best Value, Lowest Risk) with Book-now/Wait recommendations.
"""
from __future__ import annotations

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

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

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
# Static reference data
# ---------------------------------------------------------------------------
UK_AIRPORTS = [
    {"code": "LHR", "city": "London", "name": "Heathrow"},
    {"code": "LGW", "city": "London", "name": "Gatwick"},
    {"code": "STN", "city": "London", "name": "Stansted"},
    {"code": "LTN", "city": "London", "name": "Luton"},
    {"code": "BRS", "city": "Bristol", "name": "Bristol"},
    {"code": "MAN", "city": "Manchester", "name": "Manchester"},
    {"code": "BHX", "city": "Birmingham", "name": "Birmingham"},
    {"code": "EDI", "city": "Edinburgh", "name": "Edinburgh"},
    {"code": "GLA", "city": "Glasgow", "name": "Glasgow"},
    {"code": "LPL", "city": "Liverpool", "name": "Liverpool"},
]

DESTINATIONS = [
    # weather: sun | city | both
    {"code": "BCN", "city": "Barcelona", "country": "Spain", "weather": "both", "base_flight": 95, "base_hotel": 85, "volatility": 0.18},
    {"code": "AGP", "city": "Malaga", "country": "Spain", "weather": "sun", "base_flight": 80, "base_hotel": 70, "volatility": 0.22},
    {"code": "PMI", "city": "Palma de Mallorca", "country": "Spain", "weather": "sun", "base_flight": 90, "base_hotel": 78, "volatility": 0.25},
    {"code": "FAO", "city": "Faro", "country": "Portugal", "weather": "sun", "base_flight": 110, "base_hotel": 75, "volatility": 0.20},
    {"code": "LIS", "city": "Lisbon", "country": "Portugal", "weather": "both", "base_flight": 120, "base_hotel": 90, "volatility": 0.15},
    {"code": "CDG", "city": "Paris", "country": "France", "weather": "city", "base_flight": 75, "base_hotel": 130, "volatility": 0.12},
    {"code": "FCO", "city": "Rome", "country": "Italy", "weather": "city", "base_flight": 105, "base_hotel": 110, "volatility": 0.16},
    {"code": "VCE", "city": "Venice", "country": "Italy", "weather": "city", "base_flight": 130, "base_hotel": 140, "volatility": 0.20},
    {"code": "ATH", "city": "Athens", "country": "Greece", "weather": "both", "base_flight": 140, "base_hotel": 80, "volatility": 0.17},
    {"code": "JTR", "city": "Santorini", "country": "Greece", "weather": "sun", "base_flight": 180, "base_hotel": 160, "volatility": 0.30},
    {"code": "AMS", "city": "Amsterdam", "country": "Netherlands", "weather": "city", "base_flight": 70, "base_hotel": 145, "volatility": 0.10},
    {"code": "PRG", "city": "Prague", "country": "Czechia", "weather": "city", "base_flight": 95, "base_hotel": 75, "volatility": 0.13},
    {"code": "BUD", "city": "Budapest", "country": "Hungary", "weather": "city", "base_flight": 100, "base_hotel": 65, "volatility": 0.14},
    {"code": "IST", "city": "Istanbul", "country": "Turkey", "weather": "both", "base_flight": 160, "base_hotel": 70, "volatility": 0.22},
    {"code": "DBV", "city": "Dubrovnik", "country": "Croatia", "weather": "sun", "base_flight": 145, "base_hotel": 100, "volatility": 0.24},
    {"code": "TFS", "city": "Tenerife", "country": "Spain", "weather": "sun", "base_flight": 130, "base_hotel": 85, "volatility": 0.19},
]

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
    ("budget", "Ibis Budget", 3.6),
    ("budget", "Premier Inn", 4.1),
    ("budget", "B&B Hotels", 3.8),
    ("budget", "Travelodge", 3.7),
    ("mid", "NH Hotels", 4.3),
    ("mid", "Mercure", 4.2),
    ("mid", "Holiday Inn", 4.0),
    ("mid", "Novotel", 4.4),
    ("mid", "Hilton Garden Inn", 4.5),
    ("mid", "Marriott Courtyard", 4.4),
]


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class OptimizeRequest(BaseModel):
    departure: str = Field(..., description="UK airport IATA code")
    destination: Optional[str] = Field(None, description="Destination IATA code or None for Anywhere")
    budget: int = Field(..., ge=100, le=5000)
    trip_length: int = Field(..., ge=2, le=21, description="Nights")
    flexibility_days: int = Field(0, ge=0, le=14, description="± days flexibility around start window")
    weather: Literal["sun", "city", "any"] = "any"
    hotel_standard: Literal["budget", "mid", "any"] = "any"
    start_window_days: int = Field(30, ge=1, le=180, description="Start of search window from today")


class FlightOption(BaseModel):
    airline: str
    airline_code: str
    flight_number: str
    depart_time: str
    return_time: str
    price: float
    stops: int


class HotelOption(BaseModel):
    name: str
    rating: float
    distance_km: float
    nightly_rate: float
    total: float
    standard: str


class TripOption(BaseModel):
    id: str
    rank_label: str  # "Cheapest" | "Best Value" | "Lowest Risk"
    departure: str
    departure_city: str
    destination: str
    destination_city: str
    destination_country: str
    weather: str
    check_in: str
    check_out: str
    nights: int
    flight: FlightOption
    hotel: HotelOption
    total_price: float
    currency: str = "GBP"
    rating_score: float
    risk_score: float  # 0-100, lower = lower risk (less likely to spike)
    recommendation: Literal["book_now", "wait"]
    confidence: int  # 0-100
    rationale: str
    affiliate_flight_url: str
    affiliate_hotel_url: str
    price_history: List[float]  # last 30 days simulated
    price_forecast: List[float]  # next 14 days simulated


class OptimizeResponse(BaseModel):
    request_id: str
    generated_at: str
    options: List[TripOption]
    searched_combinations: int
    median_total: float


class SaveTripRequest(BaseModel):
    trip: TripOption


class SavedTrip(BaseModel):
    id: str
    saved_at: str
    trip: TripOption


# ---------------------------------------------------------------------------
# Pricing engine (deterministic seeded mock)
# ---------------------------------------------------------------------------
def _seed(*parts: str) -> int:
    h = hashlib.md5("|".join(parts).encode()).hexdigest()
    return int(h[:8], 16)


def _rng(*parts: str) -> random.Random:
    return random.Random(_seed(*parts))


def _airport(code: str) -> Optional[dict]:
    return next((a for a in UK_AIRPORTS if a["code"] == code), None)


def _destination(code: str) -> Optional[dict]:
    return next((d for d in DESTINATIONS if d["code"] == code), None)


def _seasonal_multiplier(day: datetime) -> float:
    # School holidays / summer peaks: simple sinusoid + summer/Christmas spikes
    month = day.month
    base = 0.85 + 0.25 * abs((month - 1) % 12 - 6) / 6  # winter cheaper
    if month in (7, 8):
        base += 0.25
    if month == 12 and day.day >= 18:
        base += 0.30
    if day.weekday() in (4, 6):  # Fri/Sun travel premium
        base += 0.08
    return base


def _flight_price(dep: str, dest: str, day: datetime, base: float, volatility: float) -> float:
    rng = _rng("flt", dep, dest, day.isoformat())
    seasonal = _seasonal_multiplier(day)
    noise = rng.uniform(1 - volatility, 1 + volatility)
    # Outbound + return combined
    return round(base * 2 * seasonal * noise, 2)


def _hotel_price(dest: str, day: datetime, base: float, volatility: float) -> float:
    rng = _rng("htl", dest, day.isoformat())
    seasonal = _seasonal_multiplier(day)
    noise = rng.uniform(1 - volatility * 0.6, 1 + volatility * 0.6)
    return round(base * seasonal * noise, 2)


def _build_flight_option(dep: str, dest: str, check_in: datetime, check_out: datetime, base: float, volatility: float) -> FlightOption:
    rng = _rng("fopt", dep, dest, check_in.isoformat())
    airline = rng.choice(AIRLINES)
    price = _flight_price(dep, dest, check_in, base, volatility)
    if airline["tier"] == "budget":
        price *= 0.85
    elif airline["tier"] == "full":
        price *= 1.10
    flight_no = f"{airline['code']}{rng.randint(100, 9999)}"
    dep_h = rng.randint(6, 21)
    dep_m = rng.choice([0, 15, 30, 45])
    ret_h = rng.randint(6, 21)
    ret_m = rng.choice([0, 15, 30, 45])
    stops = 0 if rng.random() < 0.7 else 1
    if stops == 1:
        price *= 0.82
    return FlightOption(
        airline=airline["name"],
        airline_code=airline["code"],
        flight_number=flight_no,
        depart_time=f"{check_in.strftime('%a %d %b')} · {dep_h:02d}:{dep_m:02d}",
        return_time=f"{check_out.strftime('%a %d %b')} · {ret_h:02d}:{ret_m:02d}",
        price=round(price, 2),
        stops=stops,
    )


def _build_hotel_option(dest: str, check_in: datetime, nights: int, base: float, volatility: float, standard_filter: str) -> HotelOption:
    rng = _rng("hopt", dest, check_in.isoformat(), standard_filter)
    candidates = [b for b in HOTEL_BRANDS if standard_filter in ("any", b[0])]
    if not candidates:
        candidates = HOTEL_BRANDS
    standard, brand, base_rating = rng.choice(candidates)
    nightly = _hotel_price(dest, check_in, base, volatility)
    if standard == "mid":
        nightly *= 1.45
    rating = round(min(5.0, base_rating + rng.uniform(-0.2, 0.3)), 1)
    distance = round(rng.uniform(0.3, 4.5), 1)
    suffix = rng.choice(["Central", "Plaza", "Old Town", "Riverside", "Airport", "Downtown"])
    return HotelOption(
        name=f"{brand} {suffix}",
        rating=rating,
        distance_km=distance,
        nightly_rate=round(nightly, 2),
        total=round(nightly * nights, 2),
        standard=standard,
    )


def _affiliate_flight(dep: str, dest: str, check_in: datetime, check_out: datetime) -> str:
    return (
        "https://www.skyscanner.net/transport/flights/"
        f"{dep.lower()}/{dest.lower()}/"
        f"{check_in.strftime('%y%m%d')}/{check_out.strftime('%y%m%d')}/"
    )


def _affiliate_hotel(city: str, check_in: datetime, check_out: datetime) -> str:
    return (
        "https://www.booking.com/searchresults.html?"
        f"ss={quote_plus(city)}"
        f"&checkin={check_in.strftime('%Y-%m-%d')}"
        f"&checkout={check_out.strftime('%Y-%m-%d')}"
    )


def _price_history_and_forecast(base_total: float, volatility: float, dest_code: str) -> tuple[List[float], List[float], float]:
    """Simulate trailing 30-day history + 14-day forecast. Returns (history, forecast, trend)."""
    rng = _rng("series", dest_code, str(round(base_total, 2)))
    history = []
    val = base_total * rng.uniform(0.92, 1.08)
    for _ in range(30):
        val *= rng.uniform(1 - volatility * 0.05, 1 + volatility * 0.05)
        history.append(round(val, 2))
    forecast = []
    forecast_val = base_total
    # Trend: positive = rising prices => "Book now"
    trend = (base_total - statistics.mean(history)) / max(1.0, statistics.mean(history))
    for i in range(14):
        forecast_val *= rng.uniform(1 - volatility * 0.04, 1 + volatility * 0.06 + max(0, trend) * 0.01)
        forecast.append(round(forecast_val, 2))
    return history, forecast, trend


def _evaluate_destination(req: OptimizeRequest, dest: dict) -> List[dict]:
    """Generate one best (date, flight, hotel) candidate for this destination."""
    today = datetime.now(timezone.utc).date()
    start = today + timedelta(days=req.start_window_days)
    flex = max(req.flexibility_days, 3)  # always sample at least ±3 even if user picked 0
    candidates = []
    for offset in range(-flex, flex + 1):
        check_in_d = start + timedelta(days=offset)
        check_out_d = check_in_d + timedelta(days=req.trip_length)
        check_in = datetime.combine(check_in_d, datetime.min.time())
        check_out = datetime.combine(check_out_d, datetime.min.time())
        flight = _build_flight_option(req.departure, dest["code"], check_in, check_out, dest["base_flight"], dest["volatility"])
        hotel = _build_hotel_option(dest["code"], check_in, req.trip_length, dest["base_hotel"], dest["volatility"], req.hotel_standard)
        total = round(flight.price + hotel.total, 2)
        candidates.append({
            "check_in": check_in,
            "check_out": check_out,
            "flight": flight,
            "hotel": hotel,
            "total": total,
        })
    return candidates


def _optimise(req: OptimizeRequest) -> OptimizeResponse:
    dep_meta = _airport(req.departure)
    if not dep_meta:
        raise HTTPException(status_code=400, detail=f"Unknown departure airport {req.departure}")

    if req.destination:
        dests = [d for d in DESTINATIONS if d["code"] == req.destination]
        if not dests:
            raise HTTPException(status_code=400, detail=f"Unknown destination {req.destination}")
    else:
        dests = list(DESTINATIONS)
    if req.weather != "any":
        # "both" weather destinations qualify for either filter
        dests = [d for d in dests if d["weather"] == req.weather or d["weather"] == "both"]

    all_candidates: List[dict] = []
    for d in dests:
        for c in _evaluate_destination(req, d):
            c["dest"] = d
            all_candidates.append(c)

    if not all_candidates:
        raise HTTPException(status_code=404, detail="No trip combinations found for these filters")

    totals = [c["total"] for c in all_candidates]
    median_total = round(statistics.median(totals), 2)
    mean_total = statistics.mean(totals)

    # Apply budget filter as a soft preference (keep within budget if any qualify, else ignore)
    in_budget = [c for c in all_candidates if c["total"] <= req.budget]
    pool = in_budget if in_budget else all_candidates

    # ---- Scoring ----
    for c in pool:
        # Best value: high hotel rating per £, penalise distance
        flt = c["flight"]
        htl = c["hotel"]
        c["value_score"] = round((htl.rating * 100) / (c["total"] / 100) - htl.distance_km * 2 - flt.stops * 5, 2)
        history, forecast, trend = _price_history_and_forecast(c["total"], c["dest"]["volatility"], c["dest"]["code"])
        c["history"] = history
        c["forecast"] = forecast
        c["trend"] = trend
        # Risk: high volatility + rising trend = high risk
        c["risk_score"] = round(min(100, max(0, (c["dest"]["volatility"] * 200) + max(0, trend) * 100)), 1)

    cheapest = min(pool, key=lambda c: c["total"])
    best_value = max(pool, key=lambda c: c["value_score"])
    lowest_risk = min(pool, key=lambda c: c["risk_score"])

    # Ensure 3 distinct picks
    chosen = []
    seen = set()
    for label, cand in (("Cheapest", cheapest), ("Best Value", best_value), ("Lowest Risk", lowest_risk)):
        key = (cand["dest"]["code"], cand["check_in"].isoformat())
        if key in seen:
            # find next-best that isn't chosen yet
            for alt in sorted(pool, key=lambda c: c["total"]):
                alt_key = (alt["dest"]["code"], alt["check_in"].isoformat())
                if alt_key not in seen:
                    cand = alt
                    key = alt_key
                    break
        seen.add(key)
        chosen.append((label, cand))

    options: List[TripOption] = []
    for label, c in chosen:
        history = c["history"]
        forecast = c["forecast"]
        avg30 = statistics.mean(history)
        # Recommendation logic: if current total < 95% of 30d avg => book_now (cheap)
        # if forecast trends upward beyond +5% => book_now
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

        opt = TripOption(
            id=str(uuid.uuid4()),
            rank_label=label,
            departure=req.departure,
            departure_city=dep_meta["city"],
            destination=c["dest"]["code"],
            destination_city=c["dest"]["city"],
            destination_country=c["dest"]["country"],
            weather=c["dest"]["weather"],
            check_in=c["check_in"].strftime("%Y-%m-%d"),
            check_out=c["check_out"].strftime("%Y-%m-%d"),
            nights=req.trip_length,
            flight=c["flight"],
            hotel=c["hotel"],
            total_price=c["total"],
            rating_score=round(c["value_score"], 1),
            risk_score=c["risk_score"],
            recommendation=recommendation,
            confidence=confidence,
            rationale=rationale,
            affiliate_flight_url=_affiliate_flight(req.departure, c["dest"]["code"], c["check_in"], c["check_out"]),
            affiliate_hotel_url=_affiliate_hotel(c["dest"]["city"], c["check_in"], c["check_out"]),
            price_history=history,
            price_forecast=forecast,
        )
        options.append(opt)

    return OptimizeResponse(
        request_id=str(uuid.uuid4()),
        generated_at=datetime.now(timezone.utc).isoformat(),
        options=options,
        searched_combinations=len(all_candidates),
        median_total=median_total,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "TripOpt", "status": "ok"}


@api.get("/airports")
async def airports():
    return {"airports": UK_AIRPORTS}


@api.get("/destinations")
async def destinations():
    return {"destinations": DESTINATIONS}


@api.post("/optimize", response_model=OptimizeResponse)
async def optimize(req: OptimizeRequest):
    logger.info("Optimise request: %s", req.model_dump())
    result = _optimise(req)
    # Persist the request for analytics (no PII)
    await db.optimisations.insert_one({
        "request_id": result.request_id,
        "request": req.model_dump(),
        "generated_at": result.generated_at,
        "median_total": result.median_total,
        "searched_combinations": result.searched_combinations,
    })
    return result


@api.post("/trips/save", response_model=SavedTrip)
async def save_trip(req: SaveTripRequest):
    saved = SavedTrip(
        id=str(uuid.uuid4()),
        saved_at=datetime.now(timezone.utc).isoformat(),
        trip=req.trip,
    )
    await db.saved_trips.insert_one(saved.model_dump())
    return saved


@api.get("/trips", response_model=List[SavedTrip])
async def list_trips():
    docs = await db.saved_trips.find({}, {"_id": 0}).sort("saved_at", -1).to_list(200)
    return [SavedTrip(**d) for d in docs]


@api.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str):
    res = await db.saved_trips.delete_one({"id": trip_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Saved trip not found")
    return {"deleted": trip_id}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
