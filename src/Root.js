import React, { useEffect, useState } from 'react';
import App from './App';
import Senate2026 from './senate/Senate2026';

const TABS = [
  { id: 'senate-2026', label: '2026 Senate' },
  { id: 'president-2024', label: '2024 President' },
];

const fromHash = () => {
  const h = window.location.hash.replace('#', '');
  return TABS.some((t) => t.id === h) ? h : 'senate-2026';
};

export default function Root() {
  const [tab, setTab] = useState(fromHash);
  useEffect(() => {
    const on = () => setTab(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="flex justify-center gap-1 py-2">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold ${tab === t.id ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
              {t.label}
            </a>
          ))}
        </div>
      </nav>
      {tab === 'senate-2026' ? <Senate2026 /> : <App />}
    </div>
  );
}
