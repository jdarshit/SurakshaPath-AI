import { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import SplashScreen from './components/SplashScreen';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { triggerSosAlert } from './services/sos';
import { getCurrentLocation, startGPS, stopGPS } from './services/gpsService';

const Home = lazy(() => import('./pages/Home'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Profile = lazy(() => import('./pages/Profile'));
const AuthPage = lazy(() => import('./pages/Auth'));

const SOS_HOLD_DURATION_MS = 3000;
const SOS_RING_RADIUS = 34;
const SOS_RING_CIRCUMFERENCE = 2 * Math.PI * SOS_RING_RADIUS;

function AppLoadingState() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-slate-300 shadow-glow backdrop-blur-xl">
        Loading smart city interface...
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const { user } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const [sosStatus, setSosStatus] = useState('idle');
  const [sosMessage, setSosMessage] = useState('');
  const [sosError, setSosError] = useState('');
  const [sosPressProgress, setSosPressProgress] = useState(0);
  const sosPressTimer = useRef(null);
  const sosProgressIntervalRef = useRef(null);
  const sosPressStartedAtRef = useRef(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 2800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (sosPressTimer.current) window.clearTimeout(sosPressTimer.current);
      if (sosProgressIntervalRef.current) window.clearInterval(sosProgressIntervalRef.current);
    };
  }, []);

  // Initialize GPS service when app mounts
  useEffect(() => {
    startGPS();

    return () => {
      stopGPS();
    };
  }, []);

  const clearSosPress = () => {
    if (sosPressTimer.current) {
      window.clearTimeout(sosPressTimer.current);
      sosPressTimer.current = null;
    }
    if (sosProgressIntervalRef.current) {
      window.clearInterval(sosProgressIntervalRef.current);
      sosProgressIntervalRef.current = null;
    }
    sosPressStartedAtRef.current = null;
    setSosPressProgress(0);
    setSosStatus('idle');
  };

  const triggerSos = async () => {
    clearSosPress();
    setSosStatus('loading');
    setSosMessage('Sending SOS alert...');
    setSosError('');

    try {
      // Check user is logged in
      if (!user) {
        setSosStatus('error');
        setSosMessage('❌ Not logged in');
        setSosError('Please log in to use SOS');
        window.setTimeout(() => {
          setSosStatus('idle');
          setSosMessage('');
          setSosError('');
        }, 5000);
        return;
      }

      // Check guardian is configured
      if (!user.guardian_phone) {
        setSosStatus('error');
        setSosMessage('❌ Guardian not configured');
        setSosError('Please add guardian phone number in Profile first');
        window.setTimeout(() => {
          setSosStatus('idle');
          setSosMessage('');
          setSosError('');
        }, 5000);
        return;
      }

      // Get CURRENT location (not destination)
      let locationCoords = getCurrentLocation();
      let lat = locationCoords?.lat;
      let lng = locationCoords?.lng;

      // If there is no current cached location yet, use browser geolocation fallback
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || locationCoords?.error) {
        try {
          const position = await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('Geolocation timeout - taking too long'));
            }, 15000); // 15 second hard timeout

            if (!navigator.geolocation) {
              clearTimeout(timeoutId);
              reject(new Error('Browser geolocation is not supported'));
              return;
            }

            const onSuccess = (pos) => {
              clearTimeout(timeoutId);
              resolve(pos);
            };

            const onError = (err) => {
              clearTimeout(timeoutId);
              const errMsg = err.code === 1 ? 'Permission denied' : err.code === 2 ? 'Position unavailable' : err.code === 3 ? 'Timeout' : 'Unknown error';
              console.error('[SOS] Browser geolocation error:', errMsg);
              reject(new Error(`Geolocation failed: ${errMsg}`));
            };

            navigator.geolocation.getCurrentPosition(onSuccess, onError, {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
            });
          });
          lat = Number(position.coords.latitude);
          lng = Number(position.coords.longitude);
        } catch (geoError) {
          setSosStatus('error');
          setSosMessage('❌ Unable to get current location');
          setSosError(`GPS location not available: ${geoError.message}. Please allow location access in browser settings.`);
          console.error('[SOS] Geolocation fallback failed:', geoError);
          window.setTimeout(() => {
            setSosStatus('idle');
            setSosMessage('');
            setSosError('');
          }, 5000);
          return;
        }
      }

      // Validate location is available
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setSosStatus('error');
        setSosMessage('❌ Unable to get current location');
        setSosError('GPS location not available. Please check location permissions.');
        window.setTimeout(() => {
          setSosStatus('idle');
          setSosMessage('');
          setSosError('');
        }, 5000);
        return;
      }

      // The backend appends the Google Maps location link itself when it
      // builds the wa.me message, so we only send the plain alert text here.
      const messageText = '🚨 EMERGENCY SOS 🚨\nPlease help immediately!';

      // Save the alert + broadcast over WebSocket. A wa.me link CANNOT be
      // sent silently by a server — it can only open WhatsApp with a
      // pre-filled message. The backend attempts silent delivery via the
      // Meta Cloud API as a best-effort bonus, but always also returns a
      // whatsapp_url so we can open it here as the reliable fallback.
      const response = await triggerSosAlert({
        lat,
        lng,
        source: 'app',
        message: messageText,
      });

      if (response?.whatsapp_url) {
        window.open(response.whatsapp_url, '_blank', 'noopener,noreferrer');
        setSosStatus('success');
        setSosMessage(`✅ SOS alert sent! Opening WhatsApp for your guardian at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      } else if (response?.notification_status === 'missing_guardian') {
        setSosStatus('success');
        setSosMessage('✅ SOS alert sent, but no guardian WhatsApp number is set. Add one in Profile.');
      } else {
        setSosStatus('success');
        setSosMessage('✅ SOS alert sent! Guardian notified at ' + lat.toFixed(4) + ', ' + lng.toFixed(4));
      }
    } catch (error) {
      setSosStatus('error');
      setSosMessage('❌ SOS alert could not be sent.');
      const errorDetail = error?.response?.data?.detail || error?.message || 'Trigger failed';
      setSosError(errorDetail);
      console.error('[SOS] Trigger error:', { error, errorDetail, status: error?.response?.status });
    } finally {
      window.setTimeout(() => {
        setSosStatus('idle');
        setSosMessage('');
        setSosError('');
      }, 5000);
    }
  };

  const handleSosPressStart = (event) => {
    event.preventDefault();
    if (sosPressTimer.current) return;
    setSosStatus('pressing');
    setSosMessage('Hold for 3 seconds to trigger SOS...');
    setSosPressProgress(0);
    sosPressStartedAtRef.current = Date.now();

    sosProgressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - (sosPressStartedAtRef.current ?? Date.now());
      setSosPressProgress(Math.min(100, (elapsed / SOS_HOLD_DURATION_MS) * 100));
    }, 50);

    sosPressTimer.current = window.setTimeout(triggerSos, SOS_HOLD_DURATION_MS);
  };

  const handleSosPressEnd = () => {
    if (sosStatus === 'pressing') {
      clearSosPress();
      setSosMessage('SOS action canceled');
      window.setTimeout(() => setSosMessage(''), 1200);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="absolute inset-0 -z-20 bg-city-grid bg-[size:24px_24px] opacity-20" />
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.14),transparent_32%),linear-gradient(180deg,rgba(2,6,23,0.98),rgba(2,6,23,1))]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20 animate-[grid-drift_16s_linear_infinite]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.10),transparent_18%),radial-gradient(circle_at_80%_30%,rgba(168,85,247,0.08),transparent_16%),radial-gradient(circle_at_50%_80%,rgba(16,185,129,0.10),transparent_20%)] animate-[neon-float_14s_ease-in-out_infinite]" />

      {showSplash && <SplashScreen />}

      <AnimatePresence mode="wait">
        {!showSplash && (
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            className="relative z-10"
          >
            <Routes location={location}>
              <Route
                path="/auth"
                element={
                  <Suspense fallback={<AppLoadingState />}>
                    <AuthPage />
                  </Suspense>
                }
              />
              <Route
                path="/admin"
                element={
                  <Suspense fallback={<AppLoadingState />}>
                    <ProtectedRoute>
                      <AdminDashboard />
                    </ProtectedRoute>
                  </Suspense>
                }
              />
              <Route
                path="*"
                element={
                  <ProtectedRoute>
                    <>
                      <Navbar />
                      <div className="flex w-full flex-1 flex-col overflow-hidden px-4 pb-4 pt-2">
                        <main className="flex min-h-[calc(100vh-6rem)] flex-1 flex-col gap-4">
                          <Suspense fallback={<AppLoadingState />}>
                            <Routes>
                              <Route path="/" element={<Home />} />
                              <Route path="/profile" element={<Profile />} />
                              <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                          </Suspense>
                        </main>
                      </div>
                    </>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="fixed bottom-[30px] right-[30px] z-[9999] h-20 w-20">
        {sosStatus === 'pressing' && (
          <svg className="pointer-events-none absolute inset-0 h-20 w-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={SOS_RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
            <circle
              cx="40"
              cy="40"
              r={SOS_RING_RADIUS}
              fill="none"
              stroke="#FF2D78"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={SOS_RING_CIRCUMFERENCE}
              strokeDashoffset={SOS_RING_CIRCUMFERENCE * (1 - sosPressProgress / 100)}
              style={{ filter: 'drop-shadow(0 0 6px rgba(255,45,120,0.8))', transition: 'stroke-dashoffset 50ms linear' }}
            />
          </svg>
        )}
        <button
          type="button"
          className="sos-button shadow-glow absolute inset-0 m-auto"
          onMouseDown={handleSosPressStart}
          onMouseUp={handleSosPressEnd}
          onMouseLeave={handleSosPressEnd}
          onPointerDown={handleSosPressStart}
          onPointerUp={handleSosPressEnd}
          onPointerLeave={handleSosPressEnd}
          onTouchStart={handleSosPressStart}
          onTouchEnd={handleSosPressEnd}
        >
          {sosStatus === 'pressing' ? 'Hold' : 'SOS'}
        </button>
      </div>
      {sosMessage ? (
        <div className="fixed bottom-32 right-6 z-50 max-w-xs rounded-3xl border border-white/10 bg-slate-950/90 p-4 text-sm text-slate-100 shadow-xl backdrop-blur-xl">
          <div className="font-semibold text-cyan-300">{sosStatus === 'error' ? 'SOS error' : sosStatus === 'success' ? 'SOS sent' : 'SOS status'}</div>
          <p className="mt-2 leading-relaxed">{sosMessage}</p>
        </div>
      ) : null}
    </div>
  );
}
