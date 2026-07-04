# Push Notifications — Setup

The code is wired: the app registers an Expo push token (saved via `POST
/v1/devices`), and the backend sends a push on **new match** and **new message**
(self-hosted chat) through Expo's push service. Expo relays to **FCM** (Android)
and **APNs** (iOS), so you don't call those directly.

Push requires the **development/standalone build** — it does nothing in Expo Go
(the code short-circuits there safely).

## What already works
- `expo-notifications` added; the app asks permission and uploads the token
  after onboarding.
- Backend `providers/push.ts` sends via `https://exp.host/--/api/v2/push/send`.
- Triggers: new match → notifies the other user; new message (self-hosted chat)
  → notifies the recipient.

## 1. Android — Firebase Cloud Messaging (FCM)

Expo needs FCM V1 credentials to deliver to your Android app.

1. Create/open a Firebase project: https://console.firebase.google.com.
2. **Add app → Android**, package name `com.example.datingapp` (must match
   `app.json` → `android.package`). Download **`google-services.json`**.
3. Put `google-services.json` in the `mobile/` folder and reference it in
   `app.json` (I can add this):
   ```json
   "android": { "googleServicesFile": "./google-services.json", "package": "com.example.datingapp" }
   ```
4. Give Expo the FCM V1 service-account key so it can send:
   - Firebase → Project settings → **Service accounts** → **Generate new private
     key** (downloads a JSON).
   - Upload it to Expo: `eas credentials` → Android → **Push Notifications: FCM V1
     service account key** → upload that JSON.

## 2. iOS — APNs (only when you build for iOS)
- `eas credentials` → iOS → **Push Notifications** → let EAS create/manage the
  APNs key (needs your paid Apple Developer account).

## 3. Rebuild & test
```
npx expo install expo-notifications   # ensure correct version
eas build --profile development --platform android
```
Install the new build, sign in, accept the notification permission prompt, then:
- Match with a second account → the other device gets a **“New match!”** push.
- Send a message (self-hosted chat) → the recipient gets a push.

Quick manual test of a token (from Expo's tool): https://expo.dev/notifications —
paste an `ExponentPushToken[...]` and send.

## Notes
- **Managed chat (Stream):** when `CHAT_PROVIDER=stream`, messages don't pass
  through our backend, so message push should be configured in the **Stream
  dashboard** (Stream → Push). Match pushes still come from our backend.
- Tokens are stored in `devices.fcm_token` (the column name predates Expo; it
  holds the Expo push token). Prune stale tokens later if Expo reports them
  `DeviceNotRegistered`.
- No secret keys live in the app — only the backend calls Expo's endpoint.
