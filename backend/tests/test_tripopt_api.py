"""TripOpt backend API tests.

Covers:
- /api/airports and /api/destinations reference data
- /api/optimize behaviour: ranked options, filters, validation
- /api/trips save/list/delete roundtrip (persistence + no _id leak)
"""
import os
import pytest
import requests

# Use the public preview URL (what mobile clients actually hit).
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get(
    "EXPO_BACKEND_URL"
)
if not BASE_URL:
    # Fallback to the value baked into frontend/.env — read at import time.
    from pathlib import Path
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
            break

BASE_URL = BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- reference data ----------------------------------------------------------
class TestReferenceData:
    def test_airports_returns_uk_airports(self, api):
        r = api.get(f"{BASE_URL}/api/airports", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "airports" in data
        codes = {a["code"] for a in data["airports"]}
        for expected in ("LHR", "BRS", "MAN"):
            assert expected in codes, f"missing {expected} in {codes}"
        # Every airport has the expected fields
        for a in data["airports"]:
            assert {"code", "city", "name"} <= set(a.keys())

    def test_destinations_returns_list(self, api):
        r = api.get(f"{BASE_URL}/api/destinations", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "destinations" in data
        assert len(data["destinations"]) >= 10
        sample = data["destinations"][0]
        # Iteration 5: base_flight removed (now derived from haversine).
        assert {"code", "city", "country", "weather", "base_hotel", "volatility",
                "lat", "lng", "region"} <= set(sample.keys())
        weathers = {d["weather"] for d in data["destinations"]}
        assert weathers <= {"sun", "city", "both"}

    # --- Iteration 5: global dataset expansion -------------------------------
    def test_airports_global_dataset_count_and_non_uk(self, api):
        r = api.get(f"{BASE_URL}/api/airports", timeout=30)
        assert r.status_code == 200
        airports = r.json()["airports"]
        assert len(airports) >= 80, f"expected 80+ airports, got {len(airports)}"
        codes = {a["code"] for a in airports}
        # Non-UK departures must exist
        for code in ("JFK", "LAX", "NRT", "HND", "SYD", "GRU", "DXB", "JNB"):
            assert code in codes, f"missing global airport {code}"
        # Every airport has lat/lng/region/country
        for a in airports:
            assert {"code", "city", "country", "name", "lat", "lng", "region"} <= set(a.keys())
            assert isinstance(a["lat"], (int, float))
            assert isinstance(a["lng"], (int, float))
        regions = {a["region"] for a in airports}
        assert {"EU", "NA", "AS", "OC", "AF", "SA", "ME"} <= regions

    def test_destinations_global_dataset(self, api):
        r = api.get(f"{BASE_URL}/api/destinations", timeout=30)
        assert r.status_code == 200
        dests = r.json()["destinations"]
        assert len(dests) >= 70, f"expected 70+ destinations, got {len(dests)}"
        codes = {d["code"] for d in dests}
        for code in ("HND", "BKK", "SYD", "CPT", "DPS", "GIG"):
            assert code in codes, f"missing global destination {code}"


# --- optimizer ---------------------------------------------------------------
BASE_OPTIMIZE = {
    "departure": "BRS",
    "destination": None,
    "budget": 500,
    "trip_length": 4,
    "flexibility_days": 3,
    "weather": "sun",
    "hotel_standard": "any",
    "start_window_days": 30,
}


class TestOptimize:
    def test_optimize_returns_three_ranked_options(self, api):
        r = api.post(f"{BASE_URL}/api/optimize", json=BASE_OPTIMIZE, timeout=45)
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["options"]) == 3
        labels = [o["rank_label"] for o in body["options"]]
        assert labels == ["Cheapest", "Best Value", "Lowest Risk"]
        for o in body["options"]:
            assert o["total_price"] > 0
            assert o["flight"]["price"] > 0
            assert o["hotel"]["total"] > 0
            assert o["recommendation"] in ("book_now", "wait")
            assert 0 <= o["confidence"] <= 100
            assert len(o["price_history"]) == 30
            assert len(o["price_forecast"]) == 14
            assert o["affiliate_flight_url"].startswith("https://www.skyscanner")
            assert o["affiliate_hotel_url"].startswith("https://www.booking.com")

    def test_optimize_fixed_destination_bcn(self, api):
        payload = {**BASE_OPTIMIZE, "destination": "BCN", "weather": "any"}
        r = api.post(f"{BASE_URL}/api/optimize", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        options = r.json()["options"]
        assert len(options) == 3
        for o in options:
            assert o["destination"] == "BCN", o

    def test_optimize_weather_city_filters_correctly(self, api):
        payload = {**BASE_OPTIMIZE, "weather": "city"}
        r = api.post(f"{BASE_URL}/api/optimize", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        options = r.json()["options"]
        # Every returned destination must be either "city" or "both"
        city_codes = {"CDG", "FCO", "VCE", "AMS", "PRG", "BUD"}  # weather=city
        both_codes = {"BCN", "LIS", "ATH", "IST"}  # weather=both qualifies
        allowed = city_codes | both_codes
        for o in options:
            assert o["destination"] in allowed, o["destination"]

    def test_optimize_bad_departure_returns_400(self, api):
        payload = {**BASE_OPTIMIZE, "departure": "ZZZ"}
        r = api.post(f"{BASE_URL}/api/optimize", json=payload, timeout=30)
        assert r.status_code == 400, (r.status_code, r.text)

    def test_optimize_validation_budget_out_of_range(self, api):
        payload = {**BASE_OPTIMIZE, "budget": 10}
        r = api.post(f"{BASE_URL}/api/optimize", json=payload, timeout=30)
        assert r.status_code == 422

    # --- Iteration 3: headline + savings_vs_budget fields ------------------
    def test_optimize_headline_and_savings_anywhere_budget_500(self, api):
        payload = {
            "departure": "BRS",
            "destination": None,
            "budget": 500,
            "trip_length": 4,
            "flexibility_days": 3,
            "weather": "any",
            "hotel_standard": "any",
            "start_window_days": 30,
        }
        r = api.post(f"{BASE_URL}/api/optimize", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["options"]) == 3
        for o in body["options"]:
            assert "headline" in o, f"missing headline: {o.keys()}"
            assert "savings_vs_budget" in o, f"missing savings_vs_budget: {o.keys()}"
            assert isinstance(o["headline"], str) and len(o["headline"]) > 10
            assert isinstance(o["savings_vs_budget"], (int, float))
            # savings = budget - total_price
            expected = round(500 - o["total_price"], 2)
            assert abs(o["savings_vs_budget"] - expected) < 0.01, (
                o["savings_vs_budget"], expected
            )
            # headline content check
            if o["savings_vs_budget"] >= 0:
                assert "£500 budget" in o["headline"]
                assert "save" in o["headline"].lower()
                assert o["destination_city"] in o["headline"]
            else:
                assert "over" in o["headline"].lower()
                assert "£500" in o["headline"]

    def test_optimize_savings_negative_when_over_budget(self, api):
        payload = {
            "departure": "BRS",
            "destination": None,
            "budget": 200,
            "trip_length": 4,
            "flexibility_days": 3,
            "weather": "any",
            "hotel_standard": "any",
            "start_window_days": 30,
        }
        r = api.post(f"{BASE_URL}/api/optimize", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        body = r.json()
        # With £200 budget most/all options should be over-budget
        over_budget = [o for o in body["options"] if o["savings_vs_budget"] < 0]
        assert len(over_budget) >= 1, "Expected at least one over-budget option at £200"
        for o in over_budget:
            assert "over your £200 budget" in o["headline"].lower(), o["headline"]
            # negative savings means total > budget
            assert o["total_price"] > 200


# --- Iteration 5: global departures + haversine pricing ---------------------
class TestGlobalRouting:
    def test_optimize_jfk_anywhere_returns_three_options(self, api):
        payload = {
            "departure": "JFK", "destination": None,
            "budget": 1000, "trip_length": 5, "flexibility_days": 3,
            "weather": "any", "hotel_standard": "any", "start_window_days": 30,
        }
        r = api.post(f"{BASE_URL}/api/optimize", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["options"]) == 3
        for o in body["options"]:
            assert o["departure"] == "JFK"
            assert o["destination"] != "JFK"  # anywhere must exclude same airport
            assert o["total_price"] > 0

    def test_optimize_long_haul_lhr_to_hnd(self, api):
        payload = {
            "departure": "LHR", "destination": "HND",
            "budget": 1500, "trip_length": 7, "flexibility_days": 3,
            "weather": "any", "hotel_standard": "any", "start_window_days": 30,
        }
        r = api.post(f"{BASE_URL}/api/optimize", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        opts = r.json()["options"]
        # Long-haul LHR→HND should produce realistic flight price >= £900
        for o in opts:
            assert o["destination"] == "HND"
            assert o["flight"]["price"] >= 900, (
                f"long-haul flight too cheap: {o['flight']['price']}"
            )

    def test_optimize_short_haul_lhr_to_cdg(self, api):
        payload = {
            "departure": "LHR", "destination": "CDG",
            "budget": 500, "trip_length": 3, "flexibility_days": 3,
            "weather": "any", "hotel_standard": "any", "start_window_days": 30,
        }
        r = api.post(f"{BASE_URL}/api/optimize", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        opts = r.json()["options"]
        for o in opts:
            assert o["destination"] == "CDG"
            assert o["flight"]["price"] <= 250, (
                f"short-haul too expensive: {o['flight']['price']}"
            )

    def test_optimize_syd_anywhere_excludes_sydney(self, api):
        payload = {
            "departure": "SYD", "destination": None,
            "budget": 2000, "trip_length": 7, "flexibility_days": 3,
            "weather": "sun", "hotel_standard": "any", "start_window_days": 30,
        }
        r = api.post(f"{BASE_URL}/api/optimize", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        opts = r.json()["options"]
        assert len(opts) == 3
        for o in opts:
            assert o["departure"] == "SYD"
            assert o["destination"] != "SYD"
            assert o["destination_city"] != "Sydney"

    def test_optimize_same_airport_rejected_or_excluded(self, api):
        # destination=departure should either be rejected or yield no same-city result
        payload = {
            "departure": "LHR", "destination": "LHR",
            "budget": 500, "trip_length": 3, "flexibility_days": 3,
            "weather": "any", "hotel_standard": "any", "start_window_days": 30,
        }
        r = api.post(f"{BASE_URL}/api/optimize", json=payload, timeout=30)
        if r.status_code == 200:
            # If accepted, the destination's city must NOT equal the departure city
            for o in r.json()["options"]:
                assert o["destination"] != "LHR"
                assert o["destination_city"] != o["departure_city"]
        else:
            assert r.status_code in (400, 404, 422), (r.status_code, r.text)


# --- saved trips — now auth-gated; covered in test_pro_mode.py --------------
# (The un-authenticated save/list/delete flow from iteration 3 was moved to
# /api/trips gated endpoints; see tests in test_pro_mode.py::TestTripScoping
# and TestWatchLimit which exercise save → list → delete with bearer tokens.)
