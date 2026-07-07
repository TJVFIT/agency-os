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
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-8">
        <h1 className="text-xl font-semibold text-neutral-50">
          {tr.auth.loginTitle}
        </h1>
        <p className="mt-1 text-sm text-neutral-400">{tr.auth.loginSubtitle}</p>

        {error && (
          <p className="mt-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {tr.auth.loginFailed}
          </p>
        )}

        <form action={loginAction} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-300">
              {tr.auth.email}
            </span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-300">
              {tr.auth.password}
            </span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-white"
          >
            {tr.auth.login}
          </button>
        </form>
      </div>
    </main>
  );
}
