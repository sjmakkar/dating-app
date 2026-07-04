# Google & Apple Sign-In — Setup Guide

The code is done. What's left is external configuration tied to your accounts.
This guide covers Google Cloud, Apple Developer, the env vars to fill, and the
development build (native Google/Apple sign-in does **not** run in Expo Go).

## How it works (so the config makes sense)

```
App → user taps "Continue with Google/Apple"
    → native SDK returns a signed token (Google idToken / Apple identityToken)
    → app POSTs it to your backend (/v1/auth/google or /v1/auth/apple)
    → backend verifies the token's signature + audience, then find-or-creates the user
    → backend returns your app's session (access + refresh tokens)
```

The **audience** of the token must match a client ID you register. That's the
one value that has to line up on both ends.

---

## 1. Google Cloud Console (free)

1. Go to https://console.cloud.google.com → create a project (e.g. "Dating App").
2. **APIs & Services → OAuth consent screen**
   - User type: **External** → Create.
   - App name, user support email, developer email → Save.
   - Scopes: add `openid`, `email`, `profile`.
   - Test users: add your own Google email (required while the app is "Testing").
3. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
   Create **three** clients (same project):

   **a. Web application** ← this is the important one
   - Name: "Dating App Web".
   - No redirect URIs needed for this native flow.
   - Copy its **Client ID** → this is your `webClientId` (audience the backend checks).

   **b. Android**
   - Package name: `com.example.datingapp` (must match `app.json` → `android.package`).
   - SHA-1 certificate fingerprint: see "Getting the Android SHA-1" below.

   **c. iOS**
   - Bundle ID: `com.example.datingapp` (must match `app.json` → `ios.bundleIdentifier`).
   - After creating, copy the **iOS URL scheme** (the reversed client ID, looks like
     `com.googleusercontent.apps.1234-abcd`).

### Getting the Android SHA-1
For a dev build signed by EAS:
```
npx eas credentials      # pick Android → your build profile → shows the SHA-1
```
For a locally-run debug build (`npx expo run:android`), the debug keystore SHA-1:
```
keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
```
(Add this SHA-1 to the Android OAuth client. You can add more later for release builds.)

---

## 2. Apple Developer (paid — $99/yr, iOS only)

1. https://developer.apple.com → **Certificates, Identifiers & Profiles → Identifiers**.
2. Register an **App ID**:
   - Bundle ID: `com.example.datingapp` (matches `app.json` → `ios.bundleIdentifier`).
   - Enable the **Sign In with Apple** capability → Save.
3. That's all that's needed for native iOS. The identity token's audience will be
   your bundle ID, which the backend checks.
   (A separate "Services ID" is only needed if you later add Apple sign-in on the
   web or Android — not required now.)

You need a Mac with Xcode, or EAS Build, to produce the iOS app, plus an iPhone or
the iOS Simulator to test (Apple sign-in does not work on Android at all).

---

## 3. Fill in the values

### `mobile/.env`  (copy from `.env.example`)
```
EXPO_PUBLIC_API_URL=http://<your-LAN-ip>:4000
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Web client ID from step 1a>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<iOS client ID from step 1c>   # optional, iOS only
```

### `mobile/app.json`
Replace the placeholder in the Google plugin with your **iOS URL scheme** (step 1c):
```jsonc
["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.1234-abcd" }]
```

### `backend/.env`
```
GOOGLE_CLIENT_IDS=<Web client ID>          # comma-separate to add iOS/Android client IDs too
APPLE_CLIENT_IDS=com.example.datingapp     # your iOS bundle ID
```
> Leaving these empty keeps the providers in DEV mode (tokens trusted without
> verification) — fine for local testing, never for production.

---

## 4. Build a development build (required)

Expo Go can't load the native Google/Apple modules, so build a dev client.

**Easiest — EAS (cloud build, works on Windows):**
```
npm i -g eas-cli
eas login
eas build:configure
eas build --profile development --platform android   # produces an installable .apk
# (iOS: eas build --profile development --platform ios  — needs Apple account)
```
Install the resulting build on your device, then:
```
npx expo start --dev-client
```

**Or local (needs Android Studio / Xcode):**
```
npx expo run:android      # or: npx expo run:ios  (Mac only)
```

Whenever you change `app.json` plugins or native deps, rebuild the dev client
(JS-only changes just need a reload).

---

## 5. Test

1. Backend running with the client IDs set in `backend/.env`.
2. Launch the dev build, open the sign-in screen.
3. **Continue with Google** → pick an account → you should land in onboarding (new
   user) or the app (returning). The Apple button appears only on iOS.
4. Verify a `users` + `auth_identities` row was created with `provider='google'`/`'apple'`.

### Account linking (already supported)
If someone signs in with Google today and phone next week, they'll be two separate
accounts unless linked. The backend exposes `POST /v1/auth/link` to attach a second
provider to the **currently signed-in** user — wire a "link account" button in
settings when you want that. It never auto-merges two existing accounts (by design).

---

## Troubleshooting
- **`DEVELOPER_ERROR` on Google (Android):** SHA-1 or package name mismatch in the
  Android OAuth client. Re-check both, and that you used the **Web** client ID as
  `webClientId`.
- **Backend returns `invalid_google_token`:** `GOOGLE_CLIENT_IDS` doesn't include the
  Web client ID the token was minted for.
- **Apple button missing:** it only renders on iOS (`Platform.OS === 'ios'`).
- **Nothing happens in Expo Go:** expected — you must use the development build.
