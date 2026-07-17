import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';

export default function Navbar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#FF2D7825] bg-[#0A0A0F] shadow-[0_0_20px_rgba(255,45,120,0.1)]">
      <div className="flex w-full items-center justify-between px-4 py-3 lg:px-6">
        <Logo size={32} />
        <div className="hidden items-center gap-3 sm:flex">
          <div className="rounded-full border border-green-500 bg-[#052e16] px-3 py-1 text-xs text-green-500">
            FastAPI Connected
          </div>
          <div className="rounded-full border border-blue-500 bg-[#0c1a2e] px-3 py-1 text-xs text-blue-500">
            Leaflet + OSRM
          </div>
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="rounded-lg border border-slate-500 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-[#FFFFFF0A] transition"
          >
            Profile
          </button>
          <button onClick={handleLogout} className="ml-4 rounded-lg border border-[var(--primary)] px-3 py-1 text-xs font-semibold text-[var(--primary)] hover:bg-[#FF2D7810] transition">
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}