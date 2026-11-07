import React, { useEffect, useState } from 'react';
import App from './App';
import Governors2026 from './senate/Governors2026';
import House2026 from './senate/House2026';
import Overview from './senate/Overview';
import Retro2026 from './senate/Retro2026';
import Senate2026 from './senate/Senate2026';

const TABS = [
  { id: 'results-2026', label: '2026 Results' },
  { id: 'overview-2026', label: 'Forecast' },
  { id: 'senate-2026', label: 'Senate' },
  { id: 'house-2026', label: 'House' },
  { id: 'governors-2026', label: 'Governors' },
  { id: 'president-2024', label: '2024 President' },
];

const fromHash = () => {
  const h = window.location.hash.replace('#', '');
  return TABS.some((t) => t.id === h) ? h : 'results-2026';
};

export default function Root() {
  const [tab, setTab] = useState(fromHash);
  useEffect(() => {
    const on = () => setTab(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (id) => { window.location.hash = id; window.scrollTo(0, 0); };

  if (tab === 'president-2024') {
    return (
      <div className="min-h-screen bg-gray-100">
        <Nav tab={tab} />
        <App />
      </div>
    );
  }
  return (
    <div className="min-h-screen" style={{ background: '#f6f5f2' }}>
      <Nav tab={tab} />
      <main className="w-full mx-auto px-3 sm:px-6 py-5" style={{ maxWidth: 1600 }}>
        {tab === 'results-2026' && <Retro2026 />}
        {tab === 'overview-2026' && <Overview go={go} />}
        {tab === 'senate-2026' && <Senate2026 />}
        {tab === 'house-2026' && <House2026 />}
        {tab === 'governors-2026' && <Governors2026 />}
        <p className="text-xs text-gray-500 text-center mt-6 max-w-3xl mx-auto">
          Prices from Kalshi. One national percentile x drives every race: P(R wins | x) = BetaCDF(x; n(1−p), np), n = ρ/(1−ρ), the same model as the 2024 tab.
          Seat counts are exact (convolution per scenario). Independents count as not-R.
        </p>
      </main>
    </div>
  );
}

function Nav({ tab }) {
  return (
    <nav className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200">
      <div className="flex gap-1 py-2 px-3 overflow-x-auto justify-start sm:justify-center">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`}
            className={`px-3 py-1.5 rounded-md text-sm font-bold whitespace-nowrap ${tab === t.id ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
            {t.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
