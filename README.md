# Dating App — Phase 1 MVP

A location-based dating app: phone/Google/Apple sign-in, profiles, nearby
discovery, swiping, matching, chat, and basic safety.

## Repo layout

```
backend/    Express + TypeScript API · PostgreSQL + PostGIS (Supabase)
mobile/     React Native (Expo Router) app
```

- **backend/** — auth-identity model, discovery (PostGIS), swipes/matches,
  self-hosted chat, safety (block/report), photo upload. See `backend/README.md`.
- **mobile/** — Expo app consuming the API. See `mobile/README.md`.
- **PROVIDERS_SETUP.md** — turning on real providers (Twilio SMS, Stream chat,
  Firebase push, image moderation).
- **mobile/SOCIAL_AUTH_SETUP.md** — Google & Apple sign-in setup.

## Quick start

```bash
# Backend
cd backend
cp .env.example .env      # fill in your values
npm install
npm run migrate
npm run dev               # http://localhost:4000

# Mobile (separate terminal)
cd mobile
cp .env.example .env      # set EXPO_PUBLIC_API_URL to your machine's LAN IP
npm install
npx expo start
```

## Security

Secrets live only in local `.env` files, which are gitignored. Never commit
real credentials — only the `.env.example` templates belong in git.
