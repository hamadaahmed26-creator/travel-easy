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

# ISO-2 → full English country name. Used so users can type "saudi" or
# "vietnam" and find airports in those countries (CSV only stores ISO-2).
ISO2_TO_NAME: dict[str, str] = {
    "GB": "United Kingdom", "US": "United States", "AE": "United Arab Emirates",
    "SA": "Saudi Arabia", "KR": "South Korea", "KP": "North Korea",
    "RU": "Russia", "TR": "Turkey", "VN": "Vietnam", "CZ": "Czechia",
    "IE": "Ireland", "FR": "France", "DE": "Germany", "NL": "Netherlands",
    "BE": "Belgium", "LU": "Luxembourg", "CH": "Switzerland", "AT": "Austria",
    "IT": "Italy", "ES": "Spain", "PT": "Portugal", "MT": "Malta", "CY": "Cyprus",
    "GR": "Greece", "SE": "Sweden", "NO": "Norway", "DK": "Denmark", "FI": "Finland",
    "IS": "Iceland", "PL": "Poland", "SK": "Slovakia", "HU": "Hungary",
    "RO": "Romania", "BG": "Bulgaria", "HR": "Croatia", "RS": "Serbia",
    "BA": "Bosnia and Herzegovina", "AL": "Albania", "MK": "North Macedonia",
    "ME": "Montenegro", "SI": "Slovenia", "EE": "Estonia", "LV": "Latvia", "LT": "Lithuania",
    "UA": "Ukraine", "BY": "Belarus", "GE": "Georgia", "AM": "Armenia", "AZ": "Azerbaijan",
    "MD": "Moldova", "XK": "Kosovo",
    "QA": "Qatar", "KW": "Kuwait", "BH": "Bahrain", "OM": "Oman", "JO": "Jordan",
    "LB": "Lebanon", "IL": "Israel", "PS": "Palestine", "IR": "Iran", "IQ": "Iraq",
    "SY": "Syria", "YE": "Yemen",
    "EG": "Egypt", "MA": "Morocco", "TN": "Tunisia", "DZ": "Algeria", "LY": "Libya",
    "ZA": "South Africa", "KE": "Kenya", "NG": "Nigeria", "ET": "Ethiopia", "GH": "Ghana",
    "TZ": "Tanzania", "UG": "Uganda", "RW": "Rwanda", "SN": "Senegal", "CI": "Ivory Coast",
    "CM": "Cameroon", "ZW": "Zimbabwe", "ZM": "Zambia", "BW": "Botswana", "NA": "Namibia",
    "MU": "Mauritius", "SC": "Seychelles", "MG": "Madagascar", "MZ": "Mozambique",
    "AO": "Angola", "SD": "Sudan", "DJ": "Djibouti", "ER": "Eritrea",
    "JP": "Japan", "CN": "China", "HK": "Hong Kong", "TW": "Taiwan", "MO": "Macau",
    "MN": "Mongolia", "SG": "Singapore", "MY": "Malaysia", "TH": "Thailand",
    "KH": "Cambodia", "LA": "Laos", "MM": "Myanmar", "ID": "Indonesia",
    "PH": "Philippines", "BN": "Brunei",
    "IN": "India", "PK": "Pakistan", "BD": "Bangladesh", "LK": "Sri Lanka",
    "NP": "Nepal", "MV": "Maldives", "BT": "Bhutan",
    "KZ": "Kazakhstan", "UZ": "Uzbekistan", "KG": "Kyrgyzstan", "TJ": "Tajikistan",
    "TM": "Turkmenistan", "AF": "Afghanistan",
    "AU": "Australia", "NZ": "New Zealand", "FJ": "Fiji", "PF": "French Polynesia",
    "NC": "New Caledonia", "VU": "Vanuatu", "WS": "Samoa", "TO": "Tonga", "PG": "Papua New Guinea",
    "CA": "Canada", "MX": "Mexico", "GT": "Guatemala", "BZ": "Belize", "SV": "El Salvador",
    "HN": "Honduras", "NI": "Nicaragua", "CR": "Costa Rica", "PA": "Panama",
    "CU": "Cuba", "DO": "Dominican Republic", "JM": "Jamaica", "BS": "Bahamas",
    "BB": "Barbados", "TT": "Trinidad and Tobago", "PR": "Puerto Rico", "HT": "Haiti",
    "BR": "Brazil", "AR": "Argentina", "CL": "Chile", "CO": "Colombia", "PE": "Peru",
    "EC": "Ecuador", "VE": "Venezuela", "BO": "Bolivia", "PY": "Paraguay", "UY": "Uruguay",
}

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
    """Returns (by_code, list_sorted). Caches to disk on first run.

    The returned list also contains synthetic 'city group' entries for any
    metropolitan area with 2+ large airports (London, NYC, Tokyo, etc.).
    Their codes are prefixed with 'CITY:' so the optimiser can expand them.
    """
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
    for a in enriched:
        a["country_name"] = ISO2_TO_NAME.get(a.get("country") or "", a.get("country") or "")

    # Build "All [City]" group entries for cities with 2+ relevant airports.
    # Curated metro areas: well-known multi-airport cities where the airports may
    # have varying municipality strings ("London", "London, Essex", "Luton" ->
    # all part of the London metro). Map: canonical_city -> set of IATA codes.
    METRO_AREAS: dict[tuple[str, str], list[str]] = {
        ("London", "GB"): ["LHR", "LGW", "STN", "LTN", "LCY", "SEN"],
        ("New York", "US"): ["JFK", "LGA", "EWR"],
        ("Washington", "US"): ["IAD", "DCA", "BWI"],
        ("Chicago", "US"): ["ORD", "MDW"],
        ("Houston", "US"): ["IAH", "HOU"],
        ("Dallas", "US"): ["DFW", "DAL"],
        ("Tokyo", "JP"): ["HND", "NRT"],
        ("Osaka", "JP"): ["KIX", "ITM"],
        ("Paris", "FR"): ["CDG", "ORY", "BVA"],
        ("Milan", "IT"): ["MXP", "LIN", "BGY"],
        ("Rome", "IT"): ["FCO", "CIA"],
        ("Berlin", "DE"): ["BER"],
        ("Moscow", "RU"): ["SVO", "DME", "VKO"],
        ("Istanbul", "TR"): ["IST", "SAW"],
        ("Stockholm", "SE"): ["ARN", "BMA", "NYO"],
        ("Oslo", "NO"): ["OSL", "TRF"],
        ("Buenos Aires", "AR"): ["EZE", "AEP"],
        ("S\u00e3o Paulo", "BR"): ["GRU", "CGH", "VCP"],
        ("Rio de Janeiro", "BR"): ["GIG", "SDU"],
        ("Mexico City", "MX"): ["MEX", "NLU"],
        ("Bangkok", "TH"): ["BKK", "DMK"],
        ("Seoul", "KR"): ["ICN", "GMP"],
        ("Shanghai", "CN"): ["PVG", "SHA"],
        ("Beijing", "CN"): ["PEK", "PKX"],
        ("Taipei", "TW"): ["TPE", "TSA"],
        ("Jakarta", "ID"): ["CGK", "HLP"],
        ("Kuala Lumpur", "MY"): ["KUL", "SZB"],
        ("Manila", "PH"): ["MNL", "CRK"],
        ("Bali", "ID"): ["DPS"],
    }

    by_code_pre = {a["code"]: a for a in enriched}
    city_groups: list[dict] = []
    for (display_city, country), codes in METRO_AREAS.items():
        members = [by_code_pre[c] for c in codes if c in by_code_pre]
        if len(members) < 2:
            continue
        avg_lat = sum(m["lat"] for m in members) / len(members)
        avg_lng = sum(m["lng"] for m in members) / len(members)
        member_codes = [m["code"] for m in members]
        slug = "".join(ch for ch in display_city.lower() if ch.isalnum())
        country_name = ISO2_TO_NAME.get(country, country)
        city_groups.append({
            "code": f"CITY:{slug}-{country}",
            "name": f"All {display_city} airports",
            "city": display_city,
            "country": country,
            "country_name": country_name,
            "lat": round(avg_lat, 4),
            "lng": round(avg_lng, 4),
            "is_large": True,
            "is_city_group": True,
            "member_codes": member_codes,
            "weather": members[0].get("weather", "city"),
            "base_hotel": members[0].get("base_hotel", 110),
            "volatility": members[0].get("volatility", 0.15),
            "region": members[0].get("region", "OT"),
        })

    # Also auto-detect any other 2+-large-airport cities not in METRO_AREAS.
    seen_keys = {(g["city"].lower(), g["country"]) for g in city_groups}
    auto_groups: dict[tuple[str, str], list[dict]] = {}
    for a in enriched:
        if not a.get("is_large"):
            continue
        # Normalize "London, Essex" -> "London"; strip parentheticals.
        norm = a["city"].lower().split("(")[0].split(",")[0].strip()
        key = (norm, a.get("country") or "")
        if key in seen_keys:
            continue
        auto_groups.setdefault(key, []).append(a)
    for (city_norm, country), members in auto_groups.items():
        if len(members) < 2:
            continue
        display_city = members[0]["city"].split("(")[0].split(",")[0].strip()
        avg_lat = sum(m["lat"] for m in members) / len(members)
        avg_lng = sum(m["lng"] for m in members) / len(members)
        member_codes = [m["code"] for m in members]
        slug = "".join(ch for ch in city_norm if ch.isalnum())
        country_name = ISO2_TO_NAME.get(country, country)
        city_groups.append({
            "code": f"CITY:{slug}-{country}",
            "name": f"All {display_city} airports",
            "city": display_city,
            "country": country,
            "country_name": country_name,
            "lat": round(avg_lat, 4),
            "lng": round(avg_lng, 4),
            "is_large": True,
            "is_city_group": True,
            "member_codes": member_codes,
            "weather": members[0].get("weather", "city"),
            "base_hotel": members[0].get("base_hotel", 110),
            "volatility": members[0].get("volatility", 0.15),
            "region": members[0].get("region", "OT"),
        })

    by_code = {a["code"]: a for a in enriched}
    for g in city_groups:
        by_code[g["code"]] = g
    enriched.sort(key=lambda a: (not a["is_large"], a["city"]))
    # Combined list: city-groups surface first when relevant, then airports
    return by_code, enriched + city_groups


if __name__ == "__main__":
    # Allow `python airport_data.py` for ad-hoc smoke testing.
    async def _main():
        by_code, lst = await load_airports()
        print(f"Total: {len(lst)} airports")
        for code in ("JED", "RUH", "LOS", "HAN", "ALA", "TAS", "TBS", "KBL"):
            a = by_code.get(code)
            print(f"  {code}: {a}")
    asyncio.run(_main())
