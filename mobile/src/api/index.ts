import { api } from './client';
import { API_BASE } from '../config';
import { tokenStore } from '../auth/storage';
import { ApiError } from './client';
import {
  SessionResponse, Me, Profile, DiscoveryResponse, Match, SwipeResult, Intent,
} from '../types';

/** Multipart upload of a local image URI (React Native FormData file shape). */
async function uploadPhoto(localUri: string): Promise<UploadedPhoto> {
  const access = await tokenStore.getAccess();
  const form = new FormData();
  const name = localUri.split('/').pop() || 'photo.jpg';
  // RN's FormData accepts { uri, name, type }; types don't model it, so cast.
  form.append('photo', { uri: localUri, name, type: 'image/jpeg' } as any);

  const res = await fetch(`${API_BASE}/me/photos/upload`, {
    method: 'POST',
    headers: access ? { authorization: `Bearer ${access}` } : undefined,
    body: form, // do NOT set content-type — fetch adds the multipart boundary
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = (data && data.error) || {};
    throw new ApiError(res.status, err.code || 'error', err.message || 'Upload failed');
  }
  return data as UploadedPhoto;
}

// ── Auth ────────────────────────────────────────────────────────────────
export const auth = {
  phoneStart: (phone: string) =>
    api<{ ok: true }>('/auth/phone/start', { method: 'POST', body: { phone }, auth: false }),
  phoneVerify: (phone: string, code: string) =>
    api<SessionResponse>('/auth/phone/verify', { method: 'POST', body: { phone, code }, auth: false }),
  google: (id_token: string) =>
    api<SessionResponse>('/auth/google', { method: 'POST', body: { id_token }, auth: false }),
  apple: (identity_token: string, full_name?: string) =>
    api<SessionResponse>('/auth/apple', { method: 'POST', body: { identity_token, full_name }, auth: false }),
  logout: (refresh_token?: string, everywhere?: boolean) =>
    api<{ ok: true }>('/auth/logout', { method: 'POST', body: { refresh_token, everywhere }, auth: true }),
};

// ── Profile ─────────────────────────────────────────────────────────────
export interface ProfileInput {
  display_name?: string;
  birth_date?: string;
  gender?: string;
  intent?: Intent;
  bio?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

export interface UploadedPhoto {
  id: string;
  url: string;
  position: number;
  moderation_status: 'pending' | 'approved' | 'rejected';
}

export const me = {
  get: () => api<Me>('/me'),
  updateProfile: (input: ProfileInput) => api<Me>('/me/profile', { method: 'PATCH', body: input }),
  addPhoto: (url: string, position?: number) =>
    api('/me/photos', { method: 'POST', body: { url, position } }),
  /** Upload a local image file (JPG) as multipart/form-data. */
  uploadPhoto: (localUri: string) => uploadPhoto(localUri),
  deletePhoto: (id: string) => api(`/me/photos/${id}`, { method: 'DELETE' }),
  verify: () => api<{ status: string }>('/me/verify', { method: 'POST' }),
};

// ── Discovery ───────────────────────────────────────────────────────────
export const discovery = {
  deck: (params: { radius_km?: number; min_age?: number; max_age?: number; intent?: Intent; cursor_km?: number } = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.append(k, String(v)));
    const qs = q.toString();
    return api<DiscoveryResponse>(`/discovery${qs ? `?${qs}` : ''}`);
  },
};

// ── Swipes & matches ────────────────────────────────────────────────────
export const swipes = {
  send: (swipee_id: string, direction: 'like' | 'pass') =>
    api<SwipeResult>('/swipes', { method: 'POST', body: { swipee_id, direction } }),
  matches: () => api<{ matches: Match[] }>('/matches'),
  unmatch: (id: string) => api(`/matches/${id}/unmatch`, { method: 'POST' }),
};

// ── Chat ────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export const chat = {
  token: () => api<{ user_id: string; chat_token: string; provider: string }>('/chat/token', { method: 'POST' }),
  list: (matchId: string, after?: string) => {
    const qs = after ? `?after=${encodeURIComponent(after)}` : '';
    return api<{ messages: ChatMessage[] }>(`/matches/${matchId}/messages${qs}`);
  },
  send: (matchId: string, body: string) =>
    api<ChatMessage>(`/matches/${matchId}/messages`, { method: 'POST', body: { body } }),
};

// ── Safety ──────────────────────────────────────────────────────────────
export const safety = {
  block: (blocked_id: string) => api('/blocks', { method: 'POST', body: { blocked_id } }),
  report: (reported_id: string, reason: string, detail?: string) =>
    api('/reports', { method: 'POST', body: { reported_id, reason, detail } }),
};

// ── Devices ─────────────────────────────────────────────────────────────
export const devices = {
  register: (fcm_token: string, platform: 'ios' | 'android') =>
    api('/devices', { method: 'POST', body: { fcm_token, platform } }),
};

export type { Profile };
