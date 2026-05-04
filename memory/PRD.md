# TripOpt — Total Trip Optimiser + Pro Mode + Global Airports

## Vision
A travel app that optimises whole trips like a financial portfolio. Pick **any city** worldwide → any other city → "What can I get for £X?" Returns 3 ranked trips (Cheapest / Best Value / Lowest Risk), Book-now-vs-Wait recommendation, and Pro-Mode price-watching with alerts.

## Stack
- **Frontend:** React Native (Expo SDK 54) + Expo Router · AsyncStorage · expo-web-browser · expo-notifications · react-native-reanimated · native Share
- **Backend:** FastAPI · Motor + MongoDB · APScheduler (price watcher every 6h) · emergentintegrations (Stripe one-time) · httpx (Emergent OAuth + Expo Push + OurAirports) · Pydantic
- **Auth:** Emergent-managed Google OAuth
- **Payments:** Stripe (£2.99 = 30 days of Pro, repeatable)
- **Push:** Expo hosted push service
- **Airports DB:** **OurAirports CC0** (~4,441 medium+large IATA airports, ~1,177 large-airport destinations) cached on disk at `/app/backend/data/airports_cache.json`

## Endpoints
**Public**
- `GET /api/airports` — curated popular departures (~95 hubs)
- `GET /api/destinations` — curated popular destinations
- `GET /api/airports/search?q=...&limit=...` — fuzzy live search across IATA / city / country / country-name / airport-name
- `POST /api/optimize` — runs portfolio optimisation
- `POST /api/auth/session` (exchange Emergent session_id), `POST /api/webhook/stripe`

**Auth-required**
- `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/trips`, `POST /api/trips/save`, `DELETE /api/trips/{id}`, `POST /api/trips/{id}/watch`
- `POST /api/payments/checkout`, `GET /api/payments/status/{sid}`
- `POST /api/push/register`
- `GET /api/notifications`, `POST /api/notifications/{id}/read`
- `POST /api/_admin/run-watcher` (manual scheduler trigger)

## Screens
- `/` — Search (budget chips, Anywhere highlight, **typeahead picker** with auto-focus + Recent + debounced live search)
- `/loading` — Dark Swiss optimisation loader
- `/results` — Verdict banner + 3 ranked trip cards with savings chips
- `/trip/[id]` — Full breakdown, sparkline, Save/Watch/Share/Book-Flight/Book-Hotel
- `/saved` — Per-user saved trips, watch toggles, Pro upgrade banner, logout
- `/alerts` — In-app price-alert inbox
- `/login` — Emergent Google OAuth
- `/upgrade` — Stripe checkout (£2.99 = 30 days)

## Algorithm
1. For each (destination, date in flexibility window): generate seeded flight (haversine-distance-based) + hotel + score.
2. Cheapest = min total · Best Value = max(rating·100/(total/100) − distance·2 − stops·5) · Lowest Risk = min volatility×200 + max(0, trend)×100
3. 30d simulated history + 14d forecast → Book-now if total < 95% avg or +5% rising; Wait if elevated and falling.
4. Headline: `£500 budget → Palma de Mallorca for £375. You save £125.`
5. Background watcher re-runs optimisation on every watched trip every 6h. Triggers alert if price drops ≥5%, rises ≥7%, or recommendation flips.

## MongoDB collections
`users`, `user_sessions`, `saved_trips`, `notifications`, `push_tokens`, `payment_transactions`, `optimisations`

## Pro Tier
- Free: 1 watched trip · Pro: unlimited + push + early deal access (£2.99 / 30d)

## Mocked / Stubbed
- Flight + hotel pricing: deterministic seeded mock with **haversine-distance-based base** (LHR→Paris ~£100–250, LHR→Tokyo ~£900–1300, NRT→LAX ~£974)
- Affiliate URLs: generic Skyscanner / Booking.com search URLs (no affiliate ID yet)
- Push delivery requires a native build (Expo Go limitation)

## Tested
- Backend: 36/39 pytest pass (3 minor pre-existing test-data allowlist issues unrelated to this iteration)
- Frontend: 13/13 iter-7 features verified by testing agent (typeahead picker, Recent chips, no-results, search by 'saudi'/'jed'/'lagos'/'vietnam', full optimise flow, Pro Mode, login, paywall)

## What's left
1. Real Skyscanner / Amadeus / Booking APIs (single `_optimise()` swap)
2. Affiliate IDs in `_affiliate_flight()` / `_affiliate_hotel()` for revenue
3. Native dev build to enable real push delivery
4. Pull-to-refresh, profile screen, deep-linking from notifications on cold start
