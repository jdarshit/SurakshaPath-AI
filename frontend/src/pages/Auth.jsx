import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Navigate, useNavigate } from 'react-router-dom';
import { register, login, saveToken, saveUser } from '../services/auth';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

const initialRegisterForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  guardianName: '',
  guardianPhone: '',
  guardianRelation: '',
};

const initialLoginForm = {
  email: '',
  password: '',
};

function Spinner() {
  return (
    <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
  );
}

function AuthToast({ toast }) {
  const tone =
    toast.type === 'success'
      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
      : toast.type === 'error'
        ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
        : 'border-[var(--accent-purple)]/30 bg-[var(--accent-purple)]/10 text-[color:var(--secondary)]';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.96 }}
      className={`rounded-2xl border px-4 py-3 shadow-[0_0_24px_rgba(34,211,238,0.12)] backdrop-blur-xl ${tone}`}
    >
      <div className="text-xs uppercase tracking-[0.28em] opacity-80">{toast.title}</div>
      <div className="mt-1 text-sm leading-relaxed opacity-95">{toast.message}</div>
    </motion.div>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading, loginWithToken } = useAuth();
  const [mode, setMode] = useState('login');
  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const addToast = (type, title, message) => {
    const id = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3600);
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    if (nextMode !== 'login') {
      setLoginForm(initialLoginForm);
    }
  };

  const handleRegisterChange = (field, value) => {
    setRegisterForm((current) => ({ ...current, [field]: value }));
  };

  const handleLoginChange = (field, value) => {
    setLoginForm((current) => ({ ...current, [field]: value }));
  };

  const submitRegister = async (event) => {
    event.preventDefault();

    if (registerForm.password !== registerForm.confirmPassword) {
      addToast('error', 'Password mismatch', 'Please make sure both password fields match.');
      return;
    }

    if (registerForm.password.length < 6) {
      addToast('error', 'Weak password', 'Use at least 6 characters for the password.');
      return;
    }

    setBusy(true);
    try {
      const response = await register({
        name: registerForm.name,
        email: registerForm.email,
        phone: registerForm.phone,
        password: registerForm.password,
        guardian_name: registerForm.guardianName,
        guardian_phone: registerForm.guardianPhone,
        guardian_whatsapp: registerForm.guardianPhone,
        guardian_relation: registerForm.guardianRelation,
      });
      if (response?.token) {
        saveToken(response.token);
        if (response?.user) {
          saveUser(response.user);
        }
        await loginWithToken(response.token);
        addToast('success', 'Registration successful', 'Your account is ready. Redirecting...');
        navigate('/', { replace: true });
      }
    } catch (error) {
      let detail = 'Could not create your account right now.';
      if (!error?.response) {
        detail = 'Cannot connect to server. Is backend running?';
      } else if (error.response?.data?.detail) {
        const d = error.response.data.detail;
        if (typeof d === 'string') {
          if (d.includes('already registered')) {
            detail = 'Email already registered. Please login.';
          } else {
            detail = d;
          }
        }
      }
      addToast('error', 'Registration failed', detail);
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await login({ email: loginForm.email, password: loginForm.password });
      if (response?.token) {
        saveToken(response.token);
        if (response?.user) {
          saveUser(response.user);
        }
        await loginWithToken(response.token);
        addToast('success', 'Login successful', 'Redirecting you to the secure dashboard.');
        navigate('/', { replace: true });
      }
    } catch (error) {
      let detail = 'Login failed. Check your credentials.';
      if (!error?.response) {
        detail = 'Cannot connect to server. Is backend running?';
      } else if (error.response?.data?.detail) {
        detail = error.response.data.detail;
      }
      addToast('error', 'Login failed', detail);
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F] text-slate-100">
        <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] px-6 py-5 text-sm text-slate-200 shadow-[0_0_60px_rgba(255,45,120,0.14)] backdrop-blur-xl">
          Loading secure session...
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0A0F] text-slate-100">
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top_left,rgba(255,45,120,0.18),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.16),transparent_28%),linear-gradient(180deg,rgba(10,10,15,0.97),rgba(10,10,15,1))]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20 animate-[grid-drift_18s_linear_infinite]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(255,45,120,0.12),transparent_18%),radial-gradient(circle_at_75%_30%,rgba(139,92,246,0.10),transparent_22%),radial-gradient(circle_at_55%_80%,rgba(255,45,120,0.10),transparent_18%)] animate-[neon-float_16s_ease-in-out_infinite]" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-10 px-4 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <motion.section
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="hidden lg:block"
        >
          <Logo size={40} />

          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-[var(--primary)]/30 bg-[rgba(255,45,120,0.1)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--secondary)]">
            <span className="h-2 w-2 rounded-full bg-[var(--primary)] shadow-[0_0_12px_rgba(255,45,120,0.9)]" />
            SurakshaPath Secure Access
          </div>

          <h1 className="mt-8 max-w-2xl text-5xl font-semibold tracking-tight text-white xl:text-7xl">
            Welcome to SurakshaPath
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-slate-300 xl:text-lg">
            Surakshit Raasta, Smart Faisla — safer routes, real incident reports, and one-press emergency help, built for Indore.
          </p>

          <div className="mt-10 grid max-w-xl gap-4 sm:grid-cols-2">
            {[
              ['Safe Route Suggestions', 'AI checks lighting, crowd & crime data for every route'],
              ['Instant SOS', 'One press alerts your guardian with your live location'],
              ['Community Reports', 'Real incident data from real people nearby'],
              ['Private & Secure', 'Your location is never shared without your consent'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 backdrop-blur-xl">
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="mt-2 text-sm leading-6 text-slate-300">{text}</div>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="relative"
        >
          <div className="absolute -inset-8 rounded-[2rem] bg-[radial-gradient(circle_at_top,rgba(255,45,120,0.10),transparent_40%)] blur-3xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-[var(--card-border)] bg-[var(--card-bg)] p-4 backdrop-blur-2xl sm:p-6">
            <div className="mb-5 flex lg:hidden">
              <Logo size={32} />
            </div>
            <div className="flex items-start justify-between gap-4 rounded-[1.5rem] border border-[var(--card-border)] bg-[#0A0A0F]/60 px-5 py-4 shadow-inner shadow-[rgba(255,45,120,0.05)]">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[color:var(--secondary)]/85">Authentication Console</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {mode === 'login' ? 'Welcome back' : 'Create your account'}
                </h2>
              </div>
              <div className="rounded-2xl border border-[var(--safe-green)]/20 bg-[var(--safe-green)]/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100">
                Secure
              </div>
            </div>

            <div className="mt-5 flex rounded-2xl border border-[var(--card-border)] bg-[#0A0A0F]/60 p-1">
              {[
                ['login', 'Login'],
                ['register', 'Register'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeMode(value)}
                  className={`relative flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${mode === value ? 'bg-[rgba(255,45,120,0.15)] text-[color:var(--secondary)] shadow-[0_0_24px_rgba(255,45,120,0.16)]' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-5 min-h-[560px] rounded-[1.5rem] border border-[var(--card-border)] bg-[linear-gradient(180deg,rgba(18,18,26,0.88),rgba(10,10,15,0.95))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-6">
              <AnimatePresence mode="wait">
                {mode === 'register' ? (
                  <motion.form
                    key="register-form"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -18 }}
                    transition={{ duration: 0.25 }}
                    onSubmit={submitRegister}
                    className="space-y-4"
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Full Name" value={registerForm.name} onChange={(value) => handleRegisterChange('name', value)} placeholder="Aarav Sharma" />
                      <Field label="Phone Number" value={registerForm.phone} onChange={(value) => handleRegisterChange('phone', value)} placeholder="9876543210" />
                    </div>
                    <Field label="Email" type="email" value={registerForm.email} onChange={(value) => handleRegisterChange('email', value)} placeholder="user@gmail.com" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Guardian Name" value={registerForm.guardianName} onChange={(value) => handleRegisterChange('guardianName', value)} placeholder="Anjali Sharma" />
                      <Field label="Guardian WhatsApp" value={registerForm.guardianPhone} onChange={(value) => handleRegisterChange('guardianPhone', value)} placeholder="919876543210" />
                    </div>
                    <Field label="Relation" value={registerForm.guardianRelation} onChange={(value) => handleRegisterChange('guardianRelation', value)} placeholder="Mother / Sister / Friend" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Password" type="password" value={registerForm.password} onChange={(value) => handleRegisterChange('password', value)} placeholder="Create password" />
                      <Field label="Confirm Password" type="password" value={registerForm.confirmPassword} onChange={(value) => handleRegisterChange('confirmPassword', value)} placeholder="Repeat password" />
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--primary)] to-[var(--accent-purple)] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_0_32px_rgba(255,45,120,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy ? <Spinner /> : null}
                      Create Account
                    </button>
                  </motion.form>
                ) : (
                  <motion.form
                    key="login-form"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -18 }}
                    transition={{ duration: 0.25 }}
                    onSubmit={submitLogin}
                    className="space-y-4"
                  >
                    <Field
                      label="Email"
                      type="email"
                      value={loginForm.email}
                      onChange={(value) => handleLoginChange('email', value)}
                      placeholder="user@gmail.com"
                    />
                    <Field
                      label="Password"
                      type="password"
                      value={loginForm.password}
                      onChange={(value) => handleLoginChange('password', value)}
                      placeholder="Enter password"
                    />

                    <button
                      type="submit"
                      disabled={busy}
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--primary)] to-[var(--accent-purple)] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_0_32px_rgba(255,45,120,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy ? <Spinner /> : null}
                      Login
                    </button>

                    <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-slate-300">
                      Use your email and password to enter the dashboard.
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.section>
      </div>

      <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col gap-3 sm:left-auto sm:right-4 sm:w-[360px]">
        <AnimatePresence>
          {toasts.map((toast) => (
            <AuthToast key={toast.id} toast={toast} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-[#0A0A0F]/70 px-4 py-3.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-[var(--primary)]/50 focus:ring-2 focus:ring-[var(--primary)]/20"
      />
    </label>
  );
}
