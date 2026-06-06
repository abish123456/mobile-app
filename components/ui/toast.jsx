'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, X, AlertCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

const TOAST_DURATION = 3000; // 3 seconds

export function Toast({ message, type = 'info', onClose, id }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose?.(id), 300); // Wait for fade out animation
    }, TOAST_DURATION);

    return () => clearTimeout(timer);
  }, [id, onClose]);

  const icons = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertCircle,
    info: Info,
  };

  const styles = {
    success: 'text-green-600',
    error: 'text-destructive',
    warning: 'text-yellow-600',
    info: 'text-blue-600',
  };

  const Icon = icons[type] || Info;

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg w-full transition-all duration-300',
        styles[type],
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      )}
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(() => onClose?.(id), 300);
        }}
        className="flex-shrink-0 hover:opacity-70 transition-opacity"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onRemove }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 sm:top-20 right-2 sm:right-4 left-2 sm:left-auto bottom-20 sm:bottom-auto z-50 flex flex-col gap-2 pointer-events-none max-w-sm sm:max-w-md items-end sm:items-stretch">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto w-full">
          <Toast
            id={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={onRemove}
          />
        </div>
      ))}
    </div>
  );
}

// Hook for using toasts
export function useToast() {
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    return id;
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const success = (message) => showToast(message, 'success');
  const error = (message) => showToast(message, 'error');
  const warning = (message) => showToast(message, 'warning');
  const info = (message) => showToast(message, 'info');

  return {
    toasts,
    showToast,
    removeToast,
    success,
    error,
    warning,
    info,
    ToastContainer: () => <ToastContainer toasts={toasts} onRemove={removeToast} />,
  };
}

