'use client';

import { useEffect } from 'react';

/** Minimal modal — backdrop + centered panel, Escape to close. */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="animate-enter fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Double-bezel glass panel — matches the Panel primitive in components/ui */}
      <div
        className="w-full max-w-lg rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b]">
          <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
            <h2 className="text-sm font-semibold tracking-tight text-neutral-200">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xs text-neutral-500 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/20 hover:bg-white/[0.08] hover:text-neutral-200 active:scale-[0.94]"
              aria-label="close"
            >
              ✕
            </button>
          </header>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
