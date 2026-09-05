import { useState, useEffect } from 'react';
import { getGPSService, forceRefreshGPS, injectManualLocation } from '../services/gpsService';

export default function GPSDebugPanel({ visible = true }) {
  const [location, setLocation] = useState(null);
  const [timestamp, setTimestamp] = useState(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualLat, setManualLat] = useState('22.597793');
  const [manualLng, setManualLng] = useState('75.7873264');
  const [manualAccuracy, setManualAccuracy] = useState('10');

  useEffect(() => {
    if (!visible) return;

    const gpsService = getGPSService();
    const unsubscribe = gpsService.subscribe((loc) => {
      setLocation(loc);
      setTimestamp(new Date().toLocaleTimeString());
    });

    // Update immediately if location exists
    const currentLoc = gpsService.getLocation();
    if (currentLoc) {
      setLocation(currentLoc);
      setTimestamp(new Date().toLocaleTimeString());
    }

    return unsubscribe;
  }, [visible]);

  if (!visible || !location) return null;

  const handleRefresh = async () => {
    await forceRefreshGPS();
  };

  const handleInjectManualLocation = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    const accuracy = parseFloat(manualAccuracy);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      alert('Invalid coordinates');
      return;
    }

    injectManualLocation(lat, lng, accuracy);
    setShowManualInput(false);
  };

  const getStatusColor = () => {
    if (location.error) return 'bg-red-900';
    if (location.source === 'manual') return 'bg-purple-900';
    if (location.status === 'high') return 'bg-green-900';
    if (location.status === 'good') return 'bg-emerald-900';
    if (location.status === 'acceptable') return 'bg-blue-900';
    return 'bg-yellow-900';
  };

  const getStatusText = () => {
    if (location.error) return '❌ ERROR';
    if (location.source === 'manual') return '🔧 MANUAL';
    if (location.status === 'high') return '✅ HIGH';
    if (location.status === 'good') return '✅ GOOD';
    if (location.status === 'acceptable') return '⚠️ ACCEPTABLE';
    if (location.status === 'low-accuracy') return '⚠️ LOW ACCURACY';
    return '❓ UNKNOWN';
  };

  return (
    <div className="fixed bottom-20 right-4 bg-slate-900 border border-slate-600 rounded-lg p-3 text-xs font-mono text-slate-300 shadow-lg max-w-sm z-50">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-slate-100">🛰️ GPS DEBUG</span>
        <div className="flex gap-1">
          <button
            onClick={() => setShowManualInput(!showManualInput)}
            className="px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded text-[10px] text-white"
          >
            Manual
          </button>
          <button
            onClick={handleRefresh}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-[10px] text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {location.error ? (
        <>
          <div className="space-y-1">
            <div className={`px-2 py-1 ${getStatusColor()} rounded text-white`}>{location.error}</div>
            <div className="text-slate-400">Code: {location.errorCode}</div>
          </div>
        </>
      ) : (
        <>
          <div className={`px-2 py-1 ${getStatusColor()} rounded text-white mb-2`}>{getStatusText()}</div>
          <div className="space-y-1">
            <div>
              <span className="text-slate-400">LAT:</span> <span className="text-cyan-300">{location.lat?.toFixed(6)}</span>
            </div>
            <div>
              <span className="text-slate-400">LNG:</span> <span className="text-cyan-300">{location.lng?.toFixed(6)}</span>
            </div>
            <div>
              <span className="text-slate-400">ACC:</span> <span className="text-yellow-300">±{Math.round(location.accuracy)}m</span>
            </div>
            <div>
              <span className="text-slate-400">SRC:</span> <span className="text-purple-300">{location.source}</span>
            </div>
            <div>
              <span className="text-slate-400">UPD:</span> <span className="text-green-300">{timestamp}</span>
            </div>
          </div>
        </>
      )}

      {showManualInput && (
        <div className="mt-3 pt-3 border-t border-slate-600 space-y-2">
          <div className="text-slate-200 font-bold mb-2">Manual Location Inject</div>
          <div>
            <label className="text-slate-400 text-[10px]">Latitude</label>
            <input
              type="number"
              step="0.000001"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-[10px]"
              placeholder="22.597793"
            />
          </div>
          <div>
            <label className="text-slate-400 text-[10px]">Longitude</label>
            <input
              type="number"
              step="0.000001"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-[10px]"
              placeholder="75.7873264"
            />
          </div>
          <div>
            <label className="text-slate-400 text-[10px]">Accuracy (m)</label>
            <input
              type="number"
              step="0.1"
              value={manualAccuracy}
              onChange={(e) => setManualAccuracy(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-[10px]"
              placeholder="10"
            />
          </div>
          <button
            onClick={handleInjectManualLocation}
            className="w-full bg-green-600 hover:bg-green-700 text-white rounded px-2 py-1 text-[10px] font-bold"
          >
            Inject Location
          </button>
        </div>
      )}
    </div>
  );
}
