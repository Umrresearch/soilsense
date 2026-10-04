import { Suspense, useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Lightbulb, Settings, LogOut, Menu, Sprout, PanelLeftClose, PanelLeftOpen, Bell,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi, useLiveStream } from '../lib/hooks.js';
import { initials } from '../lib/format.js';
import { ErrorBoundary, Spinner } from './ui.jsx';

export const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/recommendations', label: 'Advice', longLabel: 'Recommendations', icon: Lightbulb, badge: true },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];
const TITLES = { '/app': 'Dashboard', '/app/recommendations': 'Recommendations', '/app/settings': 'Settings' };

export const Logo = ({ sub = 'Sugarcane advisory' }) => (
  <Link to="/" className="brand" aria-label="SoilSense home">
    <span className="brand-mark"><Sprout aria-hidden /></span>
    <span className="brand-name">SoilSense<small>{sub}</small></span>
  </Link>
);

export default function AppShell() {
  const { farmer, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('sfa_collapsed') === '1'; } catch { return false; } });
  const [drawer, setDrawer] = useState(false);
  const alerts = useApi(farmer ? `/api/dashboard/${farmer.farmer_id}/alerts` : null, { pollMs: 60000 });
  const live = useLiveStream((type) => { if (type === 'recommendations') alerts.reload(true); });
  const urgent = alerts.data?.alerts?.filter((a) => a.priority === 'CRITICAL' || a.priority === 'HIGH').length ?? 0;

  useEffect(() => setDrawer(false), [loc.pathname]);
  useEffect(() => { try { localStorage.setItem('sfa_collapsed', collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);

  const doLogout = async () => { await logout(); nav('/login'); };

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''} ${drawer ? 'drawer-open' : ''}`}>
      {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} aria-hidden />}
      <aside className="sidebar" aria-label="Main navigation">
        <Logo />
        <nav className="stack" style={{ gap: 4 }}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link" title={n.longLabel ?? n.label}>
              <n.icon aria-hidden /><span className="nav-text">{n.longLabel ?? n.label}</span>
              {n.badge && urgent > 0 && <span className="nav-count" aria-label={`${urgent} urgent`}>{urgent}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="nav-link btn-ghost collapse-toggle" style={{ border: 0, background: 'none', cursor: 'pointer' }}
            onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}<span className="nav-text">Collapse</span>
          </button>
          <button className="nav-link" style={{ border: 0, background: 'none', cursor: 'pointer', width: '100%' }} onClick={doLogout} title="Log out">
            <LogOut aria-hidden /><span className="nav-text">Log out</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost icon-btn mobile-only" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu /></button>
          <h1>{TITLES[loc.pathname] ?? 'SoilSense'}</h1>
          <div className="spacer" />
          <span className={`live-dot ${live ? 'on' : ''}`} title={live ? 'Receiving live sensor updates' : 'Live updates paused — refreshing every minute'}>
            <i aria-hidden /><span className="desktop-only">{live ? 'Live' : 'Polling'}</span>
          </span>
          <Link to="/app/recommendations" className="btn btn-ghost icon-btn" aria-label={`${urgent} urgent alerts`} style={{ position: 'relative' }}>
            <Bell />
            {urgent > 0 && <span style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, background: 'var(--danger)' }} />}
          </Link>
          <Link to="/app/settings" className="row" style={{ gap: 10, textDecoration: 'none', color: 'inherit' }} aria-label="Profile and settings">
            <span className="avatar">{initials(farmer?.name)}</span>
            <span className="desktop-only" style={{ lineHeight: 1.2 }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', display: 'block' }}>{farmer?.name}</span>
              <span className="muted num" style={{ fontSize: 'var(--fs-xs)' }}>{farmer?.farmer_id}</span>
            </span>
          </Link>
        </header>
        <main className="content" id="main">
          <ErrorBoundary key={loc.pathname}><Suspense fallback={<Spinner />}><Outlet /></Suspense></ErrorBoundary>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Quick navigation">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <n.icon aria-hidden />{n.label}
            {n.badge && urgent > 0 && <span className="dot" aria-hidden />}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
