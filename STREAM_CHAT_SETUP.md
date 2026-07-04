# Managed Chat Setup — Stream

Right now chat is self-hosted (Postgres `messages` table + polling). This guide
sets up **Stream** as the managed chat provider — real-time delivery, typing
indicators, read receipts, and offline sync — on its free "Maker" tier.

Two parts: **(1)** create the Stream app and add keys (you do this now), and
**(2)** wire the SDKs (I do this once you have the keys). Chat is behind a
`CHAT_PROVIDER` switch, so nothing breaks while it's set to `stub`/self-hosted.

---

## 1. Create the Stream app (free)

1. Sign up at https://getstream.io → **Sign up** (free Maker plan is fine).
2. In the dashboard, create an app (e.g. "DatingApp-dev") and select the **Chat**
   product.
3. Open the app → **Overview / App Access Keys**. Copy:
   - **API Key** (public — goes in the app)
   - **API Secret** (private — backend only, never in the app)
4. (Optional) Under **Chat → Overview**, note the default permissions; the
   defaults are fine for a 1:1 messaging MVP.

## 2. Add the keys

`backend/.env`
```
CHAT_PROVIDER=stream
CHAT_API_KEY=your_stream_api_key
CHAT_API_SECRET=your_stream_api_secret
```

`mobile/.env`
```
EXPO_PUBLIC_STREAM_API_KEY=your_stream_api_key
```
(Only the public API key goes in the app; the secret stays on the backend.)

---

## 3. What I'll wire (once keys are in)

**Backend** (`backend/src/providers/chat.ts`) — swap the stub for the Stream
server SDK (`stream-chat`):
- `mintUserToken(userId)` → `serverClient.createToken(userId)` (already called by
  `POST /v1/chat/token`).
- `createChannel(a, b)` on a new match → create a `messaging` channel with both
  members; store its id in `matches.chat_channel_id` (column already exists).
- `closeChannel()` on unmatch/block.
- Upsert both users into Stream when a match is created.

**Mobile** — add the Stream React Native SDK and render the real chat UI:
```
npx expo install stream-chat-expo stream-chat-react-native-core
```
- Connect the user with the token from `POST /v1/chat/token`.
- Replace the polling chat screen (`app/chat/[id].tsx`) with Stream's
  `Channel` + `MessageList` + `MessageInput` components, opening the channel by
  the match's `chat_channel_id`.
- Keep the block/report/unmatch actions in the header.

**Note:** the Stream RN SDK is a native module, so it needs the **development
build** (like Google sign-in) — it won't run in Expo Go.

---

## Trade-off vs. self-hosted
- **Keep self-hosted** (current): zero extra vendor, works today, but polling
  (no true real-time), and you maintain it.
- **Switch to Stream**: real-time + typing/read receipts out of the box, scales
  well, free at MVP volume — but another dependency and a dev-build requirement.

When your keys are set, tell me and I'll implement both sides and flip
`CHAT_PROVIDER` to `stream`.
