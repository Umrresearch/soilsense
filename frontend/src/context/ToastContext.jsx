import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react';

const ToastCtx = createContext(null);
const ICON = { success: CircleCheck, error: CircleAlert, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((type, message, ms = 4500) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, type, message }]);
    setTimeout(() => dismiss(id), ms);
  }, [dismiss]);
  const toast = useMemo(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m instanceof Error ? m.message : m, 7000),
    info: (m) => push('info', m),
  }), [push]);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => {
          const Icon = ICON[t.type];
          return (
            <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
              <Icon aria-hidden />
              <div style={{ flex: 1 }}>{t.message}</div>
              <button className="btn btn-ghost btn-sm icon-btn" style={{ minHeight: 28, minWidth: 28 }} onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
