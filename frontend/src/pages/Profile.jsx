import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getCurrentUser, updateGuardian } from '../services/auth';

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    guardianName: '',
    guardianPhone: '',
    guardianRelation: '',
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [connectionOk, setConnectionOk] = useState(null);

  useEffect(() => {
    let mounted = true;
    api.get('/health')
      .then(() => { if (mounted) setConnectionOk(true); })
      .catch(() => { if (mounted) setConnectionOk(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (user) {
      setForm({
        guardianName: user.guardian_name || '',
        guardianPhone: user.guardian_phone || '',
        guardianRelation: user.guardian_relation || '',
      });
      return;
    }

    (async () => {
      try {
        const response = await getCurrentUser();
        const profile = response?.user || {};
        setForm({
          guardianName: profile.guardian_name || '',
          guardianPhone: profile.guardian_phone || '',
          guardianRelation: profile.guardian_relation || '',
        });
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    })();
  }, [user]);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus('');

    // Validate inputs
    if (!form.guardianName?.trim()) {
      setStatus('Guardian name is required.');
      setSaving(false);
      return;
    }
    if (!form.guardianPhone?.trim()) {
      setStatus('Guardian phone number is required.');
      setSaving(false);
      return;
    }

    try {
      const response = await api.put('/auth/guardian', {
        guardian_name: form.guardianName,
        guardian_whatsapp: form.guardianPhone,
        guardian_relation: form.guardianRelation,
      });

      const result = response.data;
      if (result?.success) {
        const updatedUser = {
          guardian_name: result.guardian_name,
          guardian_phone: result.guardian_whatsapp,
          guardian_relation: result.guardian_relation,
        };
        setUser((current) => ({
          ...current,
          ...updatedUser,
        }));
        setStatus('✅ Guardian contact updated successfully. SOS alerts will now send to this number.');
      } else {
        setStatus('Updated successfully.');
      }
    } catch (error) {
      const errorMsg = error?.response?.data?.message || error?.message || 'Unable to save guardian details. Please try logging in again.';
      console.error('Guardian update error:', error);
      setStatus(`❌ ${errorMsg}`);
    } finally {
      setSaving(false);
      window.setTimeout(() => setStatus(''), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-slate-950/80 p-6 shadow-[0_0_60px_rgba(7,89,133,0.25)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Profile Settings</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Emergency Guardian</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Keep your emergency contact details up to date so SOS alerts can reach your guardian immediately.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {connectionOk !== null && (
              <div className="flex items-center gap-2 text-xs text-slate-500" title={connectionOk ? 'Connected' : 'Connection issue'}>
                <span className={`h-2 w-2 rounded-full ${connectionOk ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                {connectionOk ? 'Connected' : 'Connection issue'}
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] transition hover:bg-[#FF2D7810]"
            >
              Log Out
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-300">
              <span className="font-semibold text-slate-100">Guardian Name</span>
              <input
                value={form.guardianName}
                onChange={(event) => handleChange('guardianName', event.target.value)}
                placeholder="Anjali Sharma"
                className="w-full rounded-3xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span className="font-semibold text-slate-100">Guardian WhatsApp</span>
              <input
                value={form.guardianPhone}
                onChange={(event) => handleChange('guardianPhone', event.target.value)}
                placeholder="919876543210"
                className="w-full rounded-3xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
              />
            </label>
          </div>

          <label className="space-y-2 text-sm text-slate-300">
            <span className="font-semibold text-slate-100">Relation</span>
            <input
              value={form.guardianRelation}
              onChange={(event) => handleChange('guardianRelation', event.target.value)}
              placeholder="Mother / Sister / Friend"
              className="w-full rounded-3xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-3xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Guardian Details'}
            </button>
            <p className="text-sm text-slate-400">
              This information is used for emergency WhatsApp SOS alerts.
            </p>
          </div>

          {status ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100">
              {status}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
