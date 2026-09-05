import { NavLink } from 'react-router-dom';
import { Bell, Map, Settings, UserRound } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Home', icon: Map, end: true },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

/**
 * Primary navigation for the app - a mobile-first bottom tab bar, since
 * real users would use SurakshaPath on a phone. Fixed to the viewport so
 * it stays reachable from every page; App.jsx reserves space below the
 * page content and keeps the SOS button positioned above it.
 */
export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[900] border-t border-[#FF2D7825] bg-[#0A0A0F]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-stretch justify-around">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition ${
                isActive ? 'text-[var(--primary)]' : 'text-slate-500 hover:text-slate-300'
              }`
            }
          >
            <tab.icon aria-hidden="true" className="h-5 w-5" strokeWidth={2.2} />
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
