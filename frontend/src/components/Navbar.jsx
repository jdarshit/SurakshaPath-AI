import Logo from './Logo';

// Minimal branding bar. Primary navigation (Home/Alerts/Settings/Profile)
// and account logout live in BottomNav.jsx / the Profile page instead, so
// this header doesn't duplicate them.
export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#FF2D7825] bg-[#0A0A0F]">
      <div className="flex w-full items-center px-4 py-3 lg:px-6">
        <Logo size={32} />
      </div>
    </header>
  );
}
