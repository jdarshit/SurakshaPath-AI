/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#0f172a',
        panelSoft: '#111c33',
        line: '#22304b',
        safe: '#22c55e',
        caution: '#f59e0b',
        danger: '#ef4444',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(148,163,184,0.08), 0 24px 80px rgba(15,23,42,0.45)',
      },
      backgroundImage: {
        'city-grid': 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.12) 1px, transparent 0)',
      },
    },
  },
  plugins: [],
};