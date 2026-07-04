/**
 * End-to-end smoke test of the Phase 1 happy path against a RUNNING server
 * (default http://localhost:4000) with a migrated DB. No external accounts
 * needed — providers run in DEV/stub mode.
 *
 *   1. Start DB + server, then:  npx ts-node scripts/smoke.ts
 *
 * Exercises: phone find-or-create (x2 users), profiles with location,
 * discovery, mutual like → match + chat channel, chat token, block.
 */
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4000';
const OTP = process.env.OTP_DEV_CODE ?? '000000';

async function call(method: string, pathname: string, body?: any, token?: string) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${text}`);
  return json;
}

function assert(cond: any, msg: string) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
  console.log('  ✓ ' + msg);
}

async function signUpPhone(phone: string) {
  await call('POST', '/v1/auth/phone/start', { phone });
  const s = await call('POST', '/v1/auth/phone/verify', { phone, code: OTP });
  return s;
}

async function main() {
  console.log('health');
  const h = await call('GET', '/health');
  assert(h.ok, 'server healthy');

  console.log('user A sign-up (phone, find-or-create)');
  const a = await signUpPhone('+919800000001');
  assert(a.user_id && a.accessToken, 'A got user_id + access token');
  assert(a.is_new === true && a.needs_onboarding === true, 'A is new and needs onboarding');

  console.log('re-auth same phone returns same user (no duplicate)');
  const a2 = await signUpPhone('+919800000001');
  assert(a2.user_id === a.user_id, 'same phone → same user');
  assert(a2.is_new === false, 'second sign-in not flagged new');

  console.log('user B sign-up');
  const b = await signUpPhone('+919800000002');
  assert(b.user_id !== a.user_id, 'B is a different user');

  // Profiles near each other (Bengaluru-ish coords).
  console.log('create profiles with location');
  await call('PATCH', '/v1/me/profile', {
    display_name: 'Aanya', birth_date: '1998-05-20', gender: 'female', intent: 'serious',
    bio: 'coffee + trails', city: 'Bengaluru', lat: 12.9716, lng: 77.5946,
  }, a.accessToken);
  await call('PATCH', '/v1/me/profile', {
    display_name: 'Rahul', birth_date: '1996-03-11', gender: 'male', intent: 'serious',
    bio: 'guitarist', city: 'Bengaluru', lat: 12.9352, lng: 77.6245,
  }, b.accessToken);
  assert(true, 'both profiles created');

  console.log('underage rejected');
  let underageRejected = false;
  try {
    await call('PATCH', '/v1/me/profile', { display_name: 'Kid', birth_date: '2015-01-01', gender: 'x' }, a.accessToken);
  } catch { underageRejected = true; }
  assert(underageRejected, '18+ enforced at write time');

  console.log('discovery from A sees B');
  const disc = await call('GET', '/v1/discovery?radius_km=50', undefined, a.accessToken);
  const seesB = disc.candidates.some((c: any) => c.user_id === b.user_id);
  assert(seesB, 'A discovers B within radius');
  const bcard = disc.candidates.find((c: any) => c.user_id === b.user_id);
  assert(bcard.distance_label && bcard.lat === undefined && bcard.location === undefined, 'only coarse distance, no raw coords');

  console.log('A likes B (no match yet)');
  const s1 = await call('POST', '/v1/swipes', { swipee_id: b.user_id, direction: 'like' }, a.accessToken);
  assert(s1.matched === false, 'one-sided like is not a match');

  console.log('B likes A → match + chat channel');
  const s2 = await call('POST', '/v1/swipes', { swipee_id: a.user_id, direction: 'like' }, b.accessToken);
  assert(s2.matched === true, 'mutual like creates a match');
  assert(s2.match.chat_channel_id, 'match has a chat channel id');

  console.log('both see the match');
  const am = await call('GET', '/v1/matches', undefined, a.accessToken);
  const bm = await call('GET', '/v1/matches', undefined, b.accessToken);
  assert(am.matches.length === 1 && bm.matches.length === 1, 'match visible to both sides');

  console.log('chat token mint');
  const tok = await call('POST', '/v1/chat/token', {}, a.accessToken);
  assert(tok.chat_token, 'A gets a chat token');

  console.log('discovery now excludes already-swiped B');
  const disc2 = await call('GET', '/v1/discovery?radius_km=50', undefined, a.accessToken);
  assert(!disc2.candidates.some((c: any) => c.user_id === b.user_id), 'swiped user removed from deck');

  console.log('block is absolute → unmatches');
  await call('POST', '/v1/blocks', { blocked_id: b.user_id }, a.accessToken);
  const am2 = await call('GET', '/v1/matches', undefined, a.accessToken);
  assert(am2.matches.length === 0, 'block removed the match for A');

  console.log('\nALL SMOKE CHECKS PASSED ✅');
}

main().catch((e) => {
  console.error('\nSMOKE FAILED ❌\n', e.message);
  process.exit(1);
});
