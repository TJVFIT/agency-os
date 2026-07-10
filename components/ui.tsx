'use client';

/**
 * Shared UI primitives — Ethereal Glass design system (see app/globals.css).
 * Dense, dark, premium: hairline borders, layered translucent surfaces,
 * double-bezel panels, spring-physics motion. Every route composes these;
 * the exported APIs are stable — pages get the look for free.
 */

import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BTN: Record<ButtonVariant, string> = {
  primary:
    'bg-neutral-50 text-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(255,255,255,0.08)] hover:bg-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_6px_24px_rgba(255,255,255,0.14)]',
  secondary:
    'border border-white/10 bg-white/[0.04] text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-white/20 hover:bg-white/[0.08]',
  ghost: 'text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100',
  danger:
    'border border-red-500/25 bg-red-500/10 text-red-200 hover:border-red-500/40 hover:bg-red-500/20',
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    /** Optional trailing glyph rendered in its own nested circle. */
    icon?: React.ReactNode;
  }
>(function Button(
  { variant = 'secondary', className = '', icon, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`group inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${BTN[variant]} ${className}`}
      {...props}
    >
      {children}
      {icon && (
        <span
          className={`-mr-1.5 ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] transition-transform duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.1)] group-hover:translate-x-0.5 ${
            variant === 'primary' ? 'bg-black/10' : 'bg-white/10'
          }`}
        >
          {icon}
        </span>
      )}
    </button>
  );
});

const FIELD_BASE =
  'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-neutral-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-neutral-600 hover:border-white/15 focus:border-indigo-300/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(129,140,248,0.12)]';

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = '', ...props }, ref) {
  return (
    <input ref={ref} className={`${FIELD_BASE} ${className}`} {...props} />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = '', ...props }, ref) {
  return (
    <textarea ref={ref} className={`${FIELD_BASE} ${className}`} {...props} />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = '', children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={`rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-sm text-neutral-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/15 focus:border-indigo-300/40 [&>option]:bg-neutral-900 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
});

export function Label({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500 ${className}`}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

/** Double-bezel panel: gradient hairline shell around a solid inner core. */
export function Panel({
  title,
  children,
  actions,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] ${className}`}
    >
      <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b]">
        {(title || actions) && (
          <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
            {title && (
              <h2 className="text-sm font-semibold tracking-tight text-neutral-200">
                {title}
              </h2>
            )}
            {actions}
          </header>
        )}
        <div className="p-4">{children}</div>
      </div>
    </section>
  );
}

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="animate-enter mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight text-neutral-50">
        {title}
      </h1>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}
