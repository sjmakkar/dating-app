# Dating App — Backend (Phase 1 MVP)

Express + TypeScript + PostgreSQL/PostGIS. Implements the Phase 1 spec: sign up
(phone / Google / Apple), build a profile, discover nearby people, match, chat,
and basic safety — built on the **account-identity model** (one user, many linked
sign-in methods) that is the one part painful to change later.

## What's here

```
backend/
├─ migrations/001_init.sql      # 9-table schema + PostGIS + constraints/indexes
├─ src/
│  ├─ config.ts                 # env-driven config
│  ├─ db.ts                     # pg pool + withTransaction()
│  ├─ errors.ts                 # ApiError + error middleware
│  ├─ app.ts / server.ts        # express app + bootstrap
│  ├─ auth/
│  │  ├─ tokens.ts              # JWT access + rotating refresh tokens
│  │  └─ identityService.ts     # find-or-create + link (the core model)
│  ├─ middleware/               # requireAuth, OTP/auth rate limits
│  ├─ providers/                # verify (phone/google/apple), chat, moderation — stubbed
│  └─ routes/                   # auth, profile, discovery, swipes, chat, safety, devices
├─ scripts/migrate.ts           # forward-only migration runner
├─ scripts/smoke.ts             # end-to-end happy-path test
└─ .github/workflows/keepalive.yml  # free-tier anti-pause cron
```

## Run locally

1. **Postgres with PostGIS.** Easiest:
   ```bash
   docker run -d --name dating-pg -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=dating_app -p 5432:5432 postgis/postgis:16-3.4
   ```
   Or point `DATABASE_URL` at a Supabase project (PostGIS is available there).

2. **Configure + install**
   ```bash
   cp .env.example .env      # fill JWT secrets at minimum
   npm install
   ```

3. **Migrate, run, smoke-test**
   ```bash
   npm run migrate
   npm run dev               # http://localhost:4000
   npm run smoke             # in a second terminal
   ```

## Provider stubs (Phase 1)

Everything external is behind an adapter so the full flow is testable with zero
accounts:

- **Phone OTP** — DEV mode accepts `OTP_DEV_CODE` (default `000000`); the code is
  logged to the server console. Swap in Twilio Verify / MSG91 in `providers/verify.ts`.
- **Google / Apple** — when `GOOGLE_CLIENT_ID` / `APPLE_CLIENT_ID` are unset, the
  passed token is trusted as the subject. Wire real verification in the same file.
- **Chat** — `providers/chat.ts` returns stub channel ids and tokens. Replace with
  Stream/Sendbird. Your backend never proxies messages, only mints tokens and
  creates/closes channels.
- **Moderation** — `providers/moderation.ts` auto-approves. Wire Rekognition/Hive.
  Only `approved` photos are ever returned.

## Endpoints (all under `/v1`, Bearer JWT except auth)

| Domain | Endpoints |
|---|---|
| Auth | `POST /auth/phone/start` · `/auth/phone/verify` · `/auth/google` · `/auth/apple` · `/auth/link` · `/auth/refresh` · `/auth/logout` |
| Profile | `GET /me` · `PATCH /me/profile` · `POST /me/photos` · `DELETE /me/photos/:id` · `POST /me/verify` |
| Discovery | `GET /discovery` (geo radius + age + intent; excludes swiped/blocked/self; coarse distance only) |
| Swipe/Match | `POST /swipes` · `GET /matches` · `POST /matches/:id/unmatch` |
| Chat | `POST /chat/token` |
| Safety | `POST /blocks` · `POST /reports` |
| Devices | `POST /devices` · `DELETE /devices/:id` |

## Security notes honored from the spec

- Precise location stored as a PostGIS point but **never returned** — clients get
  `"3 km away"` only.
- **18+** validated at profile write time and on edit.
- **Block is absolute** — unmatches, closes the channel, and excludes the pair from
  discovery and matching in both directions.
- Short-lived access tokens + **rotating** refresh tokens; `logout?everywhere`
  revokes all of a user's refresh tokens.
- `auth_identities (provider, identifier)` is UNIQUE; accounts are never silently
  merged — linking only happens for an already-authenticated user.

## Deliberately omitted (later phases)

Subscriptions/payments (P3), prompts/voice/advanced filters (P2), AI matching/
video (P4), read receipts/typing (P2, enable from chat provider).
