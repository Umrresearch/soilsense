import { Link } from 'react-router-dom';
import {
  Droplets, Thermometer, CloudRain, FlaskConical, ChartColumn, WifiOff, Download, ArrowRight, Lightbulb,
} from 'lucide-react';
import { Logo } from '../components/AppShell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { PHOTOS, img } from '../lib/photos.js';

function Photo({ photo, w = 1200, h, className = '', tone = 'emerald', caption, eager }) {
  return (
    <figure className={`lp-photo tone-${tone} ${className}`}>
      <img {...img(photo, { w, h })} loading={eager ? 'eager' : 'lazy'} decoding="async" sizes="(max-width: 900px) 100vw, 50vw" />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

const STEPS = [
  { n: '01', title: 'Sensors report', text: 'Probes in each field send moisture, temperature and humidity. Gaps are recorded, not hidden.' },
  { n: '02', title: 'Rules compare', text: 'Readings are checked against your thresholds, the weather forecast and your latest soil test.' },
  { n: '03', title: 'You decide', text: 'Clear orders in litres, pumping hours and kilos. Mark them done and they are logged.' },
];

const FEATURES = [
  { icon: Droplets, title: 'Live sensors', text: 'Every plot, streamed to your phone.' },
  { icon: Lightbulb, title: 'Irrigation orders', text: 'When to water and exactly how much.' },
  { icon: FlaskConical, title: 'Fertilizer doses', text: 'Urea, DAP and MOP from your soil test.' },
  { icon: WifiOff, title: 'Honest about gaps', text: 'Says so when a sensor drops out.' },
  { icon: ChartColumn, title: 'Analytics', text: 'Water use, trends and yield history.' },
  { icon: Download, title: 'Exports', text: 'CSV or one-page PDF reports.' },
];

const STATS = [
  { v: '50', l: 'Farmers' },
  { v: '133', l: 'Fields' },
  { v: '399', l: 'Sensors' },
  { v: '3k+', l: 'Seasons' },
];

const STRIP = [
  ['pivot', 'Fig. 02 — Irrigation'],
  ['soil', 'Fig. 03 — Soil first'],
  ['dew', 'Fig. 04 — Every drop'],
  ['harvest', 'Fig. 05 — New growth'],
  ['sprouts', 'Fig. 06 — Furrows'],
  ['paddy', 'Fig. 07 — Drip-fed'],
];

export default function Landing() {
  const { farmer } = useAuth();
  const primary = farmer ? { to: '/app', label: 'Open dashboard' } : { to: '/signup', label: 'Register your field' };

  return (
    <div className="lp">
      {/* ---------------- nav ---------------- */}
      <nav className="lp-nav">
        <Logo />
        <div className="lp-nav-links">
          <a href="#how"><span>01</span> How it works</a>
          <a href="#field"><span>02</span> Field</a>
        </div>
        <div className="spacer" />
        {farmer ? <Link className="btn btn-wheat" to="/app">Dashboard</Link> : (
          <>
            <Link className="btn btn-ghost lp-login" to="/login">Log in</Link>
            <Link className="btn btn-wheat" to="/signup">Sign up</Link>
          </>
        )}
      </nav>

      {/* ---------------- hero ---------------- */}
      <header className="lp-hero">
        <div className="lp-hero-copy">
          <span className="lp-kicker">SoilSense · Sugarcane advisory</span>
          <h1>
            Water the cane<br />
            <em>at the right</em><br />
            hour.
          </h1>
          <p className="lp-lead">
            Sensors in the soil, plain advice on your phone. SoilSense turns moisture, heat and humidity readings into
            exact irrigation and fertilizer orders.
          </p>
          <div className="lp-cta-row">
            <Link className="btn btn-primary btn-lg" to={primary.to}>{primary.label} <ArrowRight aria-hidden /></Link>
            {!farmer && <Link className="btn btn-lg lp-btn-outline" to="/login">I have an account</Link>}
          </div>
          <p className="lp-demo">Demo login — <span>demo@soilsense.in</span> / <span>Demo@1234</span></p>
          <dl className="lp-stats">
            {STATS.map((s) => (
              <div key={s.l}><dt>{s.l}</dt><dd>{s.v}</dd></div>
            ))}
          </dl>
        </div>

        <div className="lp-hero-visual">
          <Photo photo={PHOTOS.rows} w={1000} h={1100} className="lp-hero-photo" tone="natural" eager caption="Fig. 01 — Rows at dusk" />
          <div className="lp-reading" aria-label="Example recommendation">
            <div className="lp-reading-head"><span>North plot · FLD-0131</span><span className="lp-tag">High</span></div>
            <div className="lp-reading-action">Irrigate today<br /><b>650 kL</b> · 13 h pumping</div>
            <div className="lp-reading-grid">
              <div><Droplets aria-hidden /><b>18%</b><span>Moisture</span></div>
              <div><Thermometer aria-hidden /><b>36°</b><span>Canopy</span></div>
              <div><CloudRain aria-hidden /><b>58%</b><span>Humidity</span></div>
            </div>
          </div>
        </div>
      </header>

      {/* ---------------- ticker ---------------- */}
      <div className="lp-ticker" aria-hidden>
        <div className="lp-ticker-track">
          {Array.from({ length: 2 }).map((_, k) => (
            <span key={k}>Soil moisture ■ Temperature ■ Humidity ■ Irrigation ■ Fertilizer ■ Harvest ■ Soil moisture ■ Temperature ■ Humidity ■ Irrigation ■ Fertilizer ■ Harvest ■&nbsp;</span>
          ))}
        </div>
      </div>

      {/* ---------------- how it works (system + method) ---------------- */}
      <section className="lp-section" id="how">
        <div className="lp-section-head">
          <span className="lp-index">01</span>
          <h2>How it works</h2>
        </div>
        <div className="lp-how">
          <ol className="lp-steps">
            {STEPS.map((st) => (
              <li key={st.n}><b>{st.n}</b><div><h3>{st.title}</h3><p>{st.text}</p></div></li>
            ))}
          </ol>
          <div className="lp-features">
            {FEATURES.map((f) => (
              <article className="lp-feature" key={f.title}>
                <f.icon aria-hidden />
                <div><h3>{f.title}</h3><p>{f.text}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- field strip ---------------- */}
      <section className="lp-strip" id="field" aria-label="In the field">
        {STRIP.map(([key, cap]) => (
          <Photo key={key} photo={PHOTOS[key]} w={600} h={720} tone="natural" caption={cap} />
        ))}
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="lp-cta">
        <Photo photo={PHOTOS.aerial} w={1800} h={600} className="lp-cta-bg" tone="emerald" />
        <div className="lp-cta-inner">
          <h2>Register your field.</h2>
          <p>One minute. A Farmer ID instantly. Advice from the first reading.</p>
          <Link className="btn btn-wheat btn-lg" to={primary.to}>{primary.label} <ArrowRight aria-hidden /></Link>
        </div>
      </section>

      {/* ---------------- footer ---------------- */}
      <footer className="lp-footer">
        <div className="lp-footer-row">
          <Logo />
          <nav><Link to="/signup">Register</Link><Link to="/login">Log in</Link><a href="#how">How it works</a></nav>
          <span className="lp-footer-base">© {new Date().getFullYear()} SoilSense</span>
        </div>
        <p className="lp-credits">
          Advice is indicative; confirm with your local agriculture extension office. Photos via Unsplash: {[...new Map(Object.values(PHOTOS).map((x) => [x.by, x])).values()].map((p, i, a) => (
            <span key={p.id}><a href={p.page} target="_blank" rel="noreferrer">{p.by}</a>{i < a.length - 1 ? ', ' : ''}</span>
          ))}.
        </p>
      </footer>
    </div>
  );
}
