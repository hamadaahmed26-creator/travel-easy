# TripOpt Auth Testing Playbook

Authentication: Emergent Google OAuth via session_token (Authorization: Bearer header).

## Test User Setup
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'tripopt.test.' + Date.now() + '@example.com',
  name: 'TripOpt Test User',
  picture: 'https://via.placeholder.com/150',
  pro_until: null,
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Quick verifications
```bash
# Identity
curl -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  https://your-app.com/api/auth/me

# Saved trips (scoped per user)
curl -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  https://your-app.com/api/trips

# Pro status
curl -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  https://your-app.com/api/auth/me
# Look at pro_until in the response
```

## Pro Tier Test
```bash
mongosh --eval "
use('test_database');
db.users.updateOne(
  {user_id: 'YOUR_USER_ID'},
  {\$set: {pro_until: new Date(Date.now() + 30*24*60*60*1000)}}
);
"
```

## Frontend Cookie Setup (Playwright)
```javascript
await page.context.add_cookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "your-app.com",
    "path": "/",
    "httpOnly": false,
    "secure": true,
    "sameSite": "None"
}]);
```

## Routes that REQUIRE auth
- GET /api/auth/me
- GET /api/trips
- POST /api/trips/save
- DELETE /api/trips/{id}
- POST /api/trips/{id}/watch (toggle)
- GET /api/notifications
- POST /api/payments/checkout
- GET /api/payments/status/{session_id}
- POST /api/push/register

## Public routes
- GET /api/airports
- GET /api/destinations
- POST /api/optimize
- POST /api/auth/session (exchange session_id)
- POST /api/webhook/stripe

## Pro-gated features
- Watching more than 1 trip (free = 1 watched, Pro = unlimited)
- Pro Mode toggle on the saved screen
