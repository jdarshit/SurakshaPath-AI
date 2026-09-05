import NavigationSettings from '../components/NavigationSettings';
import { useNavigationSettings } from '../context/NavigationSettingsContext';

export default function Settings() {
  const { settings, setSettings } = useNavigationSettings();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Control how SurakshaPath alerts and guides you while you travel.
        </p>
      </div>

      <NavigationSettings settings={settings} onChange={setSettings} />
    </div>
  );
}
