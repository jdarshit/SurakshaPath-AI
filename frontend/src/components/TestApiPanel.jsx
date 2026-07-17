export default function TestApiPanel({ onTest, loading, result, error }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-glow backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-300">Backend Check</p>
          <h3 className="text-lg font-semibold text-white">Test AI Prediction</h3>
        </div>
        <button
          type="button"
          onClick={onTest}
          disabled={loading}
          className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Testing...' : 'Test AI Prediction'}
        </button>
      </div>

      {error ? <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}

      {result ? (
        <pre className="mt-4 overflow-auto rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-xs leading-6 text-slate-200">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}