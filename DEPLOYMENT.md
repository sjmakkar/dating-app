# Deploying the App

Two pieces: **(1)** the backend goes to a public host so it works off your LAN;
**(2)** a standalone app build points at that public URL. Your database
(Supabase) and photo storage are already cloud-hosted, so only the API server
needs deploying.

---

## Part 1 — Deploy the backend (Render, free)

`render.yaml` at the repo root already describes the service.

1. Push the latest code to GitHub (with `render.yaml` committed).
2. Go to https://render.com → sign in with GitHub → **New → Blueprint**.
3. Pick this repo. Render reads `render.yaml` and proposes the `dating-app-api`
   web service (rootDir `backend`, build `npm install && npm run build`, start
   `npm start`, health check `/health`).
4. Before the first deploy, set the **secret** env vars (the `sync:false` ones)
   in the Render dashboard — copy them from your `backend/.env`:
   - `DATABASE_URL` — **use the Supabase Session Pooler string** (Supabase → 
     Connect → Session pooler), not the direct `db.<ref>` host. Render's network
     reaches the pooler reliably; keep the `%23` encoding for the `#` in the
     password.
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
   - `GOOGLE_CLIENT_IDS`, `APPLE_CLIENT_IDS`
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`
   - `CHAT_API_KEY`, `CHAT_API_SECRET` (Stream)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   (The non-secret ones like `NODE_ENV`, `SMS_PROVIDER=twilio`,
   `CHAT_PROVIDER=stream`, `SUPABASE_STORAGE_BUCKET=photos` are already in
   `render.yaml`.)
5. **Create / Deploy**. First build takes a few minutes. When it's live you get a
   URL like `https://dating-app-api.onrender.com`.
6. Verify: open `https://<your-url>/health` → should return `{"ok":true,...}`.

> The DB is already migrated (you ran `npm run migrate` against Supabase), and
> the deployed server talks to that same Supabase — so no migration step is
> needed on Render.

**Free-tier caveat:** the service sleeps after ~15 min idle, so the first request
after idle takes ~50s (cold start). Fine for testing; add a keep-alive ping (the
GitHub Action in `backend/.github/workflows/keepalive.yml`, pointed at your Render
`/health` URL) or upgrade to remove it.

### Google/Apple redirect note
No redirect URIs to change — native Google/Apple sign-in verifies tokens by
audience, which doesn't depend on the backend URL.

---

## Part 2 — Standalone app build (points at the public backend)

Standalone builds don't read `.env`, so the public URL + public keys live in
`eas.json` under each profile's `env`.

1. In `mobile/eas.json`, replace the placeholders in **both** `preview` and
   `production`:
   - `EXPO_PUBLIC_API_URL` → your Render URL (e.g. `https://dating-app-api.onrender.com`)
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` → your Web OAuth client ID
   - `EXPO_PUBLIC_STREAM_API_KEY` → your Stream API key
2. Build the standalone APK (installable, runs anywhere — no Metro):
   ```powershell
   cd mobile
   eas build --profile preview --platform android
   ```
3. EAS gives an install link/QR. Anyone can install that APK on an Android phone
   and use the app over any network — it talks to your Render backend.

### iOS / stores (later)
- iOS: `eas build --profile production --platform ios` (needs the paid Apple
  Developer account), then `eas submit`.
- Google Play: `eas build --profile production --platform android` produces an
  `.aab`; `eas submit --platform android` uploads it.

---

## Post-deploy checklist
- [ ] `/health` returns ok on the Render URL.
- [ ] `eas.json` env has the Render URL + Google/Stream keys.
- [ ] Twilio + Stream + Supabase keys set in Render.
- [ ] Preview APK installs and a phone on mobile data can sign in, discover,
      match, and chat.
- [ ] Keep-alive scheduled so the free service doesn't cold-start during demos.
