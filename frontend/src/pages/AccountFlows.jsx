import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, KeyRound, CircleCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { Alert, Button, Input, PasswordInput, Spinner } from '../components/ui.jsx';
import { AuthLayout } from './Login.jsx';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, msg: null, err: null, dev: null });
  async function submit(e) {
    e.preventDefault();
    setState({ busy: true });
    try {
      const r = await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setState({ msg: r.message, dev: r.devResetToken });
    } catch (ex) { setState({ err: ex.message }); }
  }
  return (
    <AuthLayout>
      <form className="auth-card stack" onSubmit={submit}>
        <div><h1>Reset password</h1><p className="muted">Enter your registered e-mail and we’ll send a reset link.</p></div>
        {state.msg && <Alert tone="success" title="Check your e-mail">{state.msg}</Alert>}
        {state.dev && <Alert tone="info" title="Development mode">E-mail isn’t configured, so here is your link: <Link to={`/reset-password?token=${state.dev}`}>reset password</Link></Alert>}
        {state.err && <Alert tone="danger">{state.err}</Alert>}
        <Input label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <Button variant="primary" size="lg" block type="submit" loading={state.busy} icon={Mail}>Send reset link</Button>
        <p style={{ textAlign: 'center' }}><Link to="/login">Back to log in</Link></p>
      </form>
    </AuthLayout>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [pw, setPw] = useState({ a: '', b: '' });
  const [state, setState] = useState({});
  async function submit(e) {
    e.preventDefault();
    if (pw.a !== pw.b) return setState({ err: 'Passwords do not match' });
    setState({ busy: true });
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token: params.get('token'), password: pw.a } });
      setState({ ok: true });
      setTimeout(() => nav('/login'), 1800);
    } catch (ex) { setState({ err: ex.message }); }
  }
  return (
    <AuthLayout>
      <form className="auth-card stack" onSubmit={submit}>
        <div><h1>Choose a new password</h1><p className="muted">At least 8 characters with letters and numbers.</p></div>
        {state.ok && <Alert tone="success" title="Password changed">Taking you to log in…</Alert>}
        {state.err && <Alert tone="danger">{state.err}</Alert>}
        <PasswordInput label="New password" required autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
        <PasswordInput label="Confirm new password" required autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
        <Button variant="primary" size="lg" block type="submit" loading={state.busy} icon={KeyRound} disabled={!params.get('token')}>Save password</Button>
      </form>
    </AuthLayout>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    api('/api/auth/verify-email', { method: 'POST', body: { token: params.get('token') } })
      .then((r) => setState({ ok: r.message }))
      .catch((e) => setState({ err: e.message }));
  }, [params]);
  return (
    <AuthLayout>
      <div className="auth-card stack" style={{ textAlign: 'center', alignItems: 'center' }}>
        {state.loading && <Spinner label="Verifying your e-mail…" />}
        {state.ok && <><CircleCheck size={48} color="var(--success)" aria-hidden /><h1>E-mail verified</h1><Link className="btn btn-primary" to="/app">Continue</Link></>}
        {state.err && <><Alert tone="danger" title="Verification failed">{state.err}</Alert><Link to="/app/settings">Request a new link from Settings</Link></>}
      </div>
    </AuthLayout>
  );
}
