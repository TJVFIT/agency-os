'use client';

/**
 * Shared UI primitives — dense, dark, tool-not-marketing-site (SPEC §12).
 * Every route reuses these so the app stays visually consistent. Keep them
 * small and unopinionated; page-specific components compose them.
 */

import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BTN: Record<ButtonVariant, string> = {
  primary: 'bg-neutral-100 text-neutral-950 hover:bg-white',
  secondary:
    'border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800',
  ghost: 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200',
  danger: 'border border-red-900 bg-red-950 text-red-200 hover:bg-red-900',
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
>(function Button({ variant = 'secondary', className = '', ...props }, ref) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BTN[variant]} ${className}`}
      {...props}
    />
  );
});

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = '', ...props }, ref) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-400 ${className}`}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = '', ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={`w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-400 ${className}`}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = '', children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={`rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-400 ${className}`}
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
      className={`mb-1 block text-xs font-medium text-neutral-400 ${className}`}
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
      className={`rounded-xl border border-neutral-800 bg-neutral-900/50 ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
          {title && (
            <h2 className="text-sm font-semibold text-neutral-200">{title}</h2>
          )}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
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
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-lg font-semibold text-neutral-50">{title}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}
