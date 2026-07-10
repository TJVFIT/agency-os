import { tr } from '@/lib/i18n/tr';
import { loginAction } from './actions';

export const metadata = { title: `${tr.auth.login} — ${tr.appName}` };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="animate-enter w-full max-w-sm rounded-[1.75rem] bg-gradient-to-b from-white/[0.12] via-white/[0.05] to-white/[0.02] p-px shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)]">
        <div className="rounded-[calc(1.75rem-1px)] bg-[#09090b]/95 p-8">
          <span className="mb-4 inline-block rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
            {tr.appName}
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-50">
            {tr.auth.loginTitle}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {tr.auth.loginSubtitle}
          </p>

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {tr.auth.loginFailed}
            </p>
          )}

          <form
            action={loginAction}
            className="stagger-children mt-6 space-y-4"
          >
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                {tr.auth.email}
              </span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-neutral-600 hover:border-white/15 focus:border-indigo-300/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(129,140,248,0.12)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                {tr.auth.password}
              </span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-neutral-600 hover:border-white/15 focus:border-indigo-300/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(129,140,248,0.12)]"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-full bg-neutral-50 px-3 py-2.5 text-sm font-medium text-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_32px_rgba(255,255,255,0.08)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_12px_40px_rgba(255,255,255,0.16)] active:scale-[0.98]"
            >
              {tr.auth.login}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
