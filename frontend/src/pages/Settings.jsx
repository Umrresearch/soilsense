import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Save, RotateCcw, Plus, Trash2, Pencil, Download, FileText, KeyRound, MailCheck, Copy, Power } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../lib/hooks.js';
import { api, download } from '../lib/api.js';
import { fmtNum, fmtDate, timeAgo, SENSOR_META } from '../lib/format.js';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PasswordInput, Select, Spinner } from '../components/ui.jsx';

const TABS = [
  { id: 'profile', label: 'Profile' }, { id: 'thresholds', label: 'Thresholds' }, { id: 'fields', label: 'Fields' },
  { id: 'sensors', label: 'Sensors' }, { id: 'export', label: 'Data export' }, { id: 'security', label: 'Security' },
];

function Profile() {
  const { farmer, updateFarmer } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: farmer.name, email: farmer.email, phone: farmer.phone, village: farmer.village, district: farmer.district, state: farmer.state, age: farmer.age ?? '', gender: farmer.gender ?? '' });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({});
    try {
      const body = { ...f, age: f.age === '' ? null : Number(f.age), gender: f.gender || null };
      const r = await api(`/api/farmers/${farmer.farmer_id}`, { method: 'PUT', body });
      updateFarmer(r.farmer); toast.success('Profile saved');
    } catch (ex) { setErrs(ex.fieldErrors ?? {}); toast.error(ex); } finally { setBusy(false); }
  };
  return (
    <Card title="Profile" sub={`Farmer ID ${farmer.farmer_id} · member since ${fmtDate(farmer.created_at)}`}>
      <form className="form-grid" onSubmit={save}>
        <Input label="Full name" value={f.name} onChange={set('name')} error={errs.name} required />
        <Input label="Mobile" type="tel" value={f.phone} onChange={set('phone')} error={errs.phone} required />
        <Input className="span-2" label="E-mail" type="email" value={f.email} onChange={set('email')} error={errs.email} required
          hint={farmer.email_verified ? 'Verified' : 'Not verified — see Security tab'} />
        <Input label="Village" value={f.village} onChange={set('village')} error={errs.village} />
        <Input label="District" value={f.district} onChange={set('district')} error={errs.district} />
        <Input label="State" value={f.state} onChange={set('state')} error={errs.state} />
        <div className="form-grid" style={{ gap: 'var(--sp-3)' }}>
          <Input label="Age" type="number" min={16} max={110} value={f.age} onChange={set('age')} error={errs.age} />
          <Select label="Gender" value={f.gender} onChange={set('gender')} options={[{ value: '', label: '—' }, 'Male', 'Female', 'Other']} />
        </div>
        <div className="span-2"><Button variant="primary" type="submit" icon={Save} loading={busy}>Save profile</Button></div>
      </form>
    </Card>
  );
}

const T_GROUPS = [
  { title: 'Soil moisture (% volumetric)', note: 'Drives irrigation advice. Must stay in order: critical < low < target < high.', keys: [
    ['moisture_critical', 'Critical — irrigate immediately'], ['moisture_low', 'Low — irrigate today'], ['moisture_target', 'Target after irrigation'], ['moisture_high', 'High — waterlogging alert']] },
  { title: 'Weather', keys: [['temp_high', 'Heat stress above (°C)'], ['temp_low', 'Cold stress below (°C)'], ['humidity_high', 'Disease risk above (% RH)'], ['humidity_low', 'Very dry air below (% RH)']] },
  { title: 'Soil nutrients (kg/acre, from soil test)', keys: [['nitrogen_min', 'Nitrogen minimum'], ['phosphorus_min', 'Phosphorus minimum'], ['potassium_min', 'Potassium minimum']] },
  { title: 'Irrigation calculation', keys: [['root_zone_mm', 'Effective root-zone depth (mm)']] },
];

