import { useState, useCallback } from 'react';

/**
 * Toast notification context and hook
 * Usage: const { showToast } = useToast();
 * showToast('Success message', 'success');
 */

let toastId = 0;

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = toastId++;
    const newToast = { id, message, type, duration };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}

/**
 * Toast Container - Render all active toasts
 */
export function ToastContainer({ toasts, removeToast }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 space-y-2 pointer-events-none">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          toast={toast}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

/**
 * Toast - Individual toast notification
 */
function Toast({ toast, onClose }) {
  const getStyles = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300';
      case 'error':
        return 'bg-red-500/20 border-red-500/30 text-red-300';
      case 'warning':
        return 'bg-amber-500/20 border-amber-500/30 text-amber-300';
      case 'info':
      default:
        return 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300';
    }
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  return (
    <div
      className={`
        pointer-events-auto animate-in slide-in-from-right-5 fade-in
        rounded-2xl border px-4 py-3 text-sm font-medium backdrop-blur-lg
        flex items-center gap-3 transition duration-300
        ${getStyles()}
      `}
    >
      <span className="text-lg">{getIcon()}</span>
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={onClose}
        className="ml-2 rounded-full p-1 hover:bg-white/10 transition"
      >
        ✕
      </button>
    </div>
  );
}
