import { useEffect, useState } from 'react';
import { Activity, ChartColumn } from 'lucide-react';
import SensorsSection from './Sensors.jsx';
import AnalyticsSection from './Analytics.jsx';

const SECTIONS = [
  { id: 'sensors', n: '01', label: 'Live sensors', sub: 'Per-field readings, sensor health and charts', icon: Activity },
  { id: 'analytics', n: '02', label: 'Farm analytics', sub: 'Trends, water, fertilizer, yield and field comparison', icon: ChartColumn },
];

/** One page for both live sensor data and historical analytics, with a sticky section bar. */
export default function AnalyticsSensors() {
  const [active, setActive] = useState('sensors');

  // highlight the section currently in view
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: '-140px 0px -55% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const jump = (id) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 130, behavior: 'smooth' });
  };

  return (
    <>
      <nav className="as-bar" aria-label="Page sections">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={active === s.id ? 'is-active' : ''} onClick={() => jump(s.id)} aria-current={active === s.id ? 'true' : undefined}>
            <span className="as-n">{s.n}</span><s.icon aria-hidden /><span className="as-l">{s.label}</span>
          </button>
        ))}
      </nav>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="as-section">
          <header className="as-head">
            <span className="as-index">{s.n}</span>
            <div>
              <h2>{s.label}</h2>
              <p>{s.sub}</p>
            </div>
          </header>
          <div className="as-body">{s.id === 'sensors' ? <SensorsSection /> : <AnalyticsSection />}</div>
        </section>
      ))}
    </>
  );
}
