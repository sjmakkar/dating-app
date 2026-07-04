/**
 * Account-identity model — the one part that is painful to change later.
 *
 *   users (1) ───< (many) auth_identities
 *
 * Linking rule (from the spec):
 *   On any sign-in, look up auth_identities by (provider, identifier).
 *     - found                       → log in as the linked user.
 *     - not found, user is signed in and explicitly linking
 *                                   → attach a new auth_identities row to them.
 *     - otherwise                   → create users + first auth_identities together,
 *                                     in ONE transaction.
 *
 * We NEVER auto-merge two pre-existing accounts just because emails match.
 */
import { PoolClient } from 'pg';
import { query, withTransaction } from '../db';
import { ApiError } from '../errors';
import { VerifiedIdentity } from '../providers/verify';

type Provider = 'phone' | 'google' | 'apple';

export interface ResolveResult {
  userId: string;
  isNew: boolean;
  hasProfile: boolean;
}

async function findIdentity(client: PoolClient, provider: Provider, identifier: string) {
  const { rows } = await client.query<{ user_id: string }>(
    `SELECT user_id FROM auth_identities WHERE provider = $1 AND identifier = $2`,
    [provider, identifier],
  );
  return rows[0]?.user_id ?? null;
}

async function userHasProfile(client: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await client.query(`SELECT 1 FROM profiles WHERE user_id = $1`, [userId]);
  return rows.length > 0;
}

/**
 * Find-or-create for a fresh sign-in (no current session).
 * Creates the user + first identity atomically when new.
 */
export async function findOrCreate(provider: Provider, vi: VerifiedIdentity): Promise<ResolveResult> {
  return withTransaction(async (client) => {
    const existing = await findIdentity(client, provider, vi.identifier);
    if (existing) {
      const hasProfile = await userHasProfile(client, existing);
      return { userId: existing, isNew: false, hasProfile };
    }

    // Create canonical user + first identity together.
    const { rows: userRows } = await client.query<{ id: string }>(
      `INSERT INTO users DEFAULT VALUES RETURNING id`,
    );
    const userId = userRows[0].id;
    await client.query(
      `INSERT INTO auth_identities (user_id, provider, identifier, email)
       VALUES ($1, $2, $3, $4)`,
      [userId, provider, vi.identifier, vi.email ?? null],
    );
    return { userId, isNew: true, hasProfile: false };
  });
}

/**
 * Link a new provider to the CURRENTLY authenticated user.
 * Only ever called for an already-signed-in user (explicit linking).
 */
export async function linkIdentity(
  currentUserId: string,
  provider: Provider,
  vi: VerifiedIdentity,
): Promise<void> {
  await withTransaction(async (client) => {
    const owner = await findIdentity(client, provider, vi.identifier);
    if (owner && owner !== currentUserId) {
      // This sign-in method already belongs to a different account — never merge.
      throw ApiError.conflict('This sign-in method is already linked to another account', 'identity_taken');
    }
    if (owner === currentUserId) return; // already linked, idempotent
    await client.query(
      `INSERT INTO auth_identities (user_id, provider, identifier, email)
       VALUES ($1, $2, $3, $4)`,
      [currentUserId, provider, vi.identifier, vi.email ?? null],
    );
  });
}

/** List the providers linked to a user (for the account screen). */
export async function listIdentities(userId: string) {
  const { rows } = await query<{ provider: string; identifier: string; email: string | null; created_at: Date }>(
    `SELECT provider, identifier, email, created_at FROM auth_identities WHERE user_id = $1 ORDER BY created_at`,
    [userId],
  );
  return rows;
}
