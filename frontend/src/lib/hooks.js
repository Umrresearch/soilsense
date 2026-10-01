import { useCallback, useEffect, useRef, useState } from 'react';
import { api, API_URL, session } from './api.js';

/**
 * useApi('/api/x', deps) → { data, error, loading, reload, setData }
 * Pass null as path to skip the request.
 */
export function useApi(path, { pollMs } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const ctrl = useRef(null);

  const load = useCallback(async (quiet = false) => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path, { signal: c.signal });
      setState({ data, error: null, loading: false });
    } catch (e) {
      if (e.name !== 'AbortError') setState((s) => ({ ...s, error: e, loading: false }));
    }
  }, [path]);

  useEffect(() => {
    load();
    return () => ctrl.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!pollMs || !path) return undefined;
    const id = setInterval(() => document.visibilityState === 'visible' && load(true), pollMs);
    return () => clearInterval(id);
  }, [pollMs, path, load]);

  return { ...state, reload: load, setData: (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })) };
}

/**
 * Real-time updates via Server-Sent Events, with automatic reconnect.
 * `onEvent(type, data)` is called for `reading` and `recommendations` events.
 * Returns `connected` so the UI can show a live indicator (pages also poll as a fallback).
 */
export function useLiveStream(onEvent) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const token = session.get()?.token;
    if (!token || typeof EventSource === 'undefined') return undefined;
    let es; let retry; let closed = false; let delay = 2000;
    const open = () => {
      es = new EventSource(`${API_URL}/api/stream?token=${encodeURIComponent(token)}`);
      es.addEventListener('hello', () => { setConnected(true); delay = 2000; });
      for (const t of ['reading', 'recommendations']) {
        es.addEventListener(t, (e) => { try { handler.current?.(t, JSON.parse(e.data)); } catch { /* ignore */ } });
      }
      es.onerror = () => {
        setConnected(false);
        es.close();
        if (!closed) retry = setTimeout(open, (delay = Math.min(delay * 2, 30000)));
      };
    };
    open();
    return () => { closed = true; clearTimeout(retry); es?.close(); };
  }, []);

  return connected;
}

export function useMediaQuery(q) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = () => setM(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [q]);
  return m;
}
