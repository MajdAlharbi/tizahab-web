# Tizahab API Documentation

**Base URL:** `http://localhost:8000/api` or `https://tizahab.example.com/api`

---

## Authentication

All endpoints (except login/signup) require JWT authentication.

**Authorization Header:**
```
Authorization: Bearer <access_token>
```

**Get tokens:**
- **Login:** `POST /auth/login/` → Returns `access` and `refresh` tokens
- **Refresh:** `POST /auth/token/refresh/` → Returns new `access` token

---

## Endpoints

### 1. Authentication

#### Sign Up
```
POST /auth/signup/
Content-Type: application/json

{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "password2": "SecurePassword123!"
}

Response: 201 Created
{
    "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
    "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

#### Log In
```
POST /auth/login/
Content-Type: application/json

{
    "email": "user@example.com",
    "password": "SecurePassword123!"
}

Response: 200 OK
{
    "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
    "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

#### Refresh Token
```
POST /auth/token/refresh/
Content-Type: application/json

{
    "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}

Response: 200 OK
{
    "access": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

---

### 2. User Preferences

#### Get Preferences
```
GET /auth/preferences/
Authorization: Bearer <access_token>

Response: 200 OK
{
    "preferred_language": "en",
    "budget_min": 50,
    "budget_max": 500,
    "interests": ["food", "culture", "outdoor"]
}
```

#### Update Preferences
```
POST /auth/preferences/
Authorization: Bearer <access_token>
Content-Type: application/json

{
    "preferred_language": "ar",
    "budget_min": 100,
    "budget_max": 1000,
    "interests": ["food", "shopping", "culture"]
}

Response: 200 OK or 201 Created
(Same as GET response)
```

---

### 3. Events

#### List All Events
```
GET /events/?category=food&date=2026-03-15
Authorization: Bearer <access_token>

Query Parameters:
- category: (optional) food | culture | outdoor | shopping | other
- date: (optional) YYYY-MM-DD format

Response: 200 OK
{
    "count": 150,
    "next": null,
    "previous": null,
    "results": [
        {
            "id": 1,
            "title": "Al Tazaj",
            "category": "food",
            "description": "Traditional grilled chicken restaurant",
            "date": "2026-03-15T19:00:00Z",
            "location": "Olaya Street, Riyadh",
            "price_range": "50-200 SAR",
            "latitude": 24.7136,
            "longitude": 46.6753
        }
    ]
}
```

#### Get Filtered Events (by preferences)
```
GET /events/filtered/?date_from=2026-03-15&date_to=2026-03-20
Authorization: Bearer <access_token>

Query Parameters:
- date_from: (optional) YYYY-MM-DD format
- date_to: (optional) YYYY-MM-DD format
- Automatically filters by user preferences (interests, budget)

Response: 200 OK
(Same structure as /events/)
```

---

### 4. Daily Plans

#### List Daily Plans
```
GET /daily-plan/
Authorization: Bearer <access_token>

Response: 200 OK
{
    "count": 5,
    "next": null,
    "previous": null,
    "results": [
        {
            "id": 1,
            "date": "2026-03-15",
            "events": [
                {
                    "id": 1,
                    "title": "Al Tazaj",
                    "category": "food",
                    ...
                }
            ],
            "created_at": "2026-03-12T10:00:00Z"
        }
    ]
}
```

#### Generate Daily Plan
```
POST /daily-plan/generate/
Authorization: Bearer <access_token>
Content-Type: application/json

{
    "date": "2026-03-15"
}

Response: 201 Created
{
    "id": 1,
    "date": "2026-03-15",
    "events": [
        {
            "id": 1,
            "title": "Al Tazaj",
            "category": "food",
            ...
        },
        {
            "id": 5,
            "title": "National Museum",
            "category": "culture",
            ...
        }
    ],
    "count": 2
}
```

#### Get Daily Plan Details
```
GET /daily-plan/{id}/
Authorization: Bearer <access_token>

Response: 200 OK
{
    "id": 1,
    "date": "2026-03-15",
    "events": [...],
    "created_at": "2026-03-12T10:00:00Z"
}
```

#### Update Daily Plan
```
PUT /daily-plan/{id}/
Authorization: Bearer <access_token>
Content-Type: application/json

{
    "date": "2026-03-16",
    "events": [1, 3, 5]
}

Response: 200 OK
(Same structure as GET)
```

---

## Error Responses

### 400 Bad Request
```json
{
    "detail": "Invalid date format. Expected YYYY-MM-DD"
}
```

### 401 Unauthorized
```json
{
    "detail": "Authentication credentials were not provided."
}
```

### 403 Forbidden
```json
{
    "detail": "You do not have permission to perform this action."
}
```

### 404 Not Found
```json
{
    "detail": "No recommendations found for your interests and budget on this date."
}
```

### 500 Internal Server Error
```json
{
    "detail": "Unexpected error while generating plan."
}
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success (GET, POST update) |
| 201 | Created (POST creation) |
| 400 | Bad Request (invalid input) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Internal Server Error |
| 503 | Service Unavailable (external API down) |

---

## Rate Limiting

Anonymous users: 100 requests/hour
Authenticated users: 1000 requests/hour

Remaining requests shown in headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1234567890
```

---

## Examples

### Complete Workflow

```bash
# 1. Sign up
curl -X POST http://localhost:8000/api/auth/signup/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "password2": "SecurePass123!"
  }'

# Response: {"access": "...", "refresh": "..."}
# Save the access token

TOKEN="access_token_here"

# 2. Set preferences
curl -X POST http://localhost:8000/api/auth/preferences/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "preferred_language": "en",
    "budget_min": 50,
    "budget_max": 500,
    "interests": ["food", "culture", "outdoor"]
  }'

# 3. Browse events
curl -X GET "http://localhost:8000/api/events/?category=food" \
  -H "Authorization: Bearer $TOKEN"

# 4. Generate daily plan
curl -X POST http://localhost:8000/api/daily-plan/generate/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-03-15"}'

# 5. View all plans
curl -X GET http://localhost:8000/api/daily-plan/ \
  -H "Authorization: Bearer $TOKEN"
```

---

## Best Practices

1. **Token Management**
   - Store tokens securely (e.g., httpOnly cookie)
   - Refresh token before expiry (15 minutes)
   - Clear tokens on logout

2. **Error Handling**
   - Always check response status code
   - Display user-friendly error messages
   - Log errors for debugging

3. **Performance**
   - Use date filters to reduce result size
   - Cache results locally when possible
   - Implement pagination for large datasets

4. **Security**
   - Never log tokens or sensitive data
   - Validate input on client and server
   - Use HTTPS in production

---

## Support

For issues or questions, contact: support@tizahab.com
