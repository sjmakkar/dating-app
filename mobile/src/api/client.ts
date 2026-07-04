import { API_BASE } from '../config';
import { tokenStore } from '../auth/storage';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;       // attach bearer token (default true)
  _retried?: boolean;   // internal: prevent infinite refresh loop
}

let onAuthLost: (() => void) | null = null;
/** Registered by AuthContext so a failed refresh can force logout. */
export function setAuthLostHandler(fn: () => void) {
  onAuthLost = fn;
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = await tokenStore.getRefresh();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    await tokenStore.save(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function api<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, _retried = false } = opts;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) {
    const access = await tokenStore.getAccess();
    if (access) headers.authorization = `Bearer ${access}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Transparent one-shot refresh on 401.
  if (res.status === 401 && auth && !_retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return api<T>(path, { ...opts, _retried: true });
    onAuthLost?.();
  }

  const text = await res.text();
  const data = text ? safeJson(text) : {};

  if (!res.ok) {
    const err = (data && data.error) || {};
    throw new ApiError(res.status, err.code || 'error', err.message || `Request failed (${res.status})`);
  }
  return data as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
