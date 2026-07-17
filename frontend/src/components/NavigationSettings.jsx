const sensitivityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Balanced', value: 'balanced' },
  { label: 'High', value: 'high' },
];

function ToggleRow({ label, description, enabled, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[#ffffff02] p-3 text-left transition hover:bg-[#ffffff05]"
    >
      <div>
        <p className="text-[11px] font-semibold text-white">{label}</p>
        <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--text-secondary)]">{description}</p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider ${enabled ? 'bg-[#FF2D7820] text-[var(--primary)] border border-[var(--primary)]' : 'bg-[#ffffff05] text-[var(--text-secondary)] border border-[var(--card-border)]'}`}>
        {enabled ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

export default function NavigationSettings({ settings, onChange }) {
  const update = (key, value) => onChange?.({ ...settings, [key]: value });

  return (
    <div className="glass-card flex flex-col gap-3">
      <div className="border-b border-[var(--card-border)] pb-2">
        <h3 className="glass-card-header !mb-0">AI Settings</h3>
        <p className="mt-1 text-[9px] text-[var(--text-secondary)]">Tune alert behaviors and smart rerouting.</p>
      </div>

      <div className="flex flex-col gap-2">
        <ToggleRow
          label="Voice Alerts"
          description="Speak warnings using browser voice."
          enabled={settings.voiceAlerts}
          onToggle={() => update('voiceAlerts', !settings.voiceAlerts)}
        />
        <ToggleRow
          label="Auto Reroute"
          description="Recalculate route when risk rises."
          enabled={settings.autoReroute}
          onToggle={() => update('autoReroute', !settings.autoReroute)}
        />
        <ToggleRow
          label="Night Safety Mode"
          description="Raise sensitivity for low-light."
          enabled={settings.nightSafetyPriority}
          onToggle={() => update('nightSafetyPriority', !settings.nightSafetyPriority)}
        />
      </div>

      <div className="rounded-xl border border-[var(--card-border)] bg-[#ffffff02] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-white">Alert Sensitivity</p>
          <span className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">{settings.alertSensitivity}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {sensitivityOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => update('alertSensitivity', option.value)}
              className={`rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition ${
                settings.alertSensitivity === option.value
                  ? 'border-[var(--primary)] bg-[#FF2D7810] text-[var(--primary)]'
                  : 'border-[var(--card-border)] bg-[#ffffff05] text-[var(--text-secondary)] hover:bg-[#ffffff10]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}