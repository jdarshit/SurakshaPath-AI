import { useId } from 'react';

/**
 * Shared SurakshaPath AI shield logo. Used by Navbar, SplashScreen, and the
 * Auth/landing page so the brand mark never drifts between screens.
 */
export default function Logo({ size = 32, showText = true, className = '' }) {
  const gradientId = `spShieldGrad-${useId()}`;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF2D78" />
            <stop offset="100%" stopColor="#C026D3" />
          </linearGradient>
        </defs>
        <path
          d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
          fill={`url(#${gradientId})`}
          style={{ filter: 'drop-shadow(0 0 8px rgba(255,45,120,0.5))' }}
        />
        <circle cx="12" cy="10" r="3" fill="white" />
        <path d="M12 13l-2-3h4l-2 3z" fill="white" />
      </svg>
      {showText ? (
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--primary)' }}>SurakshaPath AI</h1>
          <p className="text-[10px] tracking-widest text-white uppercase">Surakshit Raasta, Smart Faisla</p>
        </div>
      ) : null}
    </div>
  );
}
