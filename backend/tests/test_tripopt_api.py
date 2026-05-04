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
        assert {"code", "city", "country", "weather", "base_flight", "base_hotel", "volatility"} <= set(
            sample.keys()
        )
        weathers = {d["weather"] for d in data["destinations"]}
        assert weathers <= {"sun", "city", "both"}


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


# --- saved trips (persistence) ----------------------------------------------
class TestSavedTrips:
    def test_save_list_delete_flow(self, api):
        # 1. Get a trip option from the optimiser
        opt = api.post(f"{BASE_URL}/api/optimize", json=BASE_OPTIMIZE, timeout=45).json()
        trip = opt["options"][0]

        # 2. Save it
        save_res = api.post(f"{BASE_URL}/api/trips/save", json={"trip": trip}, timeout=30)
        assert save_res.status_code == 200, save_res.text
        saved = save_res.json()
        assert saved["trip"]["id"] == trip["id"]
        saved_id = saved["id"]

        # 3. List and verify no _id leakage, and our saved trip is present
        list_res = api.get(f"{BASE_URL}/api/trips", timeout=30)
        assert list_res.status_code == 200
        items = list_res.json()
        assert any(x["id"] == saved_id for x in items)
        for item in items:
            assert "_id" not in item, f"Mongo _id leaked in response: {item}"
            assert "_id" not in item.get("trip", {}), "Mongo _id leaked inside trip"

        # 4. Delete it
        del_res = api.delete(f"{BASE_URL}/api/trips/{saved_id}", timeout=30)
        assert del_res.status_code == 200
        assert del_res.json()["deleted"] == saved_id

        # 5. Deleting again should 404
        del_again = api.delete(f"{BASE_URL}/api/trips/{saved_id}", timeout=30)
        assert del_again.status_code == 404
