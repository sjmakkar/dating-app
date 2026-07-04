import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

/**
 * Object storage for profile photos (Supabase Storage, CDN-served).
 * Industry-standard approach: upload the file to a bucket and store only the
 * public CDN URL in the DB. Uses the SERVICE ROLE key server-side (never shipped
 * to the app). If unconfigured, uploadImage returns null and the caller falls
 * back to local disk (dev only).
 */
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!config.supabase.url || !config.supabase.serviceKey) return null;
  if (!client) {
    client = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const isStorageConfigured = () => !!getClient();

/** Upload an image buffer; returns the public CDN URL, or null if not configured. */
export async function uploadImage(buffer: Buffer, contentType: string): Promise<string | null> {
  const c = getClient();
  if (!c) return null;
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const objectPath = `${crypto.randomUUID()}.${ext}`;
  const { error } = await c.storage
    .from(config.supabase.bucket)
    .upload(objectPath, buffer, { contentType, upsert: false, cacheControl: '3600' });
  if (error) throw error;
  const { data } = c.storage.from(config.supabase.bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}
