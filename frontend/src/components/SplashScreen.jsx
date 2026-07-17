import { motion } from 'framer-motion';
import Logo from './Logo';

const startupChecks = [
  'AI Models Loaded',
  'Maps Connected',
  'Safety Engine Active',
  'Smart Routing Ready',
  'Incident Monitoring Online',
];

export default function SplashScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[2000] overflow-hidden bg-[#0A0A0F]"
    >
      <div className="absolute inset-0 bg-city-grid bg-[size:28px_28px] opacity-20" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,45,120,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.14),transparent_24%),linear-gradient(180deg,rgba(10,10,15,0.94),rgba(10,10,15,0.98))]" />
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#FF2D78] to-transparent opacity-80" />

      <div className="relative flex min-h-screen items-center justify-center px-6 py-10">
        <motion.div
          initial={{ scale: 0.92, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="w-full max-w-3xl rounded-[2rem] border border-[var(--card-border)] bg-[var(--card-bg)] p-8 shadow-[0_0_80px_rgba(255,45,120,0.14)] backdrop-blur-2xl"
        >
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 140, damping: 12 }}
              className="flex h-24 w-24 items-center justify-center rounded-[1.75rem] border border-[var(--primary)]/30 bg-gradient-to-br from-[rgba(255,45,120,0.2)] via-[rgba(139,92,246,0.1)] to-transparent shadow-[0_0_50px_rgba(255,45,120,0.2)]"
            >
              <Logo size={56} showText={false} />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mt-6 text-4xl font-semibold tracking-wide text-white sm:text-5xl"
            >
              SurakshaPath AI
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="mt-3 text-lg text-[color:var(--secondary)]/90"
            >
              Surakshit Raasta, Smart Faisla
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.5 }}
              className="mt-8 grid w-full gap-3 sm:grid-cols-2"
            >
              {startupChecks.map((label, index) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0A0A0F]/60 px-4 py-3 text-left text-sm text-slate-200"
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(255,45,120,0.12)] text-[var(--primary)]">✓</span>
                  <span>{label}</span>
                </div>
              ))}
            </motion.div>

            <div className="mt-8 flex flex-col items-center gap-4">
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-slate-400">
                <span>Loading</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
                <span>Preparing demo environment</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <motion.div
                  initial={{ width: '6%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 2.8, ease: 'easeInOut' }}
                  className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] via-[var(--accent-purple)] to-[var(--secondary)]"
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
