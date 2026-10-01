import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, session, setUnauthorizedHandler } from '../lib/api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [farmer, setFarmer] = useState(() => session.get()?.farmer ?? null);
  const [ready, setReady] = useState(!session.get());

  const clear = useCallback(() => { session.clear(); setFarmer(null); }, []);

  // validate a stored session on load
  useEffect(() => {
    setUnauthorizedHandler(clear);
    if (!session.get()) return;
    api('/api/auth/profile')
      .then(({ farmer: f }) => { setFarmer(f); const s = session.get(); if (s) session.set({ ...s, farmer: f }, s.remember); })
      .catch((e) => { if (e.status === 401) clear(); })
      .finally(() => setReady(true));
  }, [clear]);

  const login = useCallback(async (identifier, password, remember) => {
    const r = await api('/api/auth/login', { method: 'POST', body: { identifier, password, remember } });
    session.set({ token: r.token, farmer: r.farmer, remember }, remember);
    setFarmer(r.farmer);
    return r;
  }, []);

  const register = useCallback(async (payload) => {
    const r = await api('/api/auth/register', { method: 'POST', body: payload });
    session.set({ token: r.token, farmer: r.farmer, remember: true }, true);   // auto-login
    setFarmer(r.farmer);
    return r;
  }, []);

  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* token may already be invalid */ }
    clear();
  }, [clear]);

  const updateFarmer = useCallback((f) => {
    setFarmer(f);
    const s = session.get();
    if (s) session.set({ ...s, farmer: f }, s.remember);
  }, []);

  const value = useMemo(() => ({ farmer, ready, login, register, logout, updateFarmer }), [farmer, ready, login, register, logout, updateFarmer]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
