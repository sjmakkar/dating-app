# Dating App — Mobile (Expo / React Native)

Phase 1 client for the backend. React Native + Expo Router + TypeScript.
Implements the full loop: **phone sign-in → onboarding → discover (swipe) →
match → chat handoff → profile/safety**. Google/Apple sign-in and the chat
provider SDK are stubbed for a later phase (as is Twilio for real SMS).

## Screens

```
app/
├─ _layout.tsx            # providers + auth-driven routing gate
├─ index.tsx              # splash / redirect
├─ (auth)/phone.tsx       # enter phone (E.164), request OTP
├─ (auth)/verify.tsx      # enter code → session (dev code: 000000)
├─ onboarding/profile.tsx # name, DOB (18+), gender, intent, bio, location, photo
├─ (tabs)/discover.tsx    # swipe deck (like/pass) → match alert
├─ (tabs)/matches.tsx     # list of active matches
├─ (tabs)/me.tsx          # your profile, verify, log out
└─ chat/[id].tsx          # match actions + chat-token handoff (SDK pending)

src/
├─ api/                   # typed client (auto refresh-token retry) + endpoints
├─ auth/                  # AuthContext + secure token storage
├─ components/            # Button/Field, SwipeCard (PanResponder, no native dep)
├─ config.ts theme.ts types.ts
```

## Run

```bash
cd mobile
npm install
cp .env.example .env      # set EXPO_PUBLIC_API_URL to your machine's LAN IP
npm run start             # press i / a, or scan the QR in Expo Go
```

Have the backend running first (`cd ../backend && npm run dev`). On a physical
device, `localhost` won't reach your laptop — use your LAN IP (e.g.
`http://192.168.1.20:4000`). Android emulator can use `http://10.0.2.2:4000`.

### Try the loop
1. Phone `+919800000001` → code `000000` → onboard.
2. Sign up a second person (`+919800000002`) with a nearby location, like each
   other → match → chat screen.

## Phase-1 notes honored from the spec
- 18+ validated client-side and re-checked by the backend.
- Only coarse distance shown (`"3 km away"`) — never raw coordinates.
- Tokens in `expo-secure-store`; access token auto-refreshes on 401, and a
  failed refresh forces sign-out.
- Discovery excludes already-swiped / blocked / self (enforced server-side).

## Deferred (later phases)
Google/Apple OAuth, real SMS (Twilio), Stream/Sendbird chat SDK, push
notifications, native image picker + client-side compression.
