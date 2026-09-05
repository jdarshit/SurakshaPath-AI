import { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { useToast } from '../hooks/useToast';

const INCIDENT_TYPES = [
  'Harassment',
  'Theft',
  'Assault',
  'Unsafe Area',
  'Poor Lighting',
  'Suspicious Activity',
];

const SEVERITY_LEVELS = [
  { label: 'Low', value: 'low', color: 'bg-yellow-500/20 text-yellow-300', nlpLabel: 'LOW' },
  { label: 'Medium', value: 'medium', color: 'bg-orange-500/20 text-orange-300', nlpLabel: 'MEDIUM' },
  { label: 'High', value: 'high', color: 'bg-red-500/20 text-red-300', nlpLabel: 'HIGH' },
];

/**
 * IncidentReportModal - Modal for reporting safety incidents with NLP analysis
 */
export default function IncidentReportModal({ isOpen, onClose, location, onSuccess }) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    area_name: '',
    incident_type: INCIDENT_TYPES[0],
    description: '',
    lat: location?.lat || 22.7196,
    lng: location?.lng || 75.8577,
    severity: 'medium',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nlpAnalysis, setNlpAnalysis] = useState(null);
  const [analyzingNLP, setAnalyzingNLP] = useState(false);
  const nlpTimeoutRef = useRef(null);
  // A ref (not the `loading` state) guards against double-submit: two rapid
  // clicks can both fire handleSubmit before React re-renders the disabled
  // button, since both handler closures would read the same stale `loading
  // === false` from the render they were created in. A ref is mutated
  // immediately and shared across every closure, so it catches the second
  // call reliably.
  const submittingRef = useRef(false);

  // Image upload state
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [cnnAnalysis, setCnnAnalysis] = useState(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);

  // Update lat/lng when location changes - use useEffect to avoid state update in component body
  useEffect(() => {
    if (location && (formData.lat !== location.lat || formData.lng !== location.lng)) {
      setFormData((prev) => ({
        ...prev,
        lat: location.lat,
        lng: location.lng,
      }));
    }
  }, [location?.lat, location?.lng]);

  const SEVERITY_MAPPING = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };

  // Calls /incidents/analyze for the given text. Shared by the live-typing
  // preview (debounced) and handleSubmit (always run fresh, no debounce),
  // so severity is never stuck depending on debounce timing.
  const analyzeDescription = async (text) => {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (trimmed.length < 10) return null;

    try {
      const response = await api.post('/incidents/analyze', {
        text,
        lat: formData.lat,
        lng: formData.lng,
        area_name: formData.area_name,
      });
      return response?.data || null;
    } catch (err) {
      console.error('NLP analysis error:', err);
      return null;
    }
  };

  // Debounced NLP analysis (live preview while typing)
  useEffect(() => {
    if (nlpTimeoutRef.current) {
      clearTimeout(nlpTimeoutRef.current);
    }

    if (formData.description.trim().length < 10) {
      setNlpAnalysis(null);
      return;
    }

    setAnalyzingNLP(true);

    nlpTimeoutRef.current = setTimeout(async () => {
      const data = await analyzeDescription(formData.description);
      if (data) {
        setNlpAnalysis(data);
        const nlpSeverity = SEVERITY_MAPPING[data.severity_label];
        if (nlpSeverity) {
          setFormData((prev) => ({ ...prev, severity: nlpSeverity }));
        }
      }
      setAnalyzingNLP(false);
    }, 1500); // Debounce delay

    return () => {
      if (nlpTimeoutRef.current) clearTimeout(nlpTimeoutRef.current);
    };
  }, [formData.description, formData.lat, formData.lng, formData.area_name]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError('');
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      e.target.value = ''; // Reset file input
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      e.target.value = ''; // Reset file input
      return;
    }

    setSelectedImage(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target.result);
    };
    reader.readAsDataURL(file);

    // Auto-analyze image
    await analyzeImage(file);
  };

  const analyzeImage = async (file) => {
    if (!file) return;

    setAnalyzingImage(true);
    setCnnAnalysis(null);

    try {
      const formDataObj = new FormData();
      formDataObj.append('file', file);
      formDataObj.append('area_name', formData.area_name || 'Unknown');

      const response = await api.post('/areas/analyze-image', formDataObj);

      if (response.data) {
        setCnnAnalysis(response.data);
      }
    } catch (err) {
      console.error('Image analysis error:', err);
      const errorMsg = err?.response?.data?.message || 'Failed to analyze image';
      setError(errorMsg);
      setCnnAnalysis(null);
      // Reset file input on error
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
    } finally {
      setAnalyzingImage(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError('');

    try {
      // Always re-analyze the final description text right before saving,
      // instead of trusting the debounced preview to have already fired.
      // A fast typer can otherwise hit Submit before the 1500ms debounce
      // runs even once, silently saving the incident with the default
      // ("medium") severity instead of an AI-derived one - this is what
      // made the AI analysis look "intermittent".
      if (nlpTimeoutRef.current) {
        clearTimeout(nlpTimeoutRef.current);
        nlpTimeoutRef.current = null;
      }

      let finalSeverity = formData.severity;
      let finalNlpAnalysis = nlpAnalysis;

      const freshAnalysis = await analyzeDescription(formData.description);
      if (freshAnalysis) {
        finalNlpAnalysis = freshAnalysis;
        setNlpAnalysis(freshAnalysis);
        const nlpSeverity = SEVERITY_MAPPING[freshAnalysis.severity_label];
        if (nlpSeverity) {
          finalSeverity = nlpSeverity;
          setFormData((prev) => ({ ...prev, severity: nlpSeverity }));
        }
      }

      const payload = { ...formData, severity: finalSeverity };
      const response = await api.post('/incidents/report', payload);

      // Show success toast with NLP severity if available
      const severityMsg = finalNlpAnalysis
        ? `Incident reported! AI analyzed severity as ${finalNlpAnalysis.severity_label}`
        : 'Incident reported successfully!';
      showToast(severityMsg, 'success', 4000);
      
      // Reset form
      setFormData({
        area_name: '',
        incident_type: INCIDENT_TYPES[0],
        description: '',
        lat: location?.lat || 22.7196,
        lng: location?.lng || 75.8577,
        severity: 'medium',
      });
      
      // Reset NLP and image analysis
      setNlpAnalysis(null);
      setSelectedImage(null);
      setImagePreview(null);
      setCnnAnalysis(null);
      
      // Call success callback with incident data
      if (onSuccess) {
        onSuccess(response.data.incident);
      }
      
      // Close modal
      onClose();
    } catch (err) {
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to report incident';
      console.error('Error reporting incident:', errorMessage);
      setError(errorMessage);
      showToast(`Error: ${errorMessage}`, 'error', 4000);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          ✕
        </button>

        {/* Header */}
        <div className="mb-4 pr-8">
          <h2 className="text-xl font-semibold text-white">Report Incident</h2>
          <p className="text-sm text-slate-400 mt-1">
            Help make Indore safer by reporting incidents you witness
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Area Name */}
          <div>
            <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Area Name</label>
            <input
              type="text"
              name="area_name"
              value={formData.area_name}
              onChange={handleChange}
              placeholder="e.g., Rajwada, MG Road"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50"
              required
            />
          </div>

          {/* Incident Type */}
          <div>
            <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Incident Type</label>
            <select
              name="incident_type"
              value={formData.incident_type}
              onChange={handleChange}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400/50 appearance-none cursor-pointer"
            >
              {INCIDENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Describe what happened..."
              rows="3"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 resize-none"
              required
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold">📸 Upload Area Photo (Optional)</label>
            <div className="mt-2 relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full text-sm text-slate-400 file:mr-3 file:rounded-full file:border-0 file:bg-cyan-500/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-cyan-300 cursor-pointer"
              />
            </div>

            {/* Image Preview and CNN Analysis */}
            {imagePreview && (
              <div className="mt-3 space-y-3">
                <div className="rounded-2xl border border-white/10 overflow-hidden bg-slate-900/50">
                  <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover" />
                </div>

                {analyzingImage && (
                  <div className="rounded-2xl border border-purple-400/30 bg-purple-500/5 p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-transparent border-t-purple-400 animate-spin"></div>
                      <span className="text-xs text-purple-300">Analyzing area from image...</span>
                    </div>
                  </div>
                )}

                {cnnAnalysis && !analyzingImage && (
                  <div className={`rounded-2xl border-2 p-3 space-y-2 ${
                    cnnAnalysis.safety_label === 'UNSAFE'
                      ? 'border-red-500/50 bg-red-500/10'
                      : cnnAnalysis.safety_label === 'MEDIUM'
                      ? 'border-orange-500/50 bg-orange-500/10'
                      : 'border-green-500/50 bg-green-500/10'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">📸 Photo Analysis</span>
                      <span className="text-xs px-2 py-1 rounded-lg bg-slate-700/50 text-slate-200 font-semibold">
                        {Math.round(cnnAnalysis.confidence * 100)}% confident
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400">Safety:</span>
                        <p className="font-semibold">{cnnAnalysis.safety_label === 'UNSAFE' && '🔴'} {cnnAnalysis.safety_label === 'MEDIUM' && '🟡'} {cnnAnalysis.safety_label === 'SAFE' && '🟢'} {cnnAnalysis.safety_label}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Score:</span>
                        <p className="font-semibold">{cnnAnalysis.safety_score}/100</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Lighting:</span>
                        <p className="font-semibold">{cnnAnalysis.lighting_detected}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Crowd:</span>
                        <p className="font-semibold">{cnnAnalysis.crowd_detected}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Combined AI Analysis Display */}
          {(nlpAnalysis || cnnAnalysis) && (
            <div className="rounded-2xl border-2 border-indigo-500/50 bg-indigo-500/10 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">🧠 Combined AI Analysis</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {nlpAnalysis && (
                  <div className="rounded-lg bg-slate-900/40 p-2">
                    <p className="text-slate-400 mb-1">Text Analysis</p>
                    <p className="font-semibold">{nlpAnalysis.severity_label}</p>
                    <p className="text-slate-500 text-[10px]">Score: {nlpAnalysis.severity_score}</p>
                  </div>
                )}
                {cnnAnalysis && (
                  <div className="rounded-lg bg-slate-900/40 p-2">
                    <p className="text-slate-400 mb-1">Image Analysis</p>
                    <p className="font-semibold">{cnnAnalysis.safety_label}</p>
                    <p className="text-slate-500 text-[10px]">Score: {cnnAnalysis.safety_score}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NLP Analysis Results */}
          {analyzingNLP && (
            <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/5 p-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin"></div>
                <span className="text-xs text-cyan-300">Analyzing incident severity...</span>
              </div>
            </div>
          )}

          {nlpAnalysis && !analyzingNLP && (
            <div className={`rounded-2xl border-2 p-4 space-y-3 ${
              nlpAnalysis.severity_label === 'HIGH'
                ? 'border-red-500/50 bg-red-500/10'
                : nlpAnalysis.severity_label === 'MEDIUM'
                ? 'border-orange-500/50 bg-orange-500/10'
                : 'border-green-500/50 bg-green-500/10'
            }`}>
              {/* AI Analysis Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">🤖 AI Analysis Result</span>
                </div>
                <span className="text-xs px-2 py-1 rounded-lg bg-slate-700/50 text-slate-200 font-semibold">
                  {Math.round(nlpAnalysis.confidence * 100)}% confident
                </span>
              </div>

              {/* Severity */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300 font-semibold">Severity:</span>
                <span className={`text-sm font-bold px-3 py-1 rounded-lg ${
                  nlpAnalysis.severity_label === 'HIGH'
                    ? 'bg-red-500/30 text-red-300'
                    : nlpAnalysis.severity_label === 'MEDIUM'
                    ? 'bg-orange-500/30 text-orange-300'
                    : 'bg-green-500/30 text-green-300'
                }`}>
                  {nlpAnalysis.severity_label === 'HIGH' && '🔴'} 
                  {nlpAnalysis.severity_label === 'MEDIUM' && '🟡'} 
                  {nlpAnalysis.severity_label === 'LOW' && '🟢'} 
                  {nlpAnalysis.severity_label}
                </span>
              </div>

              {/* Score and Impact */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/40 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Score</p>
                  <p className="text-lg font-bold text-slate-100">{nlpAnalysis.severity_score}/100</p>
                </div>
                <div className="bg-slate-900/40 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Safety Impact</p>
                  <p className={`text-lg font-bold ${nlpAnalysis.safety_impact < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {nlpAnalysis.safety_impact > 0 ? '+' : ''}{nlpAnalysis.safety_impact}
                  </p>
                </div>
              </div>

              {/* Keywords */}
              {nlpAnalysis.keywords_detected && nlpAnalysis.keywords_detected.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold mb-2">Keywords detected:</p>
                  <div className="flex flex-wrap gap-1">
                    {nlpAnalysis.keywords_detected.map((keyword) => (
                      <span key={keyword} className="text-xs px-2 py-1 rounded-lg bg-slate-700/60 text-slate-200 font-mono">
                        "{keyword}"
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Info Message */}
              <p className="text-xs text-slate-300 bg-slate-900/40 px-2 py-2 rounded-lg border-l-2 border-slate-500">
                Area safety score will be updated by {nlpAnalysis.safety_impact} points
              </p>
            </div>
          )}

          {/* Severity */}
          <div>
            <label className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2 block">Severity</label>
            <div className="flex gap-2">
              {SEVERITY_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, severity: level.value }))}
                  className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-semibold transition ${
                    formData.severity === level.value
                      ? level.color
                      : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location Display */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-3">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Latitude</p>
              <p className="text-sm text-slate-200 font-mono">{Number.isFinite(Number(formData.lat)) ? Number(formData.lat).toFixed(4) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Longitude</p>
              <p className="text-sm text-slate-200 font-mono">{Number.isFinite(Number(formData.lng)) ? Number(formData.lng).toFixed(4) : '—'}</p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Reporting...' : 'Report Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
