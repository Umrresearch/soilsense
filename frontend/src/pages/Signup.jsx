import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { UserPlus, CircleCheck, ArrowRight, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Button, Input, PasswordInput, Select } from '../components/ui.jsx';
import { Logo } from '../components/AppShell.jsx';
import { AuthLayout } from './Login.jsx';

const STATES = ['Uttarakhand', 'Uttar Pradesh', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Bihar', 'Punjab', 'Haryana', 'Gujarat', 'Andhra Pradesh', 'Telangana', 'Madhya Pradesh', 'Other'];

function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Enter your full name';
  if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid e-mail address';
  if (!/^[6-9]\d{9}$/.test(f.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''))) e.phone = 'Enter a 10-digit mobile number';
  if (f.village.trim().length < 2) e.village = 'Required';
  if (f.district.trim().length < 2) e.district = 'Required';
  if (f.password.length < 8) e.password = 'At least 8 characters';
  else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'Use letters and numbers';
  if (f.confirmPassword !== f.password) e.confirmPassword = 'Passwords do not match';
  if (!f.acceptTerms) e.acceptTerms = 'Please accept the terms';
  return e;
}

function strength(p) {
  let s = 0;
  if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++;
  return [{ l: 'Too weak', c: 'var(--danger)' }, { l: 'Weak', c: 'var(--danger)' }, { l: 'Fair', c: 'var(--warning)' }, { l: 'Good', c: 'var(--warning)' }, { l: 'Strong', c: 'var(--success)' }, { l: 'Very strong', c: 'var(--success)' }][s];
}

export default function Signup() {
  const { register, farmer } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', village: '', district: '', state: 'Uttarakhand', password: '', confirmPassword: '', acceptTerms: false });
  const [touched, setTouched] = useState({});
  const [serverErr, setServerErr] = useState(null);
  const [fieldErrs, setFieldErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [registering, setRegistering] = useState(false);
  const errors = useMemo(() => validate(f), [f]);
  const st = strength(f.password);

  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })); setFieldErrs((x) => ({ ...x, [k]: undefined })); };
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));
  const err = (k) => fieldErrs[k] || (touched[k] ? errors[k] : undefined);

  async function submit(e) {
    e.preventDefault();
    setTouched(Object.fromEntries(Object.keys(f).map((k) => [k, true])));
    if (Object.keys(errors).length) return;
    setBusy(true); setServerErr(null);
    setRegistering(true);
    try {
      const r = await register({ ...f, phone: f.phone.replace(/\D/g, '') });
      setDone(r);
    } catch (ex) {
      setRegistering(false);
      setServerErr(ex.message);
      setFieldErrs(ex.fieldErrors ?? {});
    } finally { setBusy(false); }
  }

  if (farmer && !done && !registering) return <Navigate to="/app" replace />;

  if (done) {
    return (
      <AuthLayout quote="Welcome to the field. Add your first plot and its sensors to start receiving advice.">
        <div className="auth-card stack" style={{ textAlign: 'center', alignItems: 'center' }}>
          <CircleCheck size={56} color="var(--success)" aria-hidden />
          <h1>Registration successful</h1>
          <p className="secondary">Your account is ready and you are logged in. Keep your Farmer ID — you can log in with it.</p>
          <div className="card" style={{ width: '100%', background: 'var(--surface-2)' }}>
            <div className="stat-label" style={{ justifyContent: 'center' }}>Your Farmer ID</div>
            <div className="stat-value" style={{ fontSize: '2.5rem', color: 'var(--emerald-700)', margin: '6px 0' }}>{done.farmer.farmer_id}</div>
            <Button size="sm" variant="ghost" icon={Copy} onClick={() => navigator.clipboard?.writeText(done.farmer.farmer_id)}>Copy</Button>
          </div>
          <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>We sent a verification link to <b>{done.farmer.email}</b> (optional).</p>
          <Button variant="primary" size="lg" block icon={ArrowRight} onClick={() => nav('/app/settings?tab=fields', { replace: true })}>Add my first field</Button>
          <Button variant="ghost" block onClick={() => nav('/app', { replace: true })}>Go to dashboard</Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout quote="Register once, get a Farmer ID, and start getting advice for every field you own or lease.">
      <form className="auth-card wide stack" onSubmit={submit} noValidate>
        <div className="mobile-only"><Logo /></div>
        <div>
          <h1>Create your account</h1>
          <p className="muted">Free for farmers. Fields marked * are required.</p>
        </div>
        {serverErr && <Alert tone="danger" title="Couldn’t register">{serverErr}</Alert>}
        <div className="form-grid">
          <Input className="span-2" label="Full name" required autoComplete="name" value={f.name} onChange={set('name')} onBlur={blur('name')} error={err('name')} />
          <Input label="E-mail" type="email" required autoComplete="email" value={f.email} onChange={set('email')} onBlur={blur('email')} error={err('email')} />
          <Input label="Mobile number" type="tel" inputMode="numeric" required autoComplete="tel" placeholder="98xxxxxxxx" value={f.phone} onChange={set('phone')} onBlur={blur('phone')} error={err('phone')} />
          <Input label="Village" required value={f.village} onChange={set('village')} onBlur={blur('village')} error={err('village')} />
          <Input label="District" required value={f.district} onChange={set('district')} onBlur={blur('district')} error={err('district')} />
          <Select className="span-2" label="State" required value={f.state} onChange={set('state')} options={STATES} />
          <div className="form-field">
            <PasswordInput label="Password" required autoComplete="new-password" value={f.password} onChange={set('password')} onBlur={blur('password')}
              error={err('password')} hint="Min 8 characters, letters and numbers" />
            {f.password && (
              <div aria-live="polite">
                <div className="meter"><span style={{ width: `${(['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'].indexOf(st.l) + 1) * 16.6}%`, background: st.c }} /></div>
                <span className="form-hint">Strength: {st.l}</span>
              </div>
            )}
          </div>
          <PasswordInput label="Confirm password" required autoComplete="new-password" value={f.confirmPassword} onChange={set('confirmPassword')} onBlur={blur('confirmPassword')} error={err('confirmPassword')} />
          <div className="span-2 form-field">
            <label className="check">
              <input type="checkbox" checked={f.acceptTerms} onChange={set('acceptTerms')} onBlur={blur('acceptTerms')} aria-invalid={Boolean(err('acceptTerms'))} />
              <span>I agree to the terms &amp; conditions and understand that recommendations are advisory — I remain responsible for decisions on my farm.</span>
            </label>
            {err('acceptTerms') && <span className="form-error">{err('acceptTerms')}</span>}
          </div>
        </div>
        <Button variant="primary" size="lg" block type="submit" loading={busy} icon={UserPlus}>Create account</Button>
        <p className="muted" style={{ textAlign: 'center', fontSize: 'var(--fs-sm)' }}>Already registered? <Link to="/login">Log in</Link></p>
      </form>
    </AuthLayout>
  );
}
