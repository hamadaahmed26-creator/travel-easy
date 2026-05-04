"""TripOpt Pro Mode tests — auth, watch limit, watcher, Stripe, push, alerts."""
import os
import subprocess
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient

# --- BASE_URL (preview URL from frontend/.env)
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
            break
BASE_URL = BASE_URL.rstrip("/")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="session")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def _seed_user(mongo, pro: bool = False) -> tuple[str, str]:
    user_id = f"TEST_user_{uuid.uuid4().hex[:10]}"
    token = f"TEST_tok_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    pro_until = (now + timedelta(days=30)) if pro else None
    mongo.users.insert_one({
        "user_id": user_id,
        "email": f"TEST_{user_id}@example.com",
        "name": "Pytest User",
        "picture": None,
        "pro_until": pro_until,
        "created_at": now,
    })
    mongo.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": now + timedelta(days=7),
        "created_at": now,
    })
    return user_id, token


def _cleanup(mongo, user_id: str):
    mongo.users.delete_many({"user_id": user_id})
    mongo.user_sessions.delete_many({"user_id": user_id})
    mongo.saved_trips.delete_many({"user_id": user_id})
    mongo.notifications.delete_many({"user_id": user_id})
    mongo.push_tokens.delete_many({"user_id": user_id})
    mongo.payment_transactions.delete_many({"user_id": user_id})


@pytest.fixture
def user_a(mongo):
    uid, tok = _seed_user(mongo)
    yield uid, tok
    _cleanup(mongo, uid)


@pytest.fixture
def user_b(mongo):
    uid, tok = _seed_user(mongo)
    yield uid, tok
    _cleanup(mongo, uid)


@pytest.fixture
def pro_user(mongo):
    uid, tok = _seed_user(mongo, pro=True)
    yield uid, tok
    _cleanup(mongo, uid)


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _get_trip_option():
    r = requests.post(f"{BASE_URL}/api/optimize", json={
        "departure": "BRS", "destination": "PMI", "budget": 500,
        "trip_length": 4, "flexibility_days": 3, "weather": "any",
        "hotel_standard": "any", "start_window_days": 30,
    }, timeout=45)
    r.raise_for_status()
    return r.json()["options"][0]


# --- Auth -------------------------------------------------------------------
class TestAuth:
    def test_me_without_token_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=20)
        assert r.status_code == 401

    def test_trips_without_token_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/trips", timeout=20)
        assert r.status_code == 401

    def test_me_with_valid_token_returns_user(self, user_a):
        uid, tok = user_a
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == uid
        assert data["is_pro"] is False

    def test_pro_user_me_reports_pro(self, pro_user):
        uid, tok = pro_user
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok), timeout=20)
        assert r.status_code == 200
        assert r.json()["is_pro"] is True

    def test_logout_deletes_session(self, mongo, user_a):
        uid, tok = user_a
        r = requests.post(f"{BASE_URL}/api/auth/logout", headers=_hdr(tok), timeout=20)
        assert r.status_code == 200
        # Subsequent /me must 401
        r2 = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok), timeout=20)
        assert r2.status_code == 401


# --- Per-user trip scoping --------------------------------------------------
class TestTripScoping:
    def test_user_b_cannot_see_user_a_trips(self, user_a, user_b):
        _, tok_a = user_a
        _, tok_b = user_b
        trip = _get_trip_option()
        save = requests.post(f"{BASE_URL}/api/trips/save",
                             json={"trip": trip}, headers=_hdr(tok_a), timeout=30)
        assert save.status_code == 200, save.text

        # A sees it
        list_a = requests.get(f"{BASE_URL}/api/trips", headers=_hdr(tok_a), timeout=20).json()
        assert len(list_a) >= 1

        # B sees none
        list_b = requests.get(f"{BASE_URL}/api/trips", headers=_hdr(tok_b), timeout=20).json()
        assert all(x["user_id"] != user_a[0] for x in list_b)
        saved_a_id = save.json()["id"]
        assert not any(x["id"] == saved_a_id for x in list_b)


