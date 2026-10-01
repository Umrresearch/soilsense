// Thin fetch wrapper around the Express API.
// In dev VITE_API_URL is empty and Vite proxies /api → http://localhost:4000.
const rawApi = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
// a bare hostname (as injected by the Render blueprint) is treated as https://host
export const API_URL = rawApi && !/^https?:\/\//.test(rawApi) ? `https://${rawApi}` : rawApi;

const KEY = 'sfa_session';

// Browser storage can throw (private mode, blocked cookies) — never let that break the app.
function safe(fn, fallback = null) { try { return fn(); } catch { return fallback; } }

export const session = {
  get() {
    const raw = safe(() => localStorage.getItem(KEY)) ?? safe(() => sessionStorage.getItem(KEY));
    return raw ? safe(() => JSON.parse(raw)) : null;
  },
  set(data, remember) {
    this.clear();
    const store = remember ? 'localStorage' : 'sessionStorage';
    safe(() => window[store].setItem(KEY, JSON.stringify(data)));
  },
  clear() {
    safe(() => localStorage.removeItem(KEY));
    safe(() => sessionStorage.removeItem(KEY));
  },
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
  /** { fieldName: message } for form validation errors */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body, raw = false, signal } = {}) {
  const token = session.get()?.token;
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    // free-tier backends sleep; the first request can take ~30-60 s
    throw new ApiError(0, { error: { code: 'NETWORK', message: 'Cannot reach the server. It may be waking up — try again in a few seconds.' } });
  }
  if (res.status === 401 && token) onUnauthorized();
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
    return res;
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Download a file endpoint (CSV/PDF) with the auth header and save it. */
export async function download(path, fallbackName) {
  const res = await api(path, { raw: true });
  const cd = res.headers.get('content-disposition') || '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
