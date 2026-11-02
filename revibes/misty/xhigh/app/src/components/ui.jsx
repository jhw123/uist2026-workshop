import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function Toggle({ on, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-[#d9d6ec]" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full shadow transition-transform ${
          on ? "translate-x-[22px] bg-[#2d2b3a]" : "translate-x-0.5 bg-white"
        }`}
      />
    </button>
  );
}

export function Spinner({ className = "h-4 w-4" }) {
  return <Loader2 className={`misty-spin ${className}`} />;
}

export function Elapsed({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return null;
  return <span>{Math.max(0, Math.round((now - since) / 1000))}s</span>;
}

export function Modal({ children, onClose, className = "" }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f1d2b]/30 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={className} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Toasts({ toasts, dismiss }) {
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto max-w-xl cursor-pointer rounded-lg px-4 py-2 text-sm shadow-lg ${
            t.kind === "error" ? "bg-red-600 text-white" : "bg-[#2d2b3a] text-white"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
