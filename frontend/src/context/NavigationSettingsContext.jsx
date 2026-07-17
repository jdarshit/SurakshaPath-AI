import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'sp_navigation_settings';

const DEFAULT_SETTINGS = {
  voiceAlerts: true,
  alertSensitivity: 'balanced',
  autoReroute: true,
  nightSafetyPriority: true,
};

function loadStoredSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const NavigationSettingsContext = createContext(null);

// Safety Preferences (voice alerts, auto reroute, night mode, alert
// sensitivity) live here instead of in Home's local state, since Home
// (map + live navigation) and the Settings page both need to read/write
// the same values now that they're separate routes.
export function NavigationSettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadStoredSettings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage failures (e.g. private browsing) - in-memory state still works.
    }
  }, [settings]);

  return (
    <NavigationSettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </NavigationSettingsContext.Provider>
  );
}

export function useNavigationSettings() {
  const context = useContext(NavigationSettingsContext);
  if (!context) {
    throw new Error('useNavigationSettings must be used within NavigationSettingsProvider');
  }
  return context;
}
