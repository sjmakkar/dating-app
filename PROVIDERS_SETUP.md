# Production Providers — Setup Guide

Everything works today with dev stubs. This guide turns on the real services,
one at a time. Each is behind a `*_PROVIDER` switch, so an unset/empty config
keeps the stub — you can enable them independently.

Status:
- ✅ **SMS OTP (Twilio Verify)** — code wired; just add keys.
- ⏳ **Managed chat (Stream)** — account + client SDK work (next).
- ⏳ **Push notifications (Firebase FCM + Expo)** — account + client work (next).
- ⏳ **Image moderation (AWS Rekognition)** — account + backend adapter (next).

A note on "free": SMS is the one unavoidable cost (Twilio trial credit covers
testing). Stream (Maker plan), Firebase/FCM, and Expo push are genuinely free at
MVP scale. AWS Rekognition is free for 12 months, then paid.

---

## 1. SMS OTP — Twilio Verify  ✅ code done

Makes real phone codes work (replaces the dev `000000`).

1. Create an account at https://www.twilio.com/try-twilio (free trial credit).
2. Console home → copy **Account SID** and **Auth Token**.
3. Create a Verify service: **Verify → Services → Create** (name it "Dating App").
   Copy its **Service SID** (starts with `VA...`).
4. While on the trial, add your test phone number under **Verified Caller IDs**
   (trial can only send to verified numbers).
5. In `backend/.env`:
   ```
   SMS_PROVIDER=twilio
   TWILIO_ACCOUNT_SID=ACxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxx
   TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxx
   ```
6. Restart the backend. Now `POST /auth/phone/start` sends a real SMS and
   `/auth/phone/verify` checks it. Set `SMS_PROVIDER=stub` anytime to go back to
   the `000000` dev code.

> India (+91) at scale: MSG91 is cheaper. The adapter lives in
> `backend/src/providers/verify.ts` — add an `msg91` branch when needed.

---

## 2. Managed chat — Stream  ⏳

Replaces the Postgres-backed chat with realtime messaging, typing indicators and
read receipts. Requires backend keys **and** the Stream React Native SDK in the
app (client work, needs the dev build).

1. Sign up at https://getstream.io → create an app → choose **Chat**.
2. Dashboard → copy the **API Key** and **API Secret**.
3. `backend/.env`:
   ```
   CHAT_PROVIDER=stream
   CHAT_API_KEY=your_key
   CHAT_API_SECRET=your_secret
   ```
   The backend already mints tokens / creates channels via
   `backend/src/providers/chat.ts` — I'll fill the Stream calls there.
4. `mobile/.env`:
   ```
   EXPO_PUBLIC_STREAM_API_KEY=your_key
   ```
5. Client SDK (I'll wire this): `npx expo install stream-chat-react-native` +
   swap the chat screen to Stream's channel/message components, authenticating
   with the token from `POST /v1/chat/token`.

When you're ready, tell me and I'll implement both sides.

---

## 3. Push notifications — Firebase (FCM) + Expo  ⏳

Notify users of new matches and messages. Android delivery goes through FCM;
Expo's push service is the simplest sender. Needs a Firebase project and the dev
build (push doesn't work in Expo Go).

1. Create a Firebase project at https://console.firebase.google.com.
2. Add an **Android app** with package `com.example.datingapp` → download
   `google-services.json`.
3. Firebase → Project settings → **Cloud Messaging** → note it's the V1 API
   (Expo uses a service-account key you'll upload to Expo).
4. In Expo: upload the FCM credentials (`eas credentials` → Android → Push key),
   so Expo can deliver to your app.
5. Client (I'll wire): `npx expo install expo-notifications`, request permission,
   get the Expo push token, and `POST /v1/devices` to save it.
6. Backend (I'll wire): on new match/message, send via Expo's push API to the
   recipient's saved tokens.

> iOS push additionally needs an APNs key from your Apple Developer account.

---

## 4. Image moderation — AWS Rekognition  ⏳

Auto-screens uploaded photos for unsafe content instead of auto-approving. Only
new uploads are scanned (result cached in `photos.moderation_status`).

1. Create an AWS account (Rekognition free tier: 5,000 images/month for 12 mo).
2. IAM → create a user with programmatic access and the
   `AmazonRekognitionReadOnlyAccess` policy → copy the **Access Key ID** and
   **Secret Access Key**.
3. `backend/.env`:
   ```
   MODERATION_PROVIDER=rekognition
   AWS_REGION=ap-south-1
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   ```
4. Backend (I'll wire): `backend/src/providers/moderation.ts` calls
   `DetectModerationLabels`; photos with unsafe labels above a confidence
   threshold are set to `rejected` and never shown.

> Cheaper/simpler alternative: Cloudflare Images or a hosted Hive endpoint. Or
> keep manual moderation (the `reports` queue) for the earliest MVP.

---

## Recommended order
1. **Twilio** (done — just keys) so phone login is real.
2. **Push** — highest retention impact once people match.
3. **Stream** — upgrade chat when self-hosted polling isn't enough.
4. **Moderation** — before opening signups to the public.

Tell me which to implement next and I'll wire the code + update this guide.
