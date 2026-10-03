import { Link } from 'react-router-dom';
import {
  Droplets, Thermometer, CloudRain, FlaskConical, ChartColumn, WifiOff, Download, ArrowRight, ArrowDownRight, Lightbulb, ShieldCheck, Smartphone,
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

const FEATURES = [
  { n: '01', icon: Droplets, title: 'Live field sensors', text: 'Soil moisture, temperature and humidity from every plot, streamed to your phone.' },
  { n: '02', icon: Lightbulb, title: 'Irrigation orders', text: 'When to water and how much — in litres and pumping hours, never jargon.' },
  { n: '03', icon: FlaskConical, title: 'Fertilizer doses', text: 'Urea, DAP and MOP quantities from your soil test, split into safe applications.' },
  { n: '04', icon: WifiOff, title: 'Honest about gaps', text: 'If a sensor drops out the advice says so and uses the last good reading.' },
  { n: '05', icon: ChartColumn, title: 'Analytics & history', text: 'Water use, trends and your yield against the district, season after season.' },
  { n: '06', icon: Download, title: 'Records that last', text: 'Export to CSV or a one-page PDF for the sugar mill, the bank or the co-operative.' },
];

const STATS = [
  { v: '50', l: 'Farmers in the pilot' },
  { v: '133', l: 'Fields under watch' },
  { v: '399', l: 'Sensors reporting' },
  { v: '3,000+', l: 'Seasons of crop records' },
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
          <a href="#system"><span>01</span> System</a>
          <a href="#method"><span>02</span> Method</a>
          <a href="#field"><span>03</span> Field</a>
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
          <span className="lp-kicker">SoilSense · Sugarcane advisory · Est. 2026</span>
          <h1>
            Water the cane<br />
            <em>at the right</em><br />
            hour.
          </h1>
          <p className="lp-lead">
            Sensors in the soil. Plain advice on your phone. SoilSense turns moisture, heat and humidity readings into
            exact irrigation and fertilizer orders — so every litre and every kilo does its job.
          </p>
          <div className="lp-cta-row">
            <Link className="btn btn-primary btn-lg" to={primary.to}>{primary.label} <ArrowRight aria-hidden /></Link>
            {!farmer && <Link className="btn btn-lg lp-btn-outline" to="/login">I have an account</Link>}
          </div>
          <p className="lp-demo">Demo login — <span>demo@soilsense.in</span> / <span>Demo@1234</span></p>
        </div>

        <div className="lp-hero-visual">
          <Photo photo={PHOTOS.rows} w={1100} h={1300} className="lp-hero-photo" tone="natural" eager caption="Fig. 01 — Rows at dusk" />
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

      {/* ---------------- stats ---------------- */}
      <section className="lp-stats">
        {STATS.map((s) => (
          <div key={s.l}><b>{s.v}</b><span>{s.l}</span></div>
        ))}
      </section>

      {/* ---------------- system / features mosaic ---------------- */}
      <section className="lp-section" id="system">
        <div className="lp-section-head">
          <span className="lp-index">01</span>
          <h2>The system</h2>
          <p>Built for phones with weak signal: big buttons, plain words, and advice that always explains why.</p>
        </div>
        <div className="lp-mosaic">
          {FEATURES.slice(0, 3).map((f) => (
            <article className="lp-feature" key={f.n}>
              <span className="lp-feature-n">{f.n}</span>
              <f.icon aria-hidden />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
          <Photo photo={PHOTOS.pivot} w={900} h={700} className="lp-mosaic-photo" tone="natural" caption="Fig. 02 — Irrigation, measured not guessed" />
          {FEATURES.slice(3).map((f) => (
            <article className="lp-feature" key={f.n}>
              <span className="lp-feature-n">{f.n}</span>
              <f.icon aria-hidden />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
          <Photo photo={PHOTOS.planting} w={900} h={700} className="lp-mosaic-photo" tone="natural" caption="Fig. 03 — Every seedling counts" />
        </div>
      </section>

      {/* ---------------- concrete × crop manifesto ---------------- */}
      <section className="lp-manifesto">
        <Photo photo={PHOTOS.soil} w={1000} h={1200} className="lp-manifesto-a" tone="natural" caption="Fig. 04 — Soil first" />
        <div className="lp-manifesto-copy">
          <span className="lp-index">§</span>
          <h2>Start with the soil.<br /><em>Grow from the data.</em></h2>
          <p>
            Good harvests start underground. SoilSense listens to the soil around the clock and keeps an honest record:
            every reading kept, every decision logged, nothing silently guessed.
          </p>
          <ul className="lp-checks">
            <li><ShieldCheck aria-hidden /> Passwords hashed, data scoped to each farmer</li>
            <li><Smartphone aria-hidden /> Works in any phone browser, no app install</li>
            <li><ArrowDownRight aria-hidden /> Missing sensor data recorded, never invented</li>
          </ul>
        </div>
        <Photo photo={PHOTOS.dew} w={900} h={700} className="lp-manifesto-b" tone="natural" caption="Fig. 05 — Every drop" />
      </section>

      {/* ---------------- method ---------------- */}
      <section className="lp-section lp-method" id="method">
        <div className="lp-section-head">
          <span className="lp-index">02</span>
          <h2>The method</h2>
          <p>Three steps from sensor to decision.</p>
        </div>
        <ol className="lp-steps">
          <li><b>01</b><h3>Sensors report</h3><p>Probes in each field send readings every few minutes. Gaps are recorded, not hidden.</p></li>
          <li><b>02</b><h3>Rules compare</h3><p>Readings are checked against thresholds you set, plus your latest soil test.</p></li>
          <li><b>03</b><h3>You decide</h3><p>Mark advice as done or dismiss it. Applied actions are logged automatically.</p></li>
        </ol>
      </section>

      {/* ---------------- field strip ---------------- */}
      <section className="lp-strip" id="field">
        <Photo photo={PHOTOS.harvest} w={800} h={1000} tone="natural" caption="Fig. 06 — Planting season" />
        <Photo photo={PHOTOS.sprouts} w={800} h={1000} tone="natural" caption="Fig. 07 — First growth" />
        <Photo photo={PHOTOS.paddy} w={800} h={1000} tone="natural" caption="Fig. 08 — Drip-fed" />
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="lp-cta">
        <Photo photo={PHOTOS.aerial} w={1800} h={800} className="lp-cta-bg" tone="emerald" />
        <div className="lp-cta-inner">
          <span className="lp-index">03</span>
          <h2>Register your field.</h2>
          <p>One minute. A Farmer ID instantly. Advice from the first reading.</p>
          <Link className="btn btn-wheat btn-lg" to={primary.to}>{primary.label} <ArrowRight aria-hidden /></Link>
        </div>
      </section>

      {/* ---------------- footer ---------------- */}
      <footer className="lp-footer">
        <div className="lp-footer-grid">
          <div>
            <Logo />
            <p>SoilSense — Smart Sugarcane Farm Advisory. Advice is indicative; confirm with your local Krishi Vigyan Kendra.</p>
          </div>
          <div>
            <h4>Platform</h4>
            <Link to="/signup">Register</Link><Link to="/login">Log in</Link><a href="#system">System</a><a href="#method">Method</a>
          </div>
          <div className="lp-credits">
            <h4>Photography</h4>
            <p>Via Unsplash: {[...new Map(Object.values(PHOTOS).map((x) => [x.by, x])).values()].map((p, i, a) => (
              <span key={p.id}><a href={p.page} target="_blank" rel="noreferrer">{p.by}</a>{i < a.length - 1 ? ', ' : ''}</span>
            ))}.</p>
          </div>
        </div>
        <div className="lp-footer-base">© {new Date().getFullYear()} SoilSense · Smart sugarcane advisory</div>
      </footer>
    </div>
  );
}
