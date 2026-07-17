const alertStyles = {
  info: {
    border: 'border-cyan-400/25',
    background: 'bg-cyan-400/10',
    glow: 'shadow-[0_0_30px_rgba(34,211,238,0.18)]',
    text: 'text-cyan-50',
    accent: 'text-cyan-300',
    icon: 'ℹ️',
  },
  warning: {
    border: 'border-amber-400/25',
    background: 'bg-amber-400/10',
    glow: 'shadow-[0_0_30px_rgba(245,158,11,0.18)]',
    text: 'text-amber-50',
    accent: 'text-amber-300',
    icon: '⚠️',
  },
  danger: {
    border: 'border-rose-400/25',
    background: 'bg-rose-400/10',
    glow: 'shadow-[0_0_30px_rgba(244,63,94,0.18)]',
    text: 'text-rose-50',
    accent: 'text-rose-300',
    icon: '🚨',
  },
  success: {
    border: 'border-emerald-400/25',
    background: 'bg-emerald-400/10',
    glow: 'shadow-[0_0_30px_rgba(16,185,129,0.18)]',
    text: 'text-emerald-50',
    accent: 'text-emerald-300',
    icon: '🛡️',
  },
  reroute: {
    border: 'border-violet-400/25',
    background: 'bg-violet-400/10',
    glow: 'shadow-[0_0_30px_rgba(139,92,246,0.18)]',
    text: 'text-violet-50',
    accent: 'text-violet-300',
    icon: '🔄',
  },
};

function formatToastTime(time) {
  try {
    return new Intl.DateTimeFormat([], {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(time));
  } catch {
    return '';
  }
}

export default function SmartAlertToast({ alerts = [], onDismiss }) {
  if (!alerts.length) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[1200] flex w-[min(92vw,22rem)] flex-col gap-3 sm:right-6 sm:top-6">
      {alerts.map((alert, index) => {
        const styles = alertStyles[alert.type] || alertStyles.info;

        return (
          <div
            key={alert.id}
            className={`pointer-events-auto rounded-3xl border ${styles.border} ${styles.background} ${styles.glow} backdrop-blur-2xl transition-all duration-300 animate-[toast-in_280ms_ease-out]`}
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <div className="flex items-start gap-3 p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xl ${styles.accent}`}>
                {styles.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-sm font-semibold ${styles.text}`}>{alert.title || 'AI Alert'}</p>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-slate-300/60">{formatToastTime(alert.time)}</span>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-100/90">{alert.text}</p>
                {alert.meta && <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-300/60">{alert.meta}</p>}
              </div>
              <button
                type="button"
                className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 transition hover:bg-white/10"
                onClick={() => onDismiss?.(alert.id)}
              >
                ×
              </button>
            </div>
            <div className="h-1 overflow-hidden rounded-b-3xl bg-white/5">
              <div className="h-full animate-[toast-progress_linear_4s_forwards] bg-gradient-to-r from-cyan-400 via-emerald-400 to-violet-400" />
            </div>
          </div>
        );
      })}
    </div>
  );
}