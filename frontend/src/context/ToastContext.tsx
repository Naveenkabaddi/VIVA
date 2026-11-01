import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "../lib/utils";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), 5200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 text-sm shadow-soft animate-fade-up",
              item.kind === "success" &&
                "border-emerald-200 bg-white text-emerald-800 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200",
              item.kind === "error" &&
                "border-rose-200 bg-white text-rose-800 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-200",
              item.kind === "info" &&
                "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
            )}
            role="status"
          >
            {item.kind === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            {item.kind === "error" && <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            {item.kind === "info" && <Info className="mt-0.5 h-4 w-4 shrink-0" />}
            <p className="flex-1 leading-relaxed">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="rounded p-0.5 opacity-60 transition hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
