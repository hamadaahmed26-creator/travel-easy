"""Iteration 6 — global airports + typeahead search tests."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ["EXPO_PUBLIC_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# --- /api/airports — popular departures (curated, ~80-100) ---
class TestPopularLists:
    def test_airports_popular(self, s):
        r = s.get(f"{API}/airports", timeout=15)
        assert r.status_code == 200
        items = r.json()["airports"]
        assert 60 <= len(items) <= 130, f"Expected ~80-100 popular departures, got {len(items)}"
        codes = {a["code"] for a in items}
        # Spot-check curated entries
        for c in ("LHR", "JFK", "DXB", "JED", "SIN", "SYD"):
            assert c in codes, f"Popular departure missing: {c}"

    def test_destinations_popular(self, s):
        r = s.get(f"{API}/destinations", timeout=15)
        assert r.status_code == 200
        items = r.json()["destinations"]
        assert 60 <= len(items) <= 130, f"Expected ~80-100 popular destinations, got {len(items)}"
        codes = {a["code"] for a in items}
        for c in ("BCN", "DXB", "BKK", "JFK", "LOS", "HAN"):
            assert c in codes, f"Popular destination missing: {c}"


# --- /api/airports/search — typeahead ---
class TestAirportSearch:
    def test_search_jed(self, s):
        r = s.get(f"{API}/airports/search", params={"q": "jed"}, timeout=15)
        assert r.status_code == 200
        results = r.json()["results"]
        assert results, "No results for 'jed'"
        top = results[0]
        assert top["code"] == "JED", f"Expected JED on top, got {top['code']}"
        assert top["city"].lower().startswith("jed"), top["city"]
        assert top.get("country") == "SA"

    def test_search_lagos(self, s):
        r = s.get(f"{API}/airports/search", params={"q": "lagos"}, timeout=15)
        assert r.status_code == 200
        codes = [a["code"] for a in r.json()["results"]]
        assert "LOS" in codes, f"LOS not in results for 'lagos': {codes[:10]}"

    def test_search_hanoi(self, s):
        r = s.get(f"{API}/airports/search", params={"q": "hanoi"}, timeout=15)
        assert r.status_code == 200
        codes = [a["code"] for a in r.json()["results"]]
        assert "HAN" in codes, f"HAN not in results for 'hanoi': {codes[:10]}"

    def test_search_saudi_returns_multiple_cities(self, s):
        r = s.get(f"{API}/airports/search", params={"q": "saudi", "limit": 50}, timeout=15)
        assert r.status_code == 200
        results = r.json()["results"]
        cities = {a["city"] for a in results}
        # Must return Saudi airports — Jeddah and Riyadh both expected
        codes = {a["code"] for a in results}
        assert "JED" in codes, f"JED missing in saudi search: {codes}"
        assert "RUH" in codes, f"RUH missing in saudi search: {codes}"
        assert len(cities) >= 2

    def test_search_empty_returns_popular(self, s):
        r = s.get(f"{API}/airports/search", params={"q": ""}, timeout=15)
        assert r.status_code == 200
        results = r.json()["results"]
        assert results, "Empty q should return popular departures"
        # Should match (subset of) the popular departures list
        codes = {a["code"] for a in results}
        assert "LHR" in codes or "JFK" in codes

    def test_search_limit(self, s):
        r = s.get(f"{API}/airports/search", params={"q": "a", "limit": 5}, timeout=15)
        assert r.status_code == 200
        assert len(r.json()["results"]) <= 5


# --- /api/optimize with JED + Anywhere (large-airport pool) ---
class TestOptimizeFromJED:
    def test_optimize_from_jed_anywhere(self, s):
        body = {
            "departure": "JED",
            "destination": None,
            "budget": 1500,
            "trip_length": 5,
            "flexibility_days": 3,
            "weather": "any",
            "hotel_standard": "any",
            "start_window_days": 30,
        }
        r = s.post(f"{API}/optimize", json=body, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["options"]) == 3
        labels = {o["rank_label"] for o in data["options"]}
        assert labels == {"Cheapest", "Best Value", "Lowest Risk"}
        for o in data["options"]:
            assert o["departure"] == "JED"
            assert o["departure_city"].lower().startswith("jed")
            assert o["destination"] != "JED"
            assert o["total_price"] > 0
        assert data["searched_combinations"] > 1000  # ~1177 destinations × flex window