function Thresholds() {
  const toast = useToast();
  const t = useApi('/api/thresholds');
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (t.data) setV(t.data.thresholds); }, [t.data]);
  if (t.loading || !v) return <Spinner />;
  if (t.error) return <ErrorState error={t.error} onRetry={t.reload} />;
  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(T_GROUPS.flatMap((g) => g.keys.map(([k]) => [k, Number(v[k])])));
      const r = await api('/api/thresholds', { method: 'PUT', body });
      toast.success(`Saved — advice refreshed for ${r.reevaluatedFields} fields`);
      t.setData({ thresholds: r.thresholds });
    } catch (e) { toast.error(e.code === 'CONSTRAINT_VIOLATION' ? 'Values are out of order (e.g. low must be below target).' : e); } finally { setBusy(false); }
  };
  const reset = async () => {
    const r = await api('/api/thresholds/reset', { method: 'POST' });
    t.setData({ thresholds: r.thresholds }); toast.info('Thresholds reset to sugarcane defaults');
  };
  return (
    <div className="stack">
      <Alert tone="info" title="When do alerts trigger?">Defaults suit sugarcane on alluvial soils. Changing a value immediately re-checks every field.</Alert>
      <div className="grid grid-2">
        {T_GROUPS.map((g) => (
          <Card key={g.title} title={g.title} sub={g.note}>
            {g.keys.map(([k, label]) => (
              <div className="threshold-row" key={k}>
                <label htmlFor={`t-${k}`} style={{ fontSize: 'var(--fs-sm)' }}>{label}</label>
                <input id={`t-${k}`} className="input" type="number" inputMode="decimal" step="0.5" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
              </div>
            ))}
          </Card>
        ))}
      </div>
      <div className="row">
        <Button variant="primary" icon={Save} loading={busy} onClick={save}>Save thresholds</Button>
        <Button variant="ghost" icon={RotateCcw} onClick={reset}>Reset to defaults</Button>
        <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Last changed {timeAgo(v.updated_at)}</span>
      </div>
    </div>
  );
}

const EMPTY_FIELD = { fieldName: '', areaAcres: '', soilType: 'Alluvial', irrigationMethod: 'Flood', ownershipType: 'Owned', khasraNo: '', village: '', pumpFlowLph: '' };

