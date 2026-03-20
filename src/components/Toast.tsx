"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 5000;
const MAX_VISIBLE = 3;

let nextId = 0;

// ─── Individual toast item ───────────────────────────────────────────────────

const variantStyles: Record<ToastVariant, string> = {
  success:
    "bg-green-100/90 dark:bg-green-900/90 border-green-300 dark:border-green-700 text-green-900 dark:text-green-100",
  error:
    "bg-red-100/90 dark:bg-red-900/90 border-red-300 dark:border-red-700 text-red-900 dark:text-red-100",
  info:
    "bg-gray-100/90 dark:bg-gray-800/90 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100",
};

const VariantIcon: Record<ToastVariant, typeof CheckCircleIcon> = {
  success: CheckCircleIcon,
  error: ExclamationCircleIcon,
  info: InformationCircleIcon,
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const Icon = VariantIcon[toast.variant];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, onDismiss]);

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 border rounded-xl px-4 py-3 shadow-lg backdrop-blur-sm animate-slide-in ${variantStyles[toast.variant]}`}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <p className="text-sm flex-1">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="flex-shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = `toast-${++nextId}`;
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message, variant }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container — bottom-center on mobile, top-right on desktop */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed z-50 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm
            bottom-20 left-1/2 -translate-x-1/2
            md:bottom-auto md:top-4 md:right-4 md:left-auto md:translate-x-0"
        >
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
