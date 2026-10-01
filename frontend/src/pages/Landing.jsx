import { Link } from 'react-router-dom';
import {
  Droplets, Thermometer, CloudRain, FlaskConical, Bell, ChartColumn, WifiOff, Smartphone, Download, ArrowRight, ShieldCheck, Lightbulb,
} from 'lucide-react';
import { Logo } from '../components/AppShell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const FEATURES = [
  { icon: Droplets, title: 'Real-time sensor data', text: 'Soil moisture, temperature and humidity from every field, updated live on your phone.' },
  { icon: Lightbulb, title: 'Clear irrigation advice', text: 'Know exactly when to water and how much — in litres and pumping hours, not jargon.' },
  { icon: FlaskConical, title: 'Fertilizer guidance', text: 'Urea, DAP and MOP doses based on your soil test, split into safe applications.' },
  { icon: WifiOff, title: 'Works with missing data', text: 'If a sensor drops out, advice says so and uses the last good reading — never silent guesses.' },
  { icon: ChartColumn, title: 'History & trends', text: 'Compare fields, track water use and see how your yield compares with the district.' },
  { icon: Download, title: 'Records you can keep', text: 'Export readings and logs to CSV or a one-page PDF for the sugar mill or your bank.' },
];

export default function Landing() {
  const { farmer } = useAuth();
  return (
    <>
      <nav className="public-nav">
        <Logo />
        <div className="public-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
        </div>
        <div className="spacer" />
        {farmer ? (
          <Link className="btn btn-primary" to="/app">Open dashboard</Link>
        ) : (
          <>
            <Link className="btn btn-ghost" to="/login">Log in</Link>
            <Link className="btn btn-primary" to="/signup">Sign up</Link>
          </>
        )}
      </nav>

      <header className="hero">
        <div className="hero-inner">
          <div>
            <span className="eyebrow"><Droplets size={14} aria-hidden /> For sugarcane farmers</span>
            <h1>Water and feed your cane <em>at the right time</em>.</h1>
            <p className="hero-lead">
              Field sensors measure soil moisture, temperature and humidity. Smart Farm turns those readings into
              simple, explained advice on irrigation and fertilizer — so you save water, money and effort.
            </p>
            <div className="row">
              <Link className="btn btn-primary btn-lg" to={farmer ? '/app' : '/signup'}>{farmer ? 'Go to dashboard' : 'Create free account'} <ArrowRight aria-hidden /></Link>
              {!farmer && <Link className="btn btn-lg" to="/login">I have an account</Link>}
            </div>
            <p className="muted" style={{ marginTop: 'var(--sp-4)', fontSize: 'var(--fs-sm)' }}>
              Try the demo: <span className="num">demo@smartfarm.in</span> / <span className="num">Demo@1234</span>
            </p>
          </div>

          <div className="hero-card" aria-label="Example recommendation">
            <div className="row" style={{ marginBottom: 'var(--sp-4)' }}>
              <span className="badge badge-warning"><Bell size={13} aria-hidden /> High</span>
              <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>North Plot · 2.5 acres</span>
            </div>
            <div className="rec">
              <div className="rec-icon irrigation"><Droplets aria-hidden /></div>
              <div>
                <div className="rec-action">Irrigate today: about 650 kL (13 h of pumping)</div>
                <div className="rec-why">Soil moisture is 18%, below your 22% threshold. It is also hot (36°C), so irrigate in the early morning or evening.</div>
              </div>
            </div>
            <div className="field-card-metrics">
              <div className="metric"><span className="metric-label"><Droplets aria-hidden /> Moisture</span><span className="metric-value" style={{ color: 'var(--warning)' }}>18%</span></div>
              <div className="metric"><span className="metric-label"><Thermometer aria-hidden /> Temp</span><span className="metric-value">36°</span></div>
              <div className="metric"><span className="metric-label"><CloudRain aria-hidden /> Humidity</span><span className="metric-value">58%</span></div>
            </div>
          </div>
        </div>
      </header>

      <section className="section" id="features">
        <div className="section-title">
          <h2>Everything you need in the field</h2>
          <p>Built for phones with weak signal. Big buttons, plain words, and advice that always explains why.</p>
        </div>
        <div className="grid grid-3">
          {FEATURES.map((f) => (
            <div className="card feature" key={f.title}>
              <span className="feature-icon"><f.icon aria-hidden /></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="how">
        <div className="section-title">
          <h2>How it works</h2>
          <p>Three steps from sensor to decision.</p>
        </div>
        <div className="grid grid-3 steps">
          <div className="step"><h3>Sensors report</h3><p className="secondary">Probes in each field send readings every few minutes. Gaps are recorded, not hidden.</p></div>
          <div className="step"><h3>Rules compare</h3><p className="secondary">Readings are checked against thresholds you control, plus your latest soil test.</p></div>
          <div className="step"><h3>You decide</h3><p className="secondary">Apply or dismiss each recommendation. Applied actions are logged automatically.</p></div>
        </div>
      </section>

      <div className="cta-band">
        <h2 style={{ fontSize: 'clamp(1.4rem, 2vw + 1rem, 2rem)', marginBottom: 'var(--sp-3)' }}>Ready to farm smarter?</h2>
        <p className="secondary" style={{ marginBottom: 'var(--sp-6)' }}>Registration takes a minute. You get your Farmer ID instantly.</p>
        <Link className="btn btn-primary btn-lg" to="/signup">Register now <ArrowRight aria-hidden /></Link>
      </div>

      <footer className="footer">
        <div className="footer-inner">
          <div className="stack" style={{ gap: 8 }}>
            <Logo />
            <span>Smart Sugarcane Farm Advisory System</span>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="row" style={{ gap: 6 }}><ShieldCheck size={16} aria-hidden /> Passwords are hashed; your data is yours.</span>
            <span className="row" style={{ gap: 6 }}><Smartphone size={16} aria-hidden /> Works on any phone browser.</span>
          </div>
          <div>© {new Date().getFullYear()} Smart Farm Advisory · Advice is indicative — confirm with your local KVK.</div>
        </div>
      </footer>
    </>
  );
}
