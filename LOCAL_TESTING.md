# Local Testing Guide (Ubuntu / Linux)

Run the entire app on your own machine — your own backend, your own database,
no dependency on anyone else's laptop. Everything stays free and on stub
providers, so **phone login uses the code `000000`** (no Twilio/Google keys needed).

## What you need
- **Node.js 20+** and **npm**
- **Docker** (easiest way to get PostgreSQL + PostGIS) — or a free Supabase project
- An **Android phone** with the **Expo Go** app (on the same Wi-Fi as your PC),
  or **Android Studio** with an emulator

> Note: Ubuntu can't install/run the Android app directly — you view it through
> Expo Go on a phone or an Android emulator.

---

## 1. Clone

```bash
git clone <the-repo-url> dating-app
cd dating-app
```

## 2. Database (Docker — one command)

```bash
docker run -d --name dating-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dating_app \
  -p 5432:5432 postgis/postgis:16-3.4
```
(Or use your own Supabase project and put its connection string in the `.env` below.)

## 3. Backend

```bash
cd backend
cp .env.example .env
```
Edit `backend/.env` — for local Docker Postgres, set:
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/dating_app
JWT_ACCESS_SECRET=any-long-random-string
JWT_REFRESH_SECRET=another-long-random-string
SMS_PROVIDER=stub
CHAT_PROVIDER=stub
```
Then:
```bash
npm install
npm run migrate      # creates all tables + PostGIS
npm run dev          # API on http://localhost:4000
```
Leave this terminal running.

## 4. Mobile

Open a second terminal:
```bash
cd dating-app/mobile
cp .env.example .env
```
Find your PC's LAN IP:
```bash
hostname -I        # e.g. 192.168.1.50
```
Edit `mobile/.env`:
```
# Physical phone (same Wi-Fi): use your PC's LAN IP
EXPO_PUBLIC_API_URL=http://192.168.1.50:4000
# Android emulator instead? use: http://10.0.2.2:4000
```
Then:
```bash
npm install
npx expo start
```

## 5. Open the app
- **Physical phone:** open **Expo Go**, scan the QR from the terminal. Phone and PC must be on the same Wi-Fi.
- **Emulator:** press `a` in the Expo terminal (Android Studio emulator must be running).

Allow port 4000 through the firewall if the phone can't connect:
```bash
sudo ufw allow 4000
```

---

## How to test the full flow
1. **Sign in:** enter any phone number in `+<country><number>` form (e.g. `+919812345678`) → code is **`000000`**.
2. Complete onboarding (name, DOB 18+, gender, a photo, and tap **Use my current location**).
3. **To see matches, you need two users near each other.** Sign in as a second
   user (different phone number) on another device/emulator, give them a location
   close to the first, and like each other → you'll match and can chat.
   - Discovery is distance-based, so keep both users' locations close (or the deck
     will be empty).
4. Chat, block, report, edit profile all work against your local backend.

## What does NOT work in local Expo Go (and that's expected)
- **Google / Apple sign-in** — needs a native development build, not Expo Go.
  Use phone login (`000000`) for testing.
- **Real SMS / push / managed chat** — those are stub/off locally by design.

That's it — a self-contained local instance for testing.
