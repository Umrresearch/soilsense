import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Button, Input, PasswordInput } from '../components/ui.jsx';
import { Logo } from '../components/AppShell.jsx';

export function AuthLayout({ children, quote = '“The best fertilizer is the farmer’s footsteps.” Now your sensors can walk the field with you.' }) {
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Logo />
        <blockquote>{quote}</blockquote>
        <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Sensor-driven sugarcane advisory</span>
      </aside>
      <main className="auth-main">{children}</main>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '', remember: true });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(form.identifier.trim(), form.password, form.remember);
      nav(loc.state?.from || '/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card stack" onSubmit={submit} noValidate>
        <div className="mobile-only" style={{ marginBottom: 'var(--sp-2)' }}><Logo /></div>
        <div>
          <h1>Welcome back</h1>
          <p className="muted">Log in with your e-mail, mobile number or Farmer ID.</p>
        </div>
        {error && <Alert tone="danger" title="Couldn’t log in">{error}</Alert>}
        <Input label="E-mail, mobile or Farmer ID" autoComplete="username" required value={form.identifier} onChange={set('identifier')}
          placeholder="you@example.com · 98xxxxxxxx · FRM-0001" />
        <PasswordInput autoComplete="current-password" required value={form.password} onChange={set('password')} />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <label className="check"><input type="checkbox" checked={form.remember} onChange={set('remember')} /> Remember me for 30 days</label>
          <Link to="/forgot-password" style={{ fontSize: 'var(--fs-sm)' }}>Forgot password?</Link>
        </div>
        <Button variant="primary" size="lg" block type="submit" loading={busy} icon={LogIn} disabled={!form.identifier || !form.password}>Log in</Button>
        <p className="muted" style={{ textAlign: 'center', fontSize: 'var(--fs-sm)' }}>
          New here? <Link to="/signup">Create an account</Link>
        </p>
        <Alert tone="info" title="Demo account">
          <span className="num">demo@soilsense.in</span> · password <span className="num">Demo@1234</span>
        </Alert>
      </form>
    </AuthLayout>
  );
}
