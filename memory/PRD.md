# TripOpt — Total Trip Optimiser

## Vision
A travel app that optimises an *entire* trip (flights + hotels + timing) like a financial portfolio. The viral hook: type a budget, tap "Anywhere", and TripOpt returns the best possible full trip you can buy for that money — with a Book-now-vs-Wait recommendation and a confidence score.

## Stack
- **Frontend:** React Native (Expo SDK 54) + Expo Router, react-native-reanimated for the loading screen, AsyncStorage 2.2.0 (Expo-pinned) for inter-screen state, expo-web-browser for affiliate redirects, native `Share` for viral sharing.
- **Backend:** FastAPI + Motor + MongoDB. Single-file `server.py` with deterministic seeded mock pricing engine (no paid APIs). All routes under `/api`.
- **Database:** MongoDB collections: `optimisations` (search analytics), `saved_trips` (user-saved trips). All queries project out `_id`.

## Core Algorithm — `_optimise()` in /app/backend/server.py
1. Build candidate set: for each destination (filtered by weather/budget/explicit destination), for each date in `start_window ± flexibility`, generate a deterministic seeded flight option (airline, times, stops, price) and hotel option (brand, rating, distance, nightly rate). Compute `total = flight + hotel * nights`.
2. Score each candidate:
   - **Cheapest** = min(total)
   - **Best Value** = max(rating × 100 / (total/100) − distance·2 − stops·5)
   - **Lowest Risk** = min(volatility·200 + max(0, trend)·100)
3. Generate 30-day price history + 14-day forecast (deterministic seeded sim).
4. Recommendation engine: if current total < 95% of 30-day avg OR forecast trends > +5% → Book Now (high confidence). If total > 105% of avg AND forecast falling → Wait. Otherwise stable.
5. Headline: `"£{budget} budget → {city} for £{total}. You save £{savings}."` (or "X over budget").

## Endpoints
- `GET /api/airports` — UK departure airports (10 cities)
- `GET /api/destinations` — destination cities with weather + base pricing (16 cities across Europe + Turkey)
- `POST /api/optimize` — returns 3 ranked trip options + verdict metadata
- `POST /api/trips/save` — persist a saved trip
- `GET /api/trips` — list saved trips (newest first)
- `DELETE /api/trips/{id}` — remove

## Screens
- `/` — Search (budget chips, Anywhere/destination, nights, flexibility, weather, hotel standard)
- `/loading` — Dark Swiss-style optimisation loader, rotating stages, auto-redirects after ≥2.2s
- `/results` — Dark **Verdict banner** with headline + COMBOS/MEDIAN/YOU SAVE stats, then 3 ranked trip cards (Cheapest, Best Value, Lowest Risk) each with savings chip + Book-now/Wait badge
- `/trip/[id]` — Full breakdown, price intelligence sparkline (history + forecast), Share + Save icon buttons, sticky Book Flight / Book Hotel affiliate CTAs
- `/saved` — Saved trips list with delete

## Mocked / Stubbed
- **Flight pricing**: deterministic seeded random (no Skyscanner API). All trip data is realistic but synthetic.
- **Hotel pricing**: deterministic seeded random (no Booking.com API).
- **Affiliate URLs**: generic Skyscanner & Booking.com search URLs with the right route + dates baked in (no affiliate ID — user can add later).

## Differentiators (vs Skyscanner/Hopper)
1. Optimises **combined** trip cost, not flights or hotels separately
2. Headline + savings chip frame the result in **portfolio terms** (you saved £X vs your budget)
3. Book-now/Wait recommendation with confidence score
4. One-tap viral input (budget preset + "Anywhere")
5. Native share to spread the deal

## Tested
- 10/10 backend pytest tests passing (`/app/backend/tests/test_tripopt_api.py`)
- Full frontend E2E flow verified by testing agent (Home → Loading → Results → Detail → Save → Saved → Delete + viral fields)

## Not yet built (future)
- Pro Mode: persistent price alerts on full trips, deeper LLM-driven predictions
- Real flight/hotel APIs (currently mocked)
- User auth (MVP intentionally has none)
- Push notifications
