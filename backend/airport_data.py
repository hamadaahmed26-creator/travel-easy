"""Worldwide airports loader — sources OurAirports (CC0) and computes
TripOpt-specific destination metadata (weather, hotel rate, volatility) per
airport. Result is cached on disk so backend restarts are instant.
"""
from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger("tripopt.airports")

OURAIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
DATA_DIR = Path(__file__).parent / "data"
CACHE_FILE = DATA_DIR / "airports_cache.json"
CACHE_VERSION = 2

# £/night baseline for a 3-star room, by ISO-2 country code.
HOTEL_RATES: dict[str, int] = {
    "US": 165, "CA": 150, "GB": 145, "IE": 130,
    "FR": 130, "DE": 120, "NL": 145, "BE": 125, "LU": 145,
    "CH": 175, "AT": 115, "IT": 115, "ES": 105, "PT": 90, "MT": 110, "CY": 105,
    "GR": 90, "SE": 140, "NO": 165, "DK": 145, "FI": 130, "IS": 155,
    "PL": 80, "CZ": 80, "SK": 75, "HU": 70, "RO": 70, "BG": 75,
    "HR": 100, "RS": 75, "BA": 70, "AL": 70, "MK": 65, "ME": 80, "SI": 95,
    "EE": 90, "LV": 80, "LT": 80, "TR": 70, "RU": 90, "UA": 70, "BY": 65, "GE": 75, "AM": 70, "AZ": 75,
    # Middle East
    "AE": 145, "QA": 155, "SA": 130, "KW": 130, "BH": 125, "OM": 110, "JO": 95, "LB": 100,
    "IL": 165, "PS": 90, "IR": 70, "IQ": 90, "SY": 70, "YE": 80,
    # Africa
    "EG": 75, "MA": 90, "TN": 70, "DZ": 75, "LY": 80,
    "ZA": 110, "KE": 130, "NG": 110, "ET": 105, "GH": 95, "TZ": 130, "UG": 100,
    "RW": 110, "SN": 100, "CI": 90, "CM": 90, "ZW": 80, "ZM": 90, "BW": 110, "NA": 100,
    "MU": 175, "SC": 195, "MG": 90, "MZ": 90,
    # Asia
    "JP": 175, "KR": 145, "CN": 110, "HK": 175, "TW": 115, "MO": 145, "MN": 80,
    "SG": 195, "MY": 95, "TH": 80, "VN": 65, "KH": 75, "LA": 65, "MM": 70,
    "ID": 90, "PH": 100, "BN": 130,
    "IN": 80, "PK": 70, "BD": 80, "LK": 80, "NP": 70, "MV": 230, "BT": 110,
    "KZ": 90, "UZ": 75, "KG": 65, "TJ": 60, "TM": 80, "AF": 70,
    # Oceania
    "AU": 175, "NZ": 155, "FJ": 145, "PF": 195, "NC": 165, "VU": 145, "WS": 125, "TO": 110, "PG": 130,
    # Americas
    "MX": 90, "GT": 75, "BZ": 110, "SV": 80, "HN": 75, "NI": 70, "CR": 110, "PA": 95,
    "CU": 95, "DO": 130, "JM": 145, "BS": 195, "BB": 175, "TT": 130, "PR": 165,
    "BR": 95, "AR": 80, "CL": 105, "CO": 70, "PE": 70, "EC": 70, "VE": 70, "BO": 60, "PY": 60, "UY": 95,
}

COUNTRY_NAMES: dict[str, str] = {
    "US": "United States", "GB": "United Kingdom", "AE": "United Arab Emirates",
    "SA": "Saudi Arabia", "KR": "South Korea", "RU": "Russia",
    "TR": "Turkey", "VN": "Vietnam", "CZ": "Czechia",
    # Most others can fall back to ISO; we'll fill from the CSV name field.
}


def _classify_weather(lat: float, country: Optional[str]) -> str:
    """sun | city — latitude-based heuristic with regional refinements."""
    if -28 <= lat <= 28:
        return "sun"
    if 28 < lat <= 40 and country in {
        "ES", "PT", "IT", "GR", "TR", "MA", "TN", "EG", "CY", "MT", "IL", "JO",
        "US", "MX", "PR", "BS", "DO", "JM", "BB", "TT",
    }:
        return "sun"
    if -40 <= lat < -28 and country in {"ZA", "AU", "AR", "CL", "UY", "NZ"}:
        return "sun"
    return "city"