function Fields() {
  const { farmer } = useAuth();
  const toast = useToast();
  const fields = useApi(`/api/farmers/${farmer.farmer_id}/fields`);
  const [edit, setEdit] = useState(null);       // null | {mode:'new'|'edit', data}
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});

  const open = (f) => {
    setErrs({});
    setEdit(f ? { mode: 'edit', id: f.field_id, data: { fieldName: f.field_name, areaAcres: f.area_acres, soilType: f.soil_type, irrigationMethod: f.irrigation_method,
      ownershipType: f.ownership_type, khasraNo: f.khasra_no ?? '', village: f.village ?? '', pumpFlowLph: f.pump_flow_lph } } : { mode: 'new', data: { ...EMPTY_FIELD, village: farmer.village } });
  };
  const save = async () => {
    setBusy(true); setErrs({});
    const d = Object.fromEntries(Object.entries(edit.data).filter(([, x]) => x !== '' && x != null));
    try {
      if (edit.mode === 'new') {
        const r = await api('/api/fields', { method: 'POST', body: d });
        toast.success(`${r.field.field_name} added with ${r.sensors.length} sensors (${r.field.field_id})`);
      } else {
        await api(`/api/fields/${edit.id}`, { method: 'PUT', body: d });
        toast.success('Field updated');
      }
      setEdit(null); fields.reload();
    } catch (e) { setErrs(e.fieldErrors ?? {}); toast.error(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/api/fields/${del.field_id}`, { method: 'DELETE' }); toast.info(`${del.field_name} deleted`); setDel(null); fields.reload(); }
    catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setEdit({ ...edit, data: { ...edit.data, [k]: e.target.value } });

  return (
    <Card title="Fields" sub="Each new field gets soil-moisture, temperature and humidity sensors automatically" actions={<Button variant="primary" icon={Plus} onClick={() => open(null)}>Add field</Button>}>
      {fields.loading && !fields.data ? <Spinner /> : fields.error ? <ErrorState error={fields.error} onRetry={fields.reload} /> : fields.data.fields.length === 0 ? (
        <EmptyState title="No fields yet" action={<Button variant="primary" icon={Plus} onClick={() => open(null)}>Add your first field</Button>}>Add a plot to start getting advice.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Field</th><th className="num">Area (ac)</th><th>Soil</th><th>Irrigation</th><th>Ownership</th><th className="num">Pump (L/h)</th><th /></tr></thead>
            <tbody>{fields.data.fields.map((f) => (
              <tr key={f.field_id}>
                <td><b>{f.field_name}</b><div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{f.field_id}{f.khasra_no ? ` · Khasra ${f.khasra_no}` : ''}</div></td>
                <td className="num">{fmtNum(f.area_acres, 2)}</td><td>{f.soil_type}</td><td>{f.irrigation_method}</td><td>{f.ownership_type}</td>
                <td className="num">{fmtNum(f.pump_flow_lph, 0)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(f)} aria-label={`Edit ${f.field_name}`} />
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDel(f)} aria-label={`Delete ${f.field_name}`} />
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <Modal open={Boolean(edit)} title={edit?.mode === 'new' ? 'Add field' : 'Edit field'} onClose={() => setEdit(null)}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" icon={Save} loading={busy} onClick={save}>Save</Button></>}>
        {edit && (
          <div className="form-grid">
            <Input className="span-2" label="Field name" required value={edit.data.fieldName} onChange={set('fieldName')} error={errs.fieldName} placeholder="e.g. North Plot" />
            <Input label="Area (acres)" type="number" inputMode="decimal" step="0.01" min="0.01" required value={edit.data.areaAcres} onChange={set('areaAcres')} error={errs.areaAcres} />
            <Input label="Khasra no." type="number" inputMode="numeric" value={edit.data.khasraNo} onChange={set('khasraNo')} error={errs.khasraNo} />
            <Select label="Soil type" value={edit.data.soilType} onChange={set('soilType')} options={['Alluvial', 'Loamy', 'Clay', 'Sandy', 'Black', 'Red', 'Laterite']} />
            <Select label="Irrigation" value={edit.data.irrigationMethod} onChange={set('irrigationMethod')} options={['Flood', 'Drip', 'Sprinkler']} />
            <Select label="Ownership" value={edit.data.ownershipType} onChange={set('ownershipType')} options={['Owned', 'Leased']} />
            <Input label="Pump flow (litres/hour)" type="number" inputMode="numeric" value={edit.data.pumpFlowLph} onChange={set('pumpFlowLph')} hint="Used to convert water into pumping time" />
            <Input className="span-2" label="Village" value={edit.data.village} onChange={set('village')} />
          </div>
        )}
      </Modal>
      <Modal open={Boolean(del)} title="Delete field?" onClose={() => setDel(null)}
        footer={<><Button variant="ghost" onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" icon={Trash2} loading={busy} onClick={remove}>Delete permanently</Button></>}>
        <Alert tone="danger" title={del?.field_name}>This also deletes its sensors, all readings, recommendations and logs. Export your data first if you need it.</Alert>
      </Modal>
    </Card>
  );
}

function Sensors() {
  const { farmer } = useAuth();
  const toast = useToast();
  const fields = useApi(`/api/farmers/${farmer.farmer_id}/fields`);
  const [fieldId, setFieldId] = useState('');
  const fid = fieldId || fields.data?.fields?.[0]?.field_id;
  const sensors = useApi(fid ? `/api/fields/${fid}/sensors` : null);
  const [adding, setAdding] = useState(null);
  const [newKey, setNewKey] = useState(null);
  const [busy, setBusy] = useState(false);

  const toggle = async (s) => {
    try { await api(`/api/sensors/${s.sensor_id}`, { method: 'PUT', body: { isActive: !s.is_active } }); sensors.reload(); }
    catch (e) { toast.error(e); }
  };
  const remove = async (s) => {
    if (!window.confirm(`Delete ${s.sensor_id} and all its readings?`)) return;
    try { await api(`/api/sensors/${s.sensor_id}`, { method: 'DELETE' }); toast.info('Sensor deleted'); sensors.reload(); } catch (e) { toast.error(e); }
  };
  const add = async () => {
    setBusy(true);
    try {
      const r = await api('/api/sensors', { method: 'POST', body: { fieldId: fid, sensorType: adding.type, sensorLocation: adding.location || undefined, generateDeviceKey: true } });
      setAdding(null); setNewKey({ id: r.sensor.sensor_id, key: r.deviceKey }); sensors.reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  if (fields.loading && !fields.data) return <Spinner />;
  if (!fields.data?.fields?.length) return <Card><EmptyState title="Add a field first" /></Card>;
  return (
    <Card title="Sensors" sub="Register devices, pause faulty ones, or remove them" actions={<Button variant="primary" icon={Plus} onClick={() => setAdding({ type: 'SOIL_MOISTURE', location: '' })}>Add sensor</Button>}>
      <div style={{ maxWidth: 360, marginBottom: 'var(--sp-4)' }}>
        <Select label="Field" value={fid} onChange={(e) => setFieldId(e.target.value)} options={fields.data.fields.map((f) => ({ value: f.field_id, label: `${f.field_name} (${f.field_id})` }))} />
      </div>
      {sensors.loading && !sensors.data ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Sensor</th><th>Type</th><th>Location</th><th className="num">Last value</th><th>Health</th><th /></tr></thead>
            <tbody>{(sensors.data?.sensors ?? []).map((s) => (
              <tr key={s.sensor_id}>
                <td className="num">{s.sensor_id}</td><td>{SENSOR_META[s.sensor_type].label}</td><td>{s.sensor_location}</td>
                <td className="num">{s.last_reading == null ? '—' : `${fmtNum(s.last_reading)}${s.unit}`}<div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{timeAgo(s.last_reading_at)}</div></td>
                <td><Badge tone={{ ONLINE: 'success', STALE: 'warning', NO_DATA: 'danger' }[s.health]}>{s.health.replace('_', ' ').toLowerCase()}</Badge></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <Button size="sm" variant="ghost" icon={Power} onClick={() => toggle(s)}>{s.is_active ? 'Pause' : 'Resume'}</Button>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(s)} aria-label={`Delete ${s.sensor_id}`} />
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={Boolean(adding)} title="Add sensor" onClose={() => setAdding(null)}
        footer={<><Button variant="ghost" onClick={() => setAdding(null)}>Cancel</Button><Button variant="primary" icon={Plus} loading={busy} onClick={add}>Add</Button></>}>
        {adding && (
          <div className="stack">
            <Select label="Sensor type" value={adding.type} onChange={(e) => setAdding({ ...adding, type: e.target.value })}
              options={Object.entries(SENSOR_META).map(([value, m]) => ({ value, label: m.label }))} />
            <Input label="Location in field" placeholder="e.g. East corner, 30 cm deep" value={adding.location} onChange={(e) => setAdding({ ...adding, location: e.target.value })} />
          </div>
        )}
      </Modal>
      <Modal open={Boolean(newKey)} title="Sensor added" onClose={() => setNewKey(null)} footer={<Button variant="primary" onClick={() => setNewKey(null)}>Done</Button>}>
        <p className="secondary">Configure your gateway to post readings for <b className="num">{newKey?.id}</b> to <span className="num">POST /api/readings</span>. This device key is shown only once:</p>
        <div className="row" style={{ marginTop: 'var(--sp-3)' }}>
          <code className="num" style={{ wordBreak: 'break-all', background: 'var(--surface-2)', padding: 8, borderRadius: 8, flex: 1 }}>{newKey?.key}</code>
          <Button size="sm" icon={Copy} onClick={() => navigator.clipboard?.writeText(newKey.key)}>Copy</Button>
        </div>
      </Modal>
    </Card>
  );
}

function Export() {
  const { farmer } = useAuth();
  const toast = useToast();
  const fields = useApi(`/api/farmers/${farmer.farmer_id}/fields`);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [q, setQ] = useState({ fieldId: '', from: monthAgo, to: today });
  const [busy, setBusy] = useState(null);
  const run = async (what) => {
    setBusy(what);
    const p = new URLSearchParams();
    if (q.fieldId) p.set('fieldId', q.fieldId);
    if (q.from) p.set('from', new Date(q.from).toISOString());
    if (q.to) p.set('to', new Date(`${q.to}T23:59:59`).toISOString());
    try {
      if (what === 'readings') await download(`/api/export/readings.csv?${p}`, 'readings.csv');
      if (what === 'logs') await download(`/api/export/logs.csv?${p}`, 'logs.csv');
      if (what === 'pdf') await download('/api/export/report.pdf', 'report.pdf');
      if (what === 'email') { const r = await api('/api/export/email', { method: 'POST' }); toast.success(r.message); }
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  };
  return (
    <Card title="Data export" sub="Keep records for the sugar mill, bank or your own analysis">
      <div className="filters" style={{ marginBottom: 'var(--sp-5)' }}>
        <Select label="Field" value={q.fieldId} onChange={(e) => setQ({ ...q, fieldId: e.target.value })}
          options={[{ value: '', label: 'All fields' }, ...(fields.data?.fields ?? []).map((f) => ({ value: f.field_id, label: f.field_name }))]} />
        <Input label="From" type="date" value={q.from} max={q.to} onChange={(e) => setQ({ ...q, from: e.target.value })} />
        <Input label="To" type="date" value={q.to} max={today} onChange={(e) => setQ({ ...q, to: e.target.value })} />
      </div>
      <div className="grid grid-2">
        <Button icon={Download} loading={busy === 'readings'} onClick={() => run('readings')}>Sensor readings (CSV)</Button>
        <Button icon={Download} loading={busy === 'logs'} onClick={() => run('logs')}>Irrigation &amp; fertilizer logs (CSV)</Button>
        <Button icon={FileText} loading={busy === 'pdf'} onClick={() => run('pdf')}>Farm report (PDF)</Button>
        <Button icon={MailCheck} loading={busy === 'email'} onClick={() => run('email')}>E-mail me the report</Button>
      </div>
    </Card>
  );
}

function Security() {
  const { farmer, logout } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const change = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api('/api/auth/password', { method: 'PUT', body: pw }); toast.success('Password changed'); setPw({ currentPassword: '', newPassword: '' }); }
    catch (ex) { toast.error(ex); } finally { setBusy(false); }
  };
  const verify = async () => {
    try { const r = await api('/api/auth/verify-email', { method: 'POST', body: { resend: true } }); toast.success(r.message); }
    catch (e) { toast.error(e); }
  };
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <Card title="Change password">
        <form className="stack" onSubmit={change}>
          <PasswordInput label="Current password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          <PasswordInput label="New password" autoComplete="new-password" hint="Min 8 characters, letters and numbers" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          <Button variant="primary" type="submit" icon={KeyRound} loading={busy}>Update password</Button>
        </form>
      </Card>
      <Card title="Account">
        <div className="stack">
          <div className="row">E-mail {farmer.email_verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}</div>
          {!farmer.email_verified && <Button icon={MailCheck} onClick={verify}>Send verification e-mail</Button>}
          <Button variant="danger" onClick={logout}>Log out of this device</Button>
        </div>
      </Card>
    </div>
  );
}

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'profile';
  const View = { profile: Profile, thresholds: Thresholds, fields: Fields, sensors: Sensors, export: Export, security: Security }[tab] ?? Profile;
  return (
    <>
      <nav className="settings-nav" aria-label="Settings sections">
        <div className="segmented">
          {TABS.map((t) => <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setParams({ tab: t.id })}>{t.label}</button>)}
        </div>
      </nav>
      <View />
    </>
  );
}