# --- Watch limit ------------------------------------------------------------
class TestWatchLimit:
    def test_free_watch_limit_402_and_pro_unlimited(self, mongo, user_a):
        uid, tok = user_a
        # Save two different trips
        t1 = _get_trip_option()
        t1["id"] = str(uuid.uuid4())
        t2 = _get_trip_option()
        t2["id"] = str(uuid.uuid4())
        t2["destination"] = "BCN"
        t2["destination_city"] = "Barcelona"

        s1 = requests.post(f"{BASE_URL}/api/trips/save", json={"trip": t1},
                           headers=_hdr(tok), timeout=30).json()
        s2 = requests.post(f"{BASE_URL}/api/trips/save", json={"trip": t2},
                           headers=_hdr(tok), timeout=30).json()

        # 1st watch → ok
        r1 = requests.post(f"{BASE_URL}/api/trips/{s1['id']}/watch",
                           json={"is_watching": True}, headers=_hdr(tok), timeout=20)
        assert r1.status_code == 200, r1.text

        # 2nd watch on free → 402
        r2 = requests.post(f"{BASE_URL}/api/trips/{s2['id']}/watch",
                           json={"is_watching": True}, headers=_hdr(tok), timeout=20)
        assert r2.status_code == 402, r2.text
        assert "free tier" in r2.json()["detail"].lower()

        # Grant Pro and retry
        mongo.users.update_one(
            {"user_id": uid},
            {"$set": {"pro_until": datetime.now(timezone.utc) + timedelta(days=30)}},
        )
        r3 = requests.post(f"{BASE_URL}/api/trips/{s2['id']}/watch",
                           json={"is_watching": True}, headers=_hdr(tok), timeout=20)
        assert r3.status_code == 200, r3.text
        assert r3.json()["is_watching"] is True


# --- Watcher ---------------------------------------------------------------
class TestWatcher:
    def test_run_watcher_noop_ok(self):
        # Just run — it should always return 200 regardless of state
        r = requests.post(f"{BASE_URL}/api/_admin/run-watcher", timeout=60)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_watcher_emits_notification_on_price_drop(self, mongo, user_a):
        uid, tok = user_a
        trip = _get_trip_option()
        s = requests.post(f"{BASE_URL}/api/trips/save", json={"trip": trip},
                          headers=_hdr(tok), timeout=30).json()
        # Enable watching
        requests.post(f"{BASE_URL}/api/trips/{s['id']}/watch",
                      json={"is_watching": True}, headers=_hdr(tok), timeout=20)
        # Artificially set last_seen_total very high so next run looks like a drop
        mongo.saved_trips.update_one(
            {"id": s["id"]}, {"$set": {"last_seen_total": 9999.0}}
        )
        # Run watcher
        r = requests.post(f"{BASE_URL}/api/_admin/run-watcher", timeout=90)
        assert r.status_code == 200
        time.sleep(1)
        # Fetch notifications
        notifs = requests.get(f"{BASE_URL}/api/notifications",
                              headers=_hdr(tok), timeout=20).json()
        assert len(notifs) >= 1
        assert any(trip["destination_city"] in n["title"] for n in notifs)

    def test_mark_notification_read(self, mongo, user_a):
        uid, tok = user_a
        # Seed a notification directly
        nid = str(uuid.uuid4())
        mongo.notifications.insert_one({
            "id": nid, "user_id": uid,
            "title": "TEST_alert", "body": "test body",
            "saved_trip_id": None, "data": {},
            "created_at": datetime.now(timezone.utc).isoformat(),
            "read": False,
        })
        r = requests.post(f"{BASE_URL}/api/notifications/{nid}/read",
                          headers=_hdr(tok), timeout=20)
        assert r.status_code == 200
        got = mongo.notifications.find_one({"id": nid})
        assert got["read"] is True


# --- Stripe Checkout ---------------------------------------------------------
class TestStripeCheckout:
    def test_checkout_creates_pending_transaction(self, mongo, user_a):
        uid, tok = user_a
        origin = BASE_URL
        r = requests.post(f"{BASE_URL}/api/payments/checkout",
                          json={"origin_url": origin}, headers=_hdr(tok), timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and data["url"].startswith("http")
        assert "session_id" in data and len(data["session_id"]) > 5
        # Verify db doc
        txn = mongo.payment_transactions.find_one({"session_id": data["session_id"]})
        assert txn is not None
        assert txn["user_id"] == uid
        assert txn["payment_status"] == "pending"
        assert txn["credited"] is False
        assert float(txn["amount_gbp"]) == 2.99

    def test_checkout_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/payments/checkout",
                          json={"origin_url": BASE_URL}, timeout=30)
        assert r.status_code == 401


# --- Push registration -------------------------------------------------------
class TestPush:
    def test_register_push_token(self, mongo, user_a):
        uid, tok = user_a
        expo_token = f"ExponentPushToken[TEST_{uuid.uuid4().hex[:16]}]"
        r = requests.post(f"{BASE_URL}/api/push/register",
                          json={"expo_token": expo_token, "platform": "ios"},
                          headers=_hdr(tok), timeout=20)
        assert r.status_code == 200
        # Verify persistence
        doc = mongo.push_tokens.find_one({"user_id": uid, "expo_token": expo_token})
        assert doc is not None
        assert doc["platform"] == "ios"
        assert doc["active"] is True

    def test_push_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/push/register",
                          json={"expo_token": "x", "platform": "ios"}, timeout=20)
        assert r.status_code == 401