def _volatility(weather: str, country: Optional[str]) -> float:
    base = 0.15
    if weather == "sun":
        base += 0.05
    if country in {"GR", "HR", "IS", "FJ", "MV", "PF", "BB", "BS", "JM"}:
        base += 0.05
    return round(base, 2)


def _hotel_rate(country: Optional[str]) -> int:
    return HOTEL_RATES.get(country or "", 110)


def _enrich(row: dict) -> dict:
    weather = _classify_weather(row["lat"], row.get("country"))
    return {
        **row,
        "weather": weather,
        "base_hotel": _hotel_rate(row.get("country")),
        "volatility": _volatility(weather, row.get("country")),
    }


async def _fetch_csv() -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0) as http:
        resp = await http.get(OURAIRPORTS_URL)
    resp.raise_for_status()
    reader = csv.DictReader(io.StringIO(resp.text))
    out: list[dict] = []
    for row in reader:
        iata = (row.get("iata_code") or "").strip().upper()
        atype = (row.get("type") or "").strip()
        if not iata or len(iata) != 3:
            continue
        if atype not in {"large_airport", "medium_airport"}:
            continue
        try:
            lat = float(row["latitude_deg"]); lng = float(row["longitude_deg"])
        except (ValueError, KeyError):
            continue
        city = (row.get("municipality") or "").strip()
        if not city:
            continue
        country = ((row.get("iso_country") or "").strip().upper()) or None
        out.append({
            "code": iata,
            "name": (row.get("name") or "").strip(),
            "city": city,
            "country": country,
            "lat": round(lat, 4),
            "lng": round(lng, 4),
            "type": atype,
            "is_large": atype == "large_airport",
            "region": _region_of(country),
        })
    return out


def _region_of(country: Optional[str]) -> str:
    if not country:
        return "OT"
    if country in {"GB", "IE", "FR", "DE", "NL", "BE", "LU", "CH", "AT", "IT", "ES", "PT", "MT", "CY",
                   "GR", "SE", "NO", "DK", "FI", "IS", "PL", "CZ", "SK", "HU", "RO", "BG", "HR", "RS",
                   "BA", "AL", "MK", "ME", "SI", "EE", "LV", "LT", "TR", "RU", "UA", "BY", "GE", "AM", "AZ", "MD", "XK"}:
        return "EU"
    if country in {"US", "CA", "MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA", "CU", "DO", "JM", "BS", "BB", "TT", "PR", "HT"}:
        return "NA"
    if country in {"BR", "AR", "CL", "CO", "PE", "EC", "VE", "BO", "PY", "UY", "GY", "SR", "GF"}:
        return "SA"
    if country in {"AE", "QA", "SA", "KW", "BH", "OM", "JO", "LB", "IL", "PS", "IR", "IQ", "SY", "YE"}:
        return "ME"
    if country in {"EG", "MA", "TN", "DZ", "LY", "ZA", "KE", "NG", "ET", "GH", "TZ", "UG", "RW", "SN",
                   "CI", "CM", "ZW", "ZM", "BW", "NA", "MU", "SC", "MG", "MZ", "AO", "SD", "DJ", "ER",
                   "BF", "ML", "GN", "GM", "BI", "CD", "CG", "GA", "TD", "NE", "SO", "SS", "LR", "SL", "TG", "BJ", "MR", "EH"}:
        return "AF"
    if country in {"JP", "KR", "CN", "HK", "TW", "MO", "MN", "SG", "MY", "TH", "VN", "KH", "LA", "MM",
                   "ID", "PH", "BN", "IN", "PK", "BD", "LK", "NP", "MV", "BT", "KZ", "UZ", "KG", "TJ", "TM", "AF"}:
        return "AS"
    if country in {"AU", "NZ", "FJ", "PF", "NC", "VU", "WS", "TO", "PG", "SB", "KI", "NR", "FM", "PW", "MH", "TV"}:
        return "OC"
    return "OT"


