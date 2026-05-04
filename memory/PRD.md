# TripOpt — Total Trip Optimiser + Pro Mode

## Vision
A travel app that optimises an *entire* trip (flights + hotels + timing) like a financial portfolio. Type a budget, tap "Anywhere", and TripOpt returns the best possible full trip you can buy for that money — with a Book-now-vs-Wait recommendation and confidence score. **Pro Mode** lets users watch saved trips so the optimiser re-runs in the background and pings them when prices move or the recommendation flips.

## Stack
- **Frontend:** React Native (Expo SDK 54) + Expo Router, react-native-reanimated, AsyncStorage 2.2.0, expo-web-browser, expo-notifications, native `Share`.
- **Backend:** FastAPI + Motor + MongoDB + APScheduler (background watcher) + emergentintegrations (Stripe one-time checkout) + httpx (Emergent OAuth + Expo Push). Single-file `server.py`.
- **Auth:** Emergent-managed Google OAuth (session_token Bearer header).
- **Payments:** Stripe via `emergentintegrations.payments.stripe.checkout.StripeCheckout` (key `sk_test_emergent`).
- **Push:** Expo hosted push service (`exp.host/--/api/v2/push/send`); registration always works, delivery requires native dev build (Expo Go on Android dropped push in SDK 53+).

## Endpoints
**Public**
- `GET /api/airports`, `GET /api/destinations`, `POST /api/optimize`
- `POST /api/auth/session` (exchange Emergent session_id → session_token)
- `POST /api/webhook/stripe`

**Auth-required (Bearer)**
- `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/trips`, `POST /api/trips/save`, `DELETE /api/trips/{id}`
- `POST /api/trips/{id}/watch` (toggle; returns 402 for free tier > 1 watch)
- `POST /api/payments/checkout`, `GET /api/payments/status/{sid}` (poll)
- `POST /api/push/register`
- `GET /api/notifications`, `POST /api/notifications/{id}/read`
- `POST /api/_admin/run-watcher` (manual trigger)

## Screens
- `/` — Search (budget chips, Anywhere highlight, login + alerts icons)
- `/loading` — Dark Swiss optimisation loader
- `/results` — Verdict banner + 3 ranked trip cards (savings chips)
- `/trip/[id]` — Breakdown, sparkline, Save / Watch / Share / Book-Flight / Book-Hotel
- `/saved` — Per-user saved trips, Watch toggles, Pro upgrade banner, logout
- `/alerts` — In-app price-alert inbox
- `/login` — Google one-tap (Emergent OAuth)
- `/upgrade` — Stripe checkout (£2.99 = 30 days of Pro)

## Algorithm
- For each (destination, date in flexibility window) — generate seeded flight + hotel — compute total. Rank Cheapest / Best Value / Lowest Risk.
- 30d simulated history + 14d forecast → Book-now if total < 95% avg or forecast +5% rising; Wait if elevated and falling.
- Headline: `£500 budget → Palma de Mallorca for £375. You save £125.`
- Background watcher re-runs optimisation on every watched trip every 6h. Triggers alert if price drops ≥5%, rises ≥7%, or recommendation flips.

## MongoDB collections
- `users` (user_id, email, name, picture, pro_until)
- `user_sessions` (user_id, session_token, expires_at)
- `saved_trips` (user_id, trip, is_watching, last_seen_total, last_seen_recommendation)
- `notifications` (user_id, title, body, saved_trip_id, read)
- `push_tokens` (user_id, expo_token, platform, active)
- `payment_transactions` (session_id, user_id, payment_status, credited, pro_until)
- `optimisations` (search analytics)

## Pro Tier
- Free: 1 watched trip
- Pro: unlimited watches, real price alerts (in-app + push), early deal access (£2.99 / 30d, repeatable)

## Mocked / Stubbed
- Flight + hotel pricing: deterministic seeded mock (no Skyscanner/Booking.com APIs)
- Affiliate URLs: generic Skyscanner / Booking.com search URLs (no affiliate ID yet)
- Push delivery: registration is real; actual Expo push delivery requires a native build (Expo Go limitation)

## Tested
- 23/23 backend pytest tests pass (auth, scoping, watch limit, watcher, Stripe, push, notifications + 9 regression for the v1 MVP)
- Frontend E2E verified: viral search flow (£500 → Anywhere), login screen, upgrade screen with £2.99 hero, alerts inbox, saved screen with watch toggles + Pro banner, unauth save → redirect to /login

## Next steps
1. Real Skyscanner / Amadeus + Booking.com / RapidAPI integrations (single `_optimise()` swap)
2. Plug in affiliate IDs for revenue
3. Native dev build to enable real push delivery
4. Polish: pull-to-refresh, profile page, deep-linking from notifications on cold start