# Curated "Popular" set surfaced at the top of pickers / used for "Anywhere"
# searches. These IATA codes are vetted hubs that produce sensible cheapest
# trips and cover all continents fairly.
POPULAR_DESTINATIONS: list[str] = [
    # Europe
    "BCN", "AGP", "PMI", "FAO", "LIS", "MAD", "CDG", "ORY", "AMS", "FRA", "MUC", "BER",
    "FCO", "MXP", "VCE", "ATH", "JTR", "PRG", "BUD", "VIE", "ZRH", "CPH", "ARN", "OSL",
    "HEL", "KEF", "WAW", "DBV", "IST", "TFS", "DUB",
    # Middle East
    "DXB", "AUH", "DOH", "TLV", "AMM", "BEY", "JED", "RUH", "MCT", "KWI", "BAH", "CAI",
    # North America
    "JFK", "LGA", "EWR", "LAX", "SFO", "ORD", "MIA", "BOS", "SEA", "ATL", "DFW", "LAS",
    "YYZ", "YVR", "YUL", "MEX", "CUN", "HAV", "SJU",
    # South America
    "GRU", "GIG", "EZE", "LIM", "BOG", "SCL", "UIO",
    # Africa
    "RAK", "CMN", "TUN", "ALG", "JNB", "CPT", "NBO", "ADD", "LOS", "ZNZ",
    # Asia
    "SIN", "BKK", "HKT", "DPS", "KUL", "MNL", "HAN", "SGN", "HND", "NRT", "ICN", "PEK",
    "PVG", "HKG", "TPE", "DEL", "BOM", "BLR", "MAA", "CMB", "KTM", "MLE", "ALA", "TAS",
    # Oceania
    "SYD", "MEL", "BNE", "PER", "AKL", "WLG", "NAN", "PPT",
]

POPULAR_DEPARTURES: list[str] = [
    # UK + Ireland (kept first — original audience)
    "LHR", "LGW", "STN", "LTN", "BRS", "MAN", "BHX", "EDI", "GLA", "LPL", "DUB",
    # Continental EU hubs
    "CDG", "AMS", "FRA", "MUC", "BER", "MAD", "BCN", "FCO", "MXP", "ATH", "VIE", "ZRH", "CPH", "ARN",
    "WAW", "PRG", "IST",
    # Americas
    "JFK", "LGA", "EWR", "BOS", "ORD", "DFW", "LAX", "SFO", "SEA", "ATL", "MIA", "LAS",
    "YYZ", "YVR", "YUL", "MEX", "GRU", "EZE", "BOG", "LIM",
    # Middle East
    "DXB", "AUH", "DOH", "JED", "RUH", "TLV", "CAI", "AMM", "KWI", "BAH",
    # Africa
    "JNB", "CPT", "NBO", "LOS", "ADD", "CMN",
    # Asia
    "SIN", "BKK", "HND", "NRT", "ICN", "PEK", "PVG", "HKG", "TPE",
    "DEL", "BOM", "BLR", "KUL", "CGK", "MNL", "HAN", "SGN",
    # Oceania
    "SYD", "MEL", "BNE", "PER", "AKL",
]


async def load_airports() -> tuple[dict[str, dict], list[dict]]:
    """Returns (by_code, list_sorted). Caches to disk on first run."""
    DATA_DIR.mkdir(exist_ok=True)
    raw: list[dict] = []
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE) as f:
                payload = json.load(f)
            if payload.get("version") == CACHE_VERSION and payload.get("airports"):
                raw = payload["airports"]
                logger.info("Loaded %d airports from cache", len(raw))
        except Exception as e:
            logger.warning("Cache parse failed: %s", e)
    if not raw:
        try:
            raw = await _fetch_csv()
            with open(CACHE_FILE, "w") as f:
                json.dump({"version": CACHE_VERSION, "airports": raw}, f)
            logger.info("Fetched %d airports from OurAirports", len(raw))
        except Exception as e:
            logger.error("OurAirports fetch failed: %s; using empty list", e)
            raw = []
    enriched = [_enrich(a) for a in raw]
    by_code = {a["code"]: a for a in enriched}
    enriched.sort(key=lambda a: (not a["is_large"], a["city"]))
    return by_code, enriched


if __name__ == "__main__":
    # Allow `python airport_data.py` for ad-hoc smoke testing.
    async def _main():
        by_code, lst = await load_airports()
        print(f"Total: {len(lst)} airports")
        for code in ("JED", "RUH", "LOS", "HAN", "ALA", "TAS", "TBS", "KBL"):
            a = by_code.get(code)
            print(f"  {code}: {a}")
    asyncio.run(_main())
